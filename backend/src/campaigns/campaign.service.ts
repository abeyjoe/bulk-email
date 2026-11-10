import { prisma } from '../db/prisma';
import { getQueueService } from '../queue';
import { getEmailProvider } from '../providers';
import { SuppressionService } from '../compliance/suppression.service';
import { UnsubscribeService } from '../compliance/unsubscribe.service';
import { TemplateEngine } from '../templates/template-engine';
import { globalRateLimiter } from '../limiter/rate-limiter.service';
import { CampaignStatus, CampaignRecipientStatus, RecipientStatus } from '@prisma/client';
import { config } from '../config';
import crypto from 'crypto';

export interface CreateCampaignInput {
  name: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string;
  templateId?: string;
  htmlContent: string;
  plainTextContent?: string;
  targetListId?: string;
  scheduledAt?: Date;
  maxSendingRate?: number;
  bounceThreshold?: number;
  complaintThreshold?: number;
}

export class CampaignService {
  /**
   * Create a new campaign draft
   */
  static async create(data: CreateCampaignInput) {
    if (!data.name?.trim()) throw new Error('Campaign name is required');
    if (!data.subject?.trim()) throw new Error('Email subject is required');
    if (!data.senderEmail?.trim()) throw new Error('Sender email is required');
    if (!data.htmlContent?.trim()) throw new Error('Email HTML content is required');

    return prisma.campaign.create({
      data: {
        name: data.name.trim(),
        subject: data.subject.trim(),
        senderName: data.senderName?.trim() || 'Bulk Email Sender',
        senderEmail: data.senderEmail.toLowerCase().trim(),
        replyTo: data.replyTo?.trim() || null,
        templateId: data.templateId || null,
        htmlContent: data.htmlContent,
        plainTextContent: data.plainTextContent || null,
        targetListId: data.targetListId || null,
        scheduledAt: data.scheduledAt || null,
        maxSendingRate: data.maxSendingRate || 5.0,
        bounceThreshold: data.bounceThreshold || 5.0,
        complaintThreshold: data.complaintThreshold || 0.1,
        status: data.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      },
    });
  }

