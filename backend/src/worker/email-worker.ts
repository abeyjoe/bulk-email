import { getQueueService } from '../queue';
import { providerRegistry } from '../providers/provider-registry.service';
import { providerRouter } from '../routing/provider-router.service';
import { quotaManager } from '../quota/quota-manager.service';
import { multiRateLimiter } from '../limiter/multi-rate-limiter.service';
import { SuppressionService } from '../compliance/suppression.service';
import { prisma } from '../db/prisma';
import { QueueJob } from '../queue/queue.interface';
import { CampaignStatus, CampaignRecipientStatus, DeliveryEventType, SuppressionReason } from '@prisma/client';
import { config } from '../config';
import { EmailProvider } from '../providers/provider.interface';

export class EmailWorker {
  private workerId: string;
  private isRunning: boolean = false;
  private concurrency: number;
  private activeJobsCount: number = 0;
  private processedCount: number = 0;

  constructor(workerId?: string, concurrency?: number) {
    this.workerId = workerId || `worker-${process.pid}-${Math.random().toString(36).substring(7)}`;
    this.concurrency = concurrency || config.worker.concurrency;
  }

  public getStatus() {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      concurrency: this.concurrency,
      activeJobs: this.activeJobsCount,
      totalProcessed: this.processedCount,
      limiterStats: multiRateLimiter.getStatus(),
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Worker ${this.workerId}] Starting multi-provider worker with concurrency ${this.concurrency}...`);

    this.runLoop().catch((err) => {
      console.error(`[Worker ${this.workerId}] Fatal error in runLoop:`, err);
    });
  }

  public stop(): void {
    console.log(`[Worker ${this.workerId}] Initiating graceful shutdown...`);
    this.isRunning = false;
  }

  private async runLoop(): Promise<void> {
    const queue = getQueueService();

    while (this.isRunning) {
      try {
        const availableSlots = this.concurrency - this.activeJobsCount;
        if (availableSlots <= 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        const batchSize = Math.min(availableSlots, config.worker.batchSize);
        const jobs = await queue.dequeue(batchSize, this.workerId);

        if (jobs.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, config.worker.pollIntervalMs));
          continue;
        }

        for (const job of jobs) {
          this.activeJobsCount++;
          this.processJob(job)
            .catch((err) => {
              console.error(`[Worker ${this.workerId}] Unhandled job error for ${job.id}:`, err);
            })
            .finally(() => {
              this.activeJobsCount--;
              this.processedCount++;
            });
        }
      } catch (err) {
        console.error(`[Worker ${this.workerId}] Error in job dequeue loop:`, err);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`[Worker ${this.workerId}] Shutdown complete. Total jobs processed: ${this.processedCount}`);
  }

  private async processJob(job: QueueJob): Promise<void> {
    const queue = getQueueService();

    try {
      // 1. Fetch current campaign status & safety circuit breaker check
      const campaign = await prisma.campaign.findUnique({
        where: { id: job.campaignId },
        select: {
          id: true,
          status: true,
          name: true,
          bounceThreshold: true,
          complaintThreshold: true,
          acceptedCount: true,
          bouncedCount: true,
          complaintCount: true,
          maxSendingRate: true,
        },
      });

      if (!campaign) {
        await queue.ack(job);
        return;
      }

      if (campaign.status === CampaignStatus.PAUSED || campaign.status === CampaignStatus.CANCELLED) {
        if (campaign.status === CampaignStatus.CANCELLED) {
          await queue.ack(job);
          await prisma.campaignRecipient.updateMany({
            where: { campaignId: job.campaignId, recipientId: job.recipientId },
            data: { status: CampaignRecipientStatus.REJECTED, error: 'Campaign was cancelled' },
          });
          if (job.payload.reservationId) {
            await quotaManager.releaseQuota(job.payload.reservationId, 1);
          }
        } else {
          await queue.nack(job, 'Campaign currently paused', 60);
        }
        return;
      }

      // 2. Automated Reputation Circuit Breaker
      if (campaign.acceptedCount >= 20) {
        const bounceRate = (campaign.bouncedCount / campaign.acceptedCount) * 100;
        const complaintRate = (campaign.complaintCount / campaign.acceptedCount) * 100;

        if (bounceRate >= campaign.bounceThreshold || complaintRate >= campaign.complaintThreshold) {
          const pauseReason = `Safety Threshold Breached: Bounce Rate ${bounceRate.toFixed(2)}% (limit ${campaign.bounceThreshold}%) or Complaint Rate ${complaintRate.toFixed(2)}% (limit ${campaign.complaintThreshold}%). Campaign automatically halted to protect domain reputation.`;

          console.warn(`[Worker Safety Circuit Breaker] Pausing campaign ${campaign.name}: ${pauseReason}`);

          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: CampaignStatus.PAUSED,
              safetyPausedReason: pauseReason,
            },
          });

          await queue.nack(job, pauseReason, 300);
          return;
        }
      }

      // 3. Real-Time Permanent Suppression Check
      const isSuppressed = await SuppressionService.isSuppressed(job.email);
      if (isSuppressed) {
        console.log(`[Worker ${this.workerId}] Skipping suppressed recipient ${job.email}`);
        await queue.ack(job);

        await Promise.all([
          prisma.campaignRecipient.updateMany({
            where: { campaignId: job.campaignId, recipientId: job.recipientId },
            data: {
              status: CampaignRecipientStatus.SUPPRESSED,
              error: 'Recipient is on permanent suppression list',
            },
          }),
          prisma.campaign.update({
            where: { id: job.campaignId },
            data: { excludedRecipients: { increment: 1 } },
          }),
        ]);

        if (job.payload.reservationId) {
          await quotaManager.releaseQuota(job.payload.reservationId, 1);
        }
        return;
      }

      // 4. Resolve Provider Adapter
      const provider = await this.resolveProvider(job);

      // 5. Rate Limiter Permit Acquisition (Per-provider token bucket)
      await multiRateLimiter.acquire(provider.id, 1);

      // 6. Send via Provider API
      const result = await provider.send({
        to: job.payload.to,
        from: job.payload.from,
        replyTo: job.payload.replyTo,
        subject: job.payload.subject,
        html: job.payload.html,
        text: job.payload.text,
        headers: job.payload.headers,
        campaignId: job.campaignId,
        recipientId: job.recipientId,
        jobId: job.id,
      });

      if (result.success) {
        // Success: Acknowledge job and commit quota
        await queue.ack(job);

        if (job.payload.reservationId) {
          await quotaManager.commitQuota(job.payload.reservationId, 1);
        }

        const costUsd = result.costEstimateUsd || 0.0;

        await Promise.all([
          prisma.campaignRecipient.updateMany({
            where: { campaignId: job.campaignId, recipientId: job.recipientId },
            data: {
              status: CampaignRecipientStatus.ACCEPTED,
              providerMessageId: result.messageId,
              sentAt: result.timestamp,
              error: null,
            },
          }),
          prisma.campaign.update({
            where: { id: job.campaignId },
            data: { acceptedCount: { increment: 1 } },
          }),
          prisma.emailDeliveryEvent.create({
            data: {
              campaignId: job.campaignId,
              recipientId: job.recipientId,
              email: job.email,
              eventType: DeliveryEventType.ACCEPTED,
              providerMessageId: result.messageId,
              providerAccountId: provider.id,
              costUsd,
              occurredAt: result.timestamp,
            },
          }),
        ]);

        this.checkCampaignCompletion(job.campaignId).catch(() => {});
      } else {
        // Delivery Failed
        if (result.isTransient || result.rateLimited) {
          // 7. Failover Circuit: Handle 429 rate limit or transient provider outage
          if (result.rateLimited) {
            const cooldownSec = result.retryAfterMs ? result.retryAfterMs / 1000 : 30;
            multiRateLimiter.reportRateLimitHit(provider.id, cooldownSec);
          }

          // Record provider failure
          await prisma.providerAccount.update({
            where: { id: provider.id },
            data: {
              consecutiveFailures: { increment: 1 },
            },
          }).catch(() => {});

          // Check if retry budget allows failover
          if (job.attempts < job.maxAttempts) {
            const failover = await providerRouter.selectFailoverProvider(provider.id, job.campaignId);

            if (failover) {
              console.warn(
                `[Worker Failover] Re-routing job ${job.id} for ${job.email} from ${provider.id} -> ${failover.providerId} (${result.error})`
              );

              // Release old reservation
              if (job.payload.reservationId) {
                await quotaManager.releaseQuota(job.payload.reservationId, 1);
              }

              // Update job payload with new provider and lease
              job.payload.assignedProviderId = failover.providerId;
              job.payload.reservationId = failover.reservationId;

              await prisma.emailJob.update({
                where: { id: job.id },
                data: {
                  assignedProviderId: failover.providerId,
                  payload: job.payload,
                },
              }).catch(() => {});

              await queue.nack(job, `Failover to ${failover.providerId}: ${result.error}`, 2);
              return;
            }
          }

          if (/outgoing mail.*suspended|exceeded the max emails/i.test(result.error || '')) {
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                status: CampaignStatus.PAUSED,
                safetyPausedReason: `SMTP Server Notice: ${result.error}. Unsuspend outgoing mail in cPanel/WHM and click Resume.`,
              },
            }).catch(() => {});
          }

          // Fallback standard nack retry if no alternative provider
          console.warn(`[Worker ${this.workerId}] Transient error sending to ${job.email}: ${result.error}`);
          await queue.nack(job, result.error || 'Transient provider error', 30);
        } else {
          // 8. Permanent Failure: Hard bounce or explicit provider rejection
          console.error(`[Worker ${this.workerId}] Hard failure sending to ${job.email}: ${result.error}`);
          await queue.ack(job);

          if (job.payload.reservationId) {
            await quotaManager.releaseQuota(job.payload.reservationId, 1);
          }

          await Promise.all([
            prisma.campaignRecipient.updateMany({
              where: { campaignId: job.campaignId, recipientId: job.recipientId },
              data: {
                status: CampaignRecipientStatus.REJECTED,
                error: result.error,
              },
            }),
            prisma.campaign.update({
              where: { id: job.campaignId },
              data: { bouncedCount: { increment: 1 } },
            }),
            prisma.emailDeliveryEvent.create({
              data: {
                campaignId: job.campaignId,
                recipientId: job.recipientId,
                email: job.email,
                eventType: DeliveryEventType.REJECTION,
                providerAccountId: provider.id,
                rawPayload: { error: result.error, errorCode: result.errorCode },
                occurredAt: new Date(),
              },
            }),
          ]);

          // Auto-suppress permanent bounce
          if (result.error && (result.error.includes('550') || result.error.includes('suppress') || result.errorCode === 'HARD_BOUNCE')) {
            await SuppressionService.suppress(
              job.email,
              SuppressionReason.HARD_BOUNCE,
              'PROVIDER_REJECTION',
              { error: result.error, provider: provider.name }
            );
          }
        }
      }
    } catch (err: any) {
      console.error(`[Worker ${this.workerId}] Unexpected error processing job ${job.id}:`, err);
      await queue.nack(job, err.message || 'Worker processing exception');
    }
  }

  private async resolveProvider(job: QueueJob): Promise<EmailProvider> {
    const assignedId = job.payload.assignedProviderId;
    if (assignedId) {
      try {
        return await providerRegistry.getProvider(assignedId);
      } catch (err) {
        console.warn(`[Worker] Assigned provider ${assignedId} unavailable, falling back to default`);
      }
    }

    return await providerRegistry.getDefaultProvider();
  }

  private async checkCampaignCompletion(campaignId: string): Promise<void> {
    const queue = getQueueService();
    const stats = await queue.getStats(campaignId);

    if (stats.pending === 0 && stats.processing === 0) {
      await prisma.campaign.updateMany({
        where: { id: campaignId, status: CampaignStatus.RUNNING },
        data: {
          status: CampaignStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      console.log(`[Worker] Campaign ${campaignId} completed!`);
    }
  }
}
