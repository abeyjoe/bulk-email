import { EmailWorker } from '../src/worker/email-worker';
import { getQueueService } from '../src/queue';
import { prisma } from '../src/db/prisma';
import { CampaignRecipientStatus } from '@prisma/client';

describe('Safe Provider Failover Circuit in Worker', () => {
  const primaryId = 'failover-p-primary';
  const backupId = 'failover-p-backup';
  let testCampaignId: string;
  let testRecipientId: string;

  beforeAll(async () => {
    // 1. Primary provider (MOCK)
    await prisma.providerAccount.upsert({
      where: { id: primaryId },
      update: {
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
        dailyQuota: 100,
        dailyUsed: 0,
        priority: 1,
        perSecondRateLimit: 50.0,
      },
      create: {
        id: primaryId,
        name: 'Primary Failover Mock',
        providerType: 'MOCK',
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
        dailyQuota: 100,
        dailyUsed: 0,
        priority: 1,
        perSecondRateLimit: 50.0,
      },
    });

    // 2. Backup provider (MOCK)
    await prisma.providerAccount.upsert({
      where: { id: backupId },
      update: {
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
        dailyQuota: 100,
        dailyUsed: 0,
        priority: 0, // Priority 0 makes it top fallback ahead of default SES
        perSecondRateLimit: 50.0,
      },
      create: {
        id: backupId,
        name: 'Backup Failover Mock',
        providerType: 'MOCK',
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
        dailyQuota: 100,
        dailyUsed: 0,
        priority: 0,
        perSecondRateLimit: 50.0,
      },
    });

    // 3. Campaign & Recipient
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Failover Test Campaign',
        subject: 'Failover Test',
        htmlContent: '<p>Failover Test Content</p>',
        senderName: 'Test Sender',
        senderEmail: 'test@bulkemail.cloud',
        status: 'RUNNING',
      },
    });
    testCampaignId = campaign.id;

    const recipient = await prisma.recipient.create({
      data: {
        email: 'transient-failover-user@example.com',
        firstName: 'Failover',
      },
    });
    testRecipientId = recipient.id;

    await prisma.campaignRecipient.create({
      data: {
        campaignId: testCampaignId,
        recipientId: testRecipientId,
        email: 'transient-failover-user@example.com',
        status: CampaignRecipientStatus.QUEUED,
      },
    });
  });

  afterAll(async () => {
    await prisma.campaignRecipient.deleteMany({ where: { campaignId: testCampaignId } });
    await prisma.emailJob.deleteMany({ where: { campaignId: testCampaignId } });
    await prisma.campaign.delete({ where: { id: testCampaignId } });
    await prisma.recipient.delete({ where: { id: testRecipientId } });
    await prisma.providerQuotaReservation.deleteMany({
      where: { providerId: { in: [primaryId, backupId] } },
    });
    await prisma.providerAccount.deleteMany({
      where: { id: { in: [primaryId, backupId] } },
    });
  });

  it('should trigger failover from primary to backup on rate limit or transient error', async () => {
    const queue = getQueueService();

    // Enqueue job with trigger-ratelimit email assigned to primary
    await queue.enqueueBatch([
      {
        campaignId: testCampaignId,
        recipientId: testRecipientId,
        email: 'trigger-ratelimit-user@example.com',
        payload: {
          to: 'trigger-ratelimit-user@example.com',
          from: 'test@bulkemail.cloud',
          subject: 'Failover Test',
          html: '<p>Test</p>',
          assignedProviderId: primaryId,
        },
        idempotencyKey: `failover-test-${Date.now()}`,
      },
    ]);

    // Dequeue and process once with worker
    const jobs = await queue.dequeue(1, 'test-failover-worker');
    expect(jobs.length).toBe(1);

    const worker = new EmailWorker('test-failover-worker');
    // Invoke processJob directly to observe failover behavior
    await (worker as any).processJob(jobs[0]);

    // The job was assigned to primaryId, which hit simulated 429 ratelimit.
    // The worker's failover circuit should have selected backupId and updated the job!
    const updatedJob = await prisma.emailJob.findUnique({
      where: { id: jobs[0].id },
    });

    expect(updatedJob?.assignedProviderId).toBe(backupId);
    expect((updatedJob?.payload as any)?.assignedProviderId).toBe(backupId);
  });
});
