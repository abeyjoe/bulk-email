import { DbQueueService } from '../src/queue/db-queue.service';
import { EmailWorker } from '../src/worker/email-worker';
import { prisma } from '../src/db/prisma';
import { SuppressionService } from '../src/compliance/suppression.service';
import { SuppressionReason, CampaignStatus } from '@prisma/client';

describe('Queue & Asynchronous Worker Engine', () => {
  let testCampaignId: string;
  let testRecipientId: string;

  beforeAll(async () => {
    // Create test campaign
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Unit Test Campaign',
        subject: 'Testing Subject',
        senderName: 'Tester',
        senderEmail: 'test@bulkemail.cloud',
        htmlContent: '<p>Test email</p>',
        status: CampaignStatus.RUNNING,
      },
    });
    testCampaignId = campaign.id;

    // Create test recipient
    const recipient = await prisma.recipient.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        firstName: 'Unit',
        lastName: 'Tester',
      },
    });
    testRecipientId = recipient.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.emailJob.deleteMany({ where: { campaignId: testCampaignId } });
    await prisma.campaignRecipient.deleteMany({ where: { campaignId: testCampaignId } });
    await prisma.campaign.deleteMany({ where: { id: testCampaignId } });
    await prisma.recipient.deleteMany({ where: { id: testRecipientId } });
    await prisma.$disconnect();
  });

  it('should enqueue batch jobs with idempotency keys', async () => {
    const queue = new DbQueueService();

    const jobs = [
      {
        campaignId: testCampaignId,
        recipientId: testRecipientId,
        email: 'test@example.com',
        payload: {
          to: 'test@example.com',
          from: 'sender@example.com',
          subject: 'Test subject',
          html: '<p>Hi</p>',
        },
        idempotencyKey: `idemp-${testCampaignId}-${Date.now()}-1`,
      },
    ];

    const enqueued = await queue.enqueueBatch(jobs);
    expect(enqueued).toBe(1);

    // Re-enqueuing duplicate idempotency key should be skipped!
    const duplicateEnqueued = await queue.enqueueBatch(jobs);
    expect(duplicateEnqueued).toBe(0);
  });

  it('should dequeue jobs with row-level locks and allow worker to process and ack', async () => {
    const queue = new DbQueueService();
    const dequeued = await queue.dequeue(5, 'test-worker-1');

    expect(dequeued.length).toBeGreaterThanOrEqual(1);
    const job = dequeued.find((j) => j.campaignId === testCampaignId);
    expect(job).toBeDefined();

    if (job) {
      await queue.ack(job);
      const stats = await queue.getStats(testCampaignId);
      expect(stats.sent).toBeGreaterThanOrEqual(1);
    }
  });

  it('should automatically exclude suppressed recipients', async () => {
    const suppressedEmail = `suppressed-${Date.now()}@example.com`;
    await SuppressionService.suppress(suppressedEmail, SuppressionReason.UNSUBSCRIBE, 'TEST');

    const isSuppressed = await SuppressionService.isSuppressed(suppressedEmail);
    expect(isSuppressed).toBe(true);

    const set = await SuppressionService.getSuppressedEmailSet([suppressedEmail, 'unsuppressed@example.com']);
    expect(set.has(suppressedEmail)).toBe(true);
    expect(set.has('unsuppressed@example.com')).toBe(false);
  });
});
