import { getQueueService } from '../queue';
import { getEmailProvider } from '../providers';
import { SuppressionService } from '../compliance/suppression.service';
import { globalRateLimiter } from '../limiter/rate-limiter.service';
import { prisma } from '../db/prisma';
import { QueueJob } from '../queue/queue.interface';
import { CampaignStatus, CampaignRecipientStatus, DeliveryEventType, SuppressionReason } from '@prisma/client';
import { config } from '../config';

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
      rateLimitPerSec: globalRateLimiter.getRate(),
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Worker ${this.workerId}] Starting with concurrency ${this.concurrency}...`);

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
        // Calculate available capacity based on concurrency limit
        const availableSlots = this.concurrency - this.activeJobsCount;
        if (availableSlots <= 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        const batchSize = Math.min(availableSlots, config.worker.batchSize);
        const jobs = await queue.dequeue(batchSize, this.workerId);

        if (jobs.length === 0) {
          // No jobs currently available, wait before polling again
          await new Promise((resolve) => setTimeout(resolve, config.worker.pollIntervalMs));
          continue;
        }

        // Process jobs concurrently up to concurrency limit
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
    const provider = getEmailProvider();

    try {
      // 1. Fetch current campaign status & safety threshold check
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
        // Campaign was deleted, acknowledge job and discard
        await queue.ack(job);
        return;
      }

      // Check if campaign is paused or cancelled
      if (campaign.status === CampaignStatus.PAUSED || campaign.status === CampaignStatus.CANCELLED) {
        // Put job back into queue for later or discard if cancelled
        if (campaign.status === CampaignStatus.CANCELLED) {
          await queue.ack(job);
          await prisma.campaignRecipient.updateMany({
            where: { campaignId: job.campaignId, recipientId: job.recipientId },
            data: { status: CampaignRecipientStatus.REJECTED, error: 'Campaign was cancelled' },
          });
        } else {
          await queue.nack(job, 'Campaign currently paused', 60);
        }
        return;
      }

      // 2. Automated Circuit Breaker / Safety Check
      // If bounce rate > threshold or complaints > threshold, auto-pause campaign!
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

      // 3. Check Real-Time Suppression Status
      const isSuppressed = await SuppressionService.isSuppressed(job.email);
      if (isSuppressed) {
        console.log(`[Worker ${this.workerId}] Skipping suppressed recipient ${job.email}`);
        await queue.ack(job);
        await prisma.campaignRecipient.updateMany({
          where: { campaignId: job.campaignId, recipientId: job.recipientId },
          data: {
            status: CampaignRecipientStatus.SUPPRESSED,
            error: 'Recipient is on permanent suppression list',
          },
        });
        await prisma.campaign.update({
          where: { id: job.campaignId },
          data: { excludedRecipients: { increment: 1 } },
        });
        return;
      }

      // 4. Shared Rate Limiter Permit Acquisition
      await globalRateLimiter.acquire(1);

      // 5. Send via Provider API
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
      });

      if (result.success) {
        // Success: record acceptance by provider
        await queue.ack(job);

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
              occurredAt: result.timestamp,
            },
          }),
        ]);

        // Check if all queued jobs for campaign have finished
        this.checkCampaignCompletion(job.campaignId).catch(() => {});
      } else {
        // Delivery failed
        if (result.isTransient) {
          // Temporary error, retry with exponential backoff
          console.warn(`[Worker ${this.workerId}] Transient error sending to ${job.email}: ${result.error}`);
          await queue.nack(job, result.error || 'Transient provider error');
        } else {
          // Permanent failure or hard bounce from provider
          console.error(`[Worker ${this.workerId}] Hard failure sending to ${job.email}: ${result.error}`);
          await queue.ack(job); // Do not retry permanent failure

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
                rawPayload: { error: result.error },
                occurredAt: new Date(),
              },
            }),
          ]);

          // If provider error is a suppression or hard bounce, auto-suppress
          if (result.error && (result.error.includes('550') || result.error.includes('suppress'))) {
            await SuppressionService.suppress(
              job.email,
              SuppressionReason.HARD_BOUNCE,
              'PROVIDER_REJECTION',
              { error: result.error }
            );
          }
        }
      }
    } catch (err: any) {
      console.error(`[Worker ${this.workerId}] Unexpected error processing job ${job.id}:`, err);
      await queue.nack(job, err.message || 'Worker processing exception');
    }
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
