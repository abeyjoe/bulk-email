import { prisma } from '../db/prisma';
import { SuppressionService } from '../compliance/suppression.service';
import { DeliveryEventType, SuppressionReason, CampaignRecipientStatus } from '@prisma/client';

export class SesWebhookService {
  /**
   * Process raw SNS notification envelope or direct SES event payload
   */
  static async handleIncomingNotification(body: any): Promise<{ handled: boolean; eventType?: string }> {
    let payload = body;

    // Handle AWS SNS wrapper
    if (typeof body === 'string') {
      try {
        payload = JSON.parse(body);
      } catch (e) {
        throw new Error('Malformed JSON webhook body');
      }
    }

    // Check if this is an SNS SubscriptionConfirmation request
    if (payload.Type === 'SubscriptionConfirmation' && payload.SubscribeURL) {
      console.log(`[SES/SNS Webhook] Received subscription confirmation: ${payload.SubscribeURL}`);
      return { handled: true, eventType: 'SubscriptionConfirmation' };
    }

    // If wrapped in SNS Notification
    if (payload.Type === 'Notification' && payload.Message) {
      try {
        payload = JSON.parse(payload.Message);
      } catch (e) {
        // payload remains as is
      }
    }

    const eventType = payload.eventType || payload.notificationType;
    if (!eventType) {
      return { handled: false };
    }

    const mail = payload.mail || {};
    const messageId = mail.messageId;
    const commonHeaders = mail.commonHeaders || {};
    const headers = mail.headers || [];

    // Extract custom headers
    let campaignId: string | undefined;
    let recipientId: string | undefined;

    if (Array.isArray(headers)) {
      for (const h of headers) {
        if (h.name?.toLowerCase() === 'x-bulkemail-campaign-id') campaignId = h.value;
        if (h.name?.toLowerCase() === 'x-bulkemail-recipient-id') recipientId = h.value;
      }
    }

    // If not found in headers, lookup by providerMessageId in campaign_recipients
    if (!campaignId && messageId) {
      const cr = await prisma.campaignRecipient.findFirst({
        where: { providerMessageId: messageId },
        select: { campaignId: true, recipientId: true },
      });
      if (cr) {
        campaignId = cr.campaignId;
        recipientId = cr.recipientId;
      }
    }

    switch (eventType) {
      case 'Bounce': {
        const bounce = payload.bounce || {};
        const isPermanent = bounce.bounceType === 'Permanent';
        const recipients = bounce.bouncedRecipients || [];

        for (const r of recipients) {
          const email = (r.emailAddress || '').toLowerCase().trim();
          if (!email) continue;

          if (isPermanent) {
            // Hard bounce: permanently suppress
            await SuppressionService.suppress(email, SuppressionReason.HARD_BOUNCE, 'SES_BOUNCE', {
              bounceType: bounce.bounceType,
              bounceSubType: bounce.bounceSubType,
              diagnosticCode: r.diagnosticCode,
              feedbackId: bounce.feedbackId,
            });
          }

          // Update campaign stats
          if (campaignId) {
            await Promise.all([
              prisma.campaign.update({
                where: { id: campaignId },
                data: { bouncedCount: { increment: 1 } },
              }).catch(() => {}),
              prisma.campaignRecipient.updateMany({
                where: { campaignId, email },
                data: {
                  status: CampaignRecipientStatus.BOUNCED,
                  error: r.diagnosticCode || `${bounce.bounceType} Bounce`,
                },
              }),
            ]);
          }

          // Record delivery event
          await prisma.emailDeliveryEvent.create({
            data: {
              campaignId,
              recipientId,
              email,
              eventType: isPermanent ? DeliveryEventType.HARD_BOUNCE : DeliveryEventType.SOFT_BOUNCE,
              providerMessageId: messageId,
              rawPayload: payload,
              occurredAt: new Date(bounce.timestamp || Date.now()),
            },
          });
        }
        break;
      }

      case 'Complaint': {
        const complaint = payload.complaint || {};
        const recipients = complaint.complainedRecipients || [];

        for (const r of recipients) {
          const email = (r.emailAddress || '').toLowerCase().trim();
          if (!email) continue;

          // Always permanently suppress spam complainants!
          await SuppressionService.suppress(email, SuppressionReason.COMPLAINT, 'SES_COMPLAINT', {
            complaintFeedbackType: complaint.complaintFeedbackType,
            feedbackId: complaint.feedbackId,
          });

          // Update campaign stats
          if (campaignId) {
            await Promise.all([
              prisma.campaign.update({
                where: { id: campaignId },
                data: { complaintCount: { increment: 1 } },
              }).catch(() => {}),
              prisma.campaignRecipient.updateMany({
                where: { campaignId, email },
                data: {
                  status: CampaignRecipientStatus.REJECTED,
                  error: 'Recipient filed spam complaint',
                },
              }),
            ]);
          }

          await prisma.emailDeliveryEvent.create({
            data: {
              campaignId,
              recipientId,
              email,
              eventType: DeliveryEventType.COMPLAINT,
              providerMessageId: messageId,
              rawPayload: payload,
              occurredAt: new Date(complaint.timestamp || Date.now()),
            },
          });
        }
        break;
      }

      case 'Delivery': {
        const delivery = payload.delivery || {};
        const recipients = delivery.recipients || [];

        for (const r of recipients) {
          const email = (r || '').toLowerCase().trim();
          if (!email) continue;

          if (campaignId) {
            await Promise.all([
              prisma.campaign.update({
                where: { id: campaignId },
                data: { deliveredCount: { increment: 1 } },
              }).catch(() => {}),
              prisma.campaignRecipient.updateMany({
                where: { campaignId, email },
                data: {
                  status: CampaignRecipientStatus.DELIVERED,
                  deliveredAt: new Date(delivery.timestamp || Date.now()),
                },
              }),
            ]);
          }

          await prisma.emailDeliveryEvent.create({
            data: {
              campaignId,
              recipientId,
              email,
              eventType: DeliveryEventType.DELIVERED,
              providerMessageId: messageId,
              rawPayload: payload,
              occurredAt: new Date(delivery.timestamp || Date.now()),
            },
          });
        }
        break;
      }

      case 'Open': {
        const open = payload.open || {};
        const email = (mail.destination?.[0] || '').toLowerCase().trim();

        if (campaignId && email) {
          await prisma.campaignRecipient.updateMany({
            where: { campaignId, email },
            data: { openedAt: new Date(open.timestamp || Date.now()) },
          });
        }

        await prisma.emailDeliveryEvent.create({
          data: {
            campaignId,
            recipientId,
            email,
            eventType: DeliveryEventType.OPEN,
            providerMessageId: messageId,
            rawPayload: payload,
            occurredAt: new Date(open.timestamp || Date.now()),
          },
        });
        break;
      }

      case 'Click': {
        const click = payload.click || {};
        const email = (mail.destination?.[0] || '').toLowerCase().trim();

        if (campaignId && email) {
          await prisma.campaignRecipient.updateMany({
            where: { campaignId, email },
            data: { clickedAt: new Date(click.timestamp || Date.now()) },
          });
        }

        await prisma.emailDeliveryEvent.create({
          data: {
            campaignId,
            recipientId,
            email,
            eventType: DeliveryEventType.CLICK,
            providerMessageId: messageId,
            rawPayload: payload,
            occurredAt: new Date(click.timestamp || Date.now()),
          },
        });
        break;
      }

      default:
        console.log(`[SES Webhook] Unhandled event type: ${eventType}`);
    }

    return { handled: true, eventType };
  }
}
