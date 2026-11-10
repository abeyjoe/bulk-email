import { prisma } from '../db/prisma';
import { IQueueService, EnqueueJobInput, QueueJob, QueueStats } from './queue.interface';
import { JobStatus, Prisma } from '@prisma/client';
import { config } from '../config';

export class DbQueueService implements IQueueService {
  name = 'PostgreSQL Persistent Queue';

  async enqueueBatch(jobs: EnqueueJobInput[]): Promise<number> {
    if (jobs.length === 0) return 0;

    // Use Prisma createMany with skipDuplicates for idempotency
    const data = jobs.map((job) => ({
      campaignId: job.campaignId,
      recipientId: job.recipientId,
      email: job.email.toLowerCase().trim(),
      payload: job.payload as unknown as Prisma.InputJsonValue,
      attempts: 0,
      maxAttempts: 5,
      status: JobStatus.PENDING,
      nextRunAt: new Date(),
      idempotencyKey: job.idempotencyKey,
    }));

    const result = await prisma.emailJob.createMany({
      data,
      skipDuplicates: true,
    });

    return result.count;
  }

  async dequeue(limit: number, workerId: string): Promise<QueueJob[]> {
    const lockExpiry = new Date(Date.now() - config.worker.jobLockDurationSeconds * 1000);
    const now = new Date();

    // Use PostgreSQL raw query with FOR UPDATE SKIP LOCKED for high-throughput concurrency
    // Selects jobs that are PENDING and due, or PROCESSING but lock expired (worker crash recovery)
    const selectedJobs: any[] = await prisma.$queryRaw`
      SELECT id, "campaignId", "recipientId", email, payload, attempts, "maxAttempts", "idempotencyKey"
      FROM email_jobs
      WHERE (
        (status = 'PENDING' AND "nextRunAt" <= ${now})
        OR
        (status = 'PROCESSING' AND "lockedAt" <= ${lockExpiry})
      )
      ORDER BY "nextRunAt" ASC, attempts ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    if (selectedJobs.length === 0) {
      return [];
    }

    const jobIds = selectedJobs.map((j) => j.id);

    // Mark as PROCESSING and lock to this worker
    await prisma.emailJob.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status: JobStatus.PROCESSING,
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });

    return selectedJobs.map((j) => ({
      id: j.id,
      campaignId: j.campaignId,
      recipientId: j.recipientId,
      email: j.email,
      payload: j.payload as any,
      attempts: j.attempts + 1,
      maxAttempts: j.maxAttempts,
      idempotencyKey: j.idempotencyKey,
    }));
  }

  async ack(job: QueueJob): Promise<void> {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.SENT,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async nack(job: QueueJob, error: string, retryDelaySeconds?: number): Promise<void> {
    const delay = retryDelaySeconds !== undefined
      ? retryDelaySeconds
      : Math.min(300, Math.pow(2, job.attempts) * 2 + Math.floor(Math.random() * 3)); // Exponential backoff with jitter

    const nextRun = new Date(Date.now() + delay * 1000);

    if (job.attempts >= job.maxAttempts) {
      await this.moveToDeadLetter(job, error);
      return;
    }

    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PENDING,
        lastError: error.substring(0, 500),
        nextRunAt: nextRun,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async moveToDeadLetter(job: QueueJob, finalError: string): Promise<void> {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.DEAD_LETTER,
        lastError: `Max retries (${job.maxAttempts}) exceeded: ${finalError}`.substring(0, 500),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async getStats(campaignId?: string): Promise<QueueStats> {
    const where = campaignId ? { campaignId } : {};

    const [pending, processing, sent, failed, deadLetter] = await Promise.all([
      prisma.emailJob.count({ where: { ...where, status: JobStatus.PENDING } }),
      prisma.emailJob.count({ where: { ...where, status: JobStatus.PROCESSING } }),
      prisma.emailJob.count({ where: { ...where, status: JobStatus.SENT } }),
      prisma.emailJob.count({ where: { ...where, status: JobStatus.FAILED } }),
      prisma.emailJob.count({ where: { ...where, status: JobStatus.DEAD_LETTER } }),
    ]);

    return { pending, processing, sent, failed, deadLetter };
  }

  async purge(campaignId: string): Promise<number> {
    const result = await prisma.emailJob.deleteMany({
      where: { campaignId, status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] } },
    });
    return result.count;
  }
}
