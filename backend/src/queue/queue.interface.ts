export interface EnqueueJobInput {
  campaignId: string;
  recipientId: string;
  email: string;
  payload: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  };
  idempotencyKey: string;
}

export interface QueueJob {
  id: string;
  campaignId: string;
  recipientId: string;
  email: string;
  payload: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  };
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  receiptHandle?: string; // For SQS
}

export interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
}

export interface IQueueService {
  name: string;
  enqueueBatch(jobs: EnqueueJobInput[]): Promise<number>;
  dequeue(limit: number, workerId: string): Promise<QueueJob[]>;
  ack(job: QueueJob): Promise<void>;
  nack(job: QueueJob, error: string, retryDelaySeconds?: number): Promise<void>;
  moveToDeadLetter(job: QueueJob, finalError: string): Promise<void>;
  getStats(campaignId?: string): Promise<QueueStats>;
  purge?(campaignId: string): Promise<number>;
}