  /**
   * Pre-campaign validation & review:
   * Counts eligible vs excluded (suppressed/unsubscribed/bounced) recipients
   * BEFORE launching the campaign.
   */
  static async getPreflightReview(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { targetList: true },
    });

    if (!campaign) throw new Error('Campaign not found');

    const recipientFilter: any = campaign.targetListId
      ? { listMembers: { some: { listId: campaign.targetListId } } }
      : {};

    const [totalInTarget, suppressedCount, unsubscribedCount, bouncedCount] = await Promise.all([
      prisma.recipient.count({ where: recipientFilter }),
      prisma.recipient.count({ where: { ...recipientFilter, status: RecipientStatus.SUPPRESSED } }),
      prisma.recipient.count({ where: { ...recipientFilter, status: RecipientStatus.UNSUBSCRIBED } }),
      prisma.recipient.count({ where: { ...recipientFilter, status: RecipientStatus.BOUNCED } }),
    ]);

    const excludedCount = suppressedCount + unsubscribedCount + bouncedCount;
    const eligibleCount = Math.max(0, totalInTarget - excludedCount);

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      sender: `${campaign.senderName} <${campaign.senderEmail}>`,
      subject: campaign.subject,
      targetList: campaign.targetList?.name || 'All Registered Recipients',
      totalRecipients: totalInTarget,
      eligibleRecipients: eligibleCount,
      excludedRecipients: excludedCount,
      excludedBreakdown: {
        suppressed: suppressedCount,
        unsubscribed: unsubscribedCount,
        bounced: bouncedCount,
      },
      maxSendingRate: campaign.maxSendingRate,
      bounceThreshold: campaign.bounceThreshold,
      complaintThreshold: campaign.complaintThreshold,
    };
  }

  /**
   * Launch Campaign:
   * Asynchronously generates recipient jobs and pushes them to persistent queue in batches.
   * Completely decoupled from frontend request cycle.
   */
  static async launchCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === CampaignStatus.RUNNING || campaign.status === CampaignStatus.QUEUING) {
      throw new Error('Campaign is already active or in queue');
    }

    // Set status to QUEUING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.QUEUING,
        startedAt: new Date(),
        safetyPausedReason: null,
      },
    });

    // Update global rate limiter to match campaign setting
    if (campaign.maxSendingRate) {
      globalRateLimiter.setRate(campaign.maxSendingRate);
    }

    // Run enqueueing in background worker/promise so API returns immediately!
    setImmediate(async () => {
      try {
        await this.enqueueCampaignRecipients(campaignId);
      } catch (err) {
        console.error(`[Campaign Launch] Failed to enqueue campaign ${campaignId}:`, err);
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.PAUSED, safetyPausedReason: 'Enqueueing failed' },
        });
      }
    });

    return {
      success: true,
      message: `Campaign '${campaign.name}' queued successfully. Background distribution engine is dispatching jobs to workers.`,
    };
  }

  /**
   * Stream recipients in database chunks (1,000 at a time),
   * personalize content, and publish to the queue without memory overload.
   */
  private static async enqueueCampaignRecipients(campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return;

    const queue = getQueueService();
    const recipientFilter: any = campaign.targetListId
      ? { listMembers: { some: { listId: campaign.targetListId } } }
      : {};

    const totalInList = await prisma.recipient.count({ where: recipientFilter });

    let eligibleCount = 0;
    let excludedCount = 0;
    let queuedCount = 0;

    const CHUNK_SIZE = 1000;
    let cursor: string | undefined = undefined;

    while (true) {
      const recipients: any[] = await prisma.recipient.findMany({
        where: recipientFilter,
        take: CHUNK_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
      });

      if (recipients.length === 0) break;
      cursor = recipients[recipients.length - 1].id;

      // Extract emails and bulk check suppression
      const emails = recipients.map((r) => r.email.toLowerCase().trim());
      const suppressedSet = await SuppressionService.getSuppressedEmailSet(emails);

      const queueJobs: any[] = [];
      const campaignRecipientEntries: any[] = [];

      for (const recipient of recipients) {
        const email = recipient.email.toLowerCase().trim();

        // Exclude if suppressed or unsubscribed or bounced
        if (
          suppressedSet.has(email) ||
          recipient.status === RecipientStatus.SUPPRESSED ||
          recipient.status === RecipientStatus.UNSUBSCRIBED ||
          recipient.status === RecipientStatus.BOUNCED
        ) {
          excludedCount++;
          campaignRecipientEntries.push({
            campaignId,
            recipientId: recipient.id,
            email,
            status: CampaignRecipientStatus.SUPPRESSED,
            error: 'Excluded prior to enqueue: on suppression list',
          });
          continue;
        }

        eligibleCount++;

        // Personalization
        const unsubscribeUrl = UnsubscribeService.generateUnsubscribeUrl(email, recipient.id, campaignId);
        const unsubscribeHeaders = UnsubscribeService.generateHeaders(email, recipient.id, campaignId);

        const context = {
          email,
          recipientId: recipient.id,
          campaignId,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          organisation: recipient.organisation,
          customFields: recipient.customFields,
          unsubscribeUrl,
        };

        const personalizedHtml = TemplateEngine.ensureComplianceFooter(campaign.htmlContent, context);
        const personalizedSubject = TemplateEngine.render(campaign.subject, context);
        const personalizedText = campaign.plainTextContent
          ? TemplateEngine.render(campaign.plainTextContent, context)
          : undefined;

        // Idempotency key prevents duplicate sends even if worker crashes or restarts
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${campaignId}:${recipient.id}:attempt-1`)
          .digest('hex');

        queueJobs.push({
          campaignId,
          recipientId: recipient.id,
          email,
          payload: {
            to: email,
            from: `${campaign.senderName} <${campaign.senderEmail}>`,
            replyTo: campaign.replyTo || undefined,
            subject: personalizedSubject,
            html: personalizedHtml,
            text: personalizedText,
            headers: unsubscribeHeaders,
          },
          idempotencyKey,
        });

        campaignRecipientEntries.push({
          campaignId,
          recipientId: recipient.id,
          email,
          status: CampaignRecipientStatus.QUEUED,
        });
      }

      // Record CampaignRecipient tracking rows
      if (campaignRecipientEntries.length > 0) {
        await prisma.campaignRecipient.createMany({
          data: campaignRecipientEntries,
          skipDuplicates: true,
        });
      }

      // Enqueue to persistent queue
      if (queueJobs.length > 0) {
        const enqueued = await queue.enqueueBatch(queueJobs);
        queuedCount += enqueued;
      }
    }

    // Transition campaign status to RUNNING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.RUNNING,
        totalRecipients: totalInList,
        eligibleRecipients: eligibleCount,
        excludedRecipients: excludedCount,
        queuedCount,
      },
    });

    console.log(
      `[Campaign Engine] Enqueued ${queuedCount} jobs for campaign '${campaign.name}' (Eligible: ${eligibleCount}, Excluded: ${excludedCount}).`
    );
  }

  /**
   * Pause an active campaign
   */
  static async pauseCampaign(campaignId: string, reason?: string) {
    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.PAUSED,
        safetyPausedReason: reason || 'Manually paused by administrator',
      },
    });
  }

  /**
   * Resume a paused campaign
   */
  static async resumeCampaign(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.maxSendingRate) {
      globalRateLimiter.setRate(campaign.maxSendingRate);
    }

    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.RUNNING,
        safetyPausedReason: null,
      },
    });
  }

  /**
   * Cancel an active or paused campaign (purges pending jobs)
   */
  static async cancelCampaign(campaignId: string) {
    const queue = getQueueService();
    await queue.purge?.(campaignId);

    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.CANCELLED,
        completedAt: new Date(),
        safetyPausedReason: 'Campaign cancelled by administrator',
      },
    });
  }

  /**
   * Send a test email to a designated address for verification
   */
  static async sendTestEmail(campaignId: string, testEmail: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const provider = getEmailProvider();
    const context = {
      email: testEmail,
      recipientId: 'test-recipient-id',
      campaignId: campaign.id,
      firstName: 'Preview',
      lastName: 'Tester',
      organisation: 'QA Organization',
      unsubscribeUrl: `${config.frontendUrl}/unsubscribe?test=true`,
    };

    const renderedSubject = `[TEST] ${TemplateEngine.render(campaign.subject, context)}`;
    const renderedHtml = TemplateEngine.ensureComplianceFooter(campaign.htmlContent, context);

    const result = await provider.send({
      to: testEmail,
      from: `${campaign.senderName} <${campaign.senderEmail}>`,
      replyTo: campaign.replyTo || undefined,
      subject: renderedSubject,
      html: renderedHtml,
      text: campaign.plainTextContent ? TemplateEngine.render(campaign.plainTextContent, context) : undefined,
    });

    return result;
  }
}
