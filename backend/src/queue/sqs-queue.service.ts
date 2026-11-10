import {
  SQSClient,
  SendMessageBatchCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { IQueueService, EnqueueJobInput, QueueJob, QueueStats } from './queue.interface';
import { config } from '../config';

export class SqsQueueService implements IQueueService {
  name = 'Amazon SQS Queue';
  private client: SQSClient;
  private queueUrl: string;
  private dlqUrl: string;

  constructor() {
    this.queueUrl = config.queue.sqsQueueUrl;
    this.dlqUrl = config.queue.sqsDlqUrl;
    this.client = new SQSClient({
      region: config.aws.region,
      credentials: config.aws.accessKeyId && config.aws.secretAccessKey ? {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      } : undefined,
    });
  }

  async enqueueBatch(jobs: EnqueueJobInput[]): Promise<number> {
    if (jobs.length === 0 || !this.queueUrl) return 0;

    let enqueued = 0;
    // SQS batch size limit is 10 messages
    const SQS_MAX_BATCH = 10;
    for (let i = 0; i < jobs.length; i += SQS_MAX_BATCH) {
      const chunk = jobs.slice(i, i + SQS_MAX_BATCH);
      const entries = chunk.map((job, idx) => ({
        Id: `msg_${idx}_${Date.now()}`,
        MessageBody: JSON.stringify(job),
        MessageDeduplicationId: job.idempotencyKey,
        MessageGroupId: job.campaignId,
      }));

      try {
        const command = new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: entries,
        });
        const res = await this.client.send(command);
        enqueued += (res.Successful || []).length;
      } catch (err) {
        console.error('[SQS] Error enqueuing batch:', err);
      }
    }

    return enqueued;
  }

  async dequeue(limit: number, workerId: string): Promise<QueueJob[]> {
    if (!this.queueUrl) return [];

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(10, limit),
        VisibilityTimeout: config.worker.jobLockDurationSeconds,
        WaitTimeSeconds: 5, // Long polling
      });

      const response = await this.client.send(command);
      if (!response.Messages || response.Messages.length === 0) {
        return [];
      }

      return response.Messages.map((msg) => {
        const body: EnqueueJobInput = JSON.parse(msg.Body || '{}');
        return {
          id: msg.MessageId || `sqs-${Date.now()}`,
          campaignId: body.campaignId,
          recipientId: body.recipientId,
          email: body.email,
          payload: body.payload,
          attempts: 1,
          maxAttempts: 5,
          idempotencyKey: body.idempotencyKey,
          receiptHandle: msg.ReceiptHandle,
        };
      });
    } catch (err) {
      console.error('[SQS] Error dequeuing:', err);
      return [];
    }
  }

  async ack(job: QueueJob): Promise<void> {
    if (!this.queueUrl || !job.receiptHandle) return;

    try {
      await this.client.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: job.receiptHandle,
        })
      );
    } catch (err) {
      console.error('[SQS] Error acking message:', err);
    }
  }

  async nack(job: QueueJob, error: string, retryDelaySeconds?: number): Promise<void> {
    if (!this.queueUrl || !job.receiptHandle) return;

    try {
      const delay = retryDelaySeconds !== undefined ? retryDelaySeconds : 30;
      await this.client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: job.receiptHandle,
          VisibilityTimeout: delay,
        })
      );
    } catch (err) {
      console.error('[SQS] Error nacking message:', err);
    }
  }

  async moveToDeadLetter(job: QueueJob, finalError: string): Promise<void> {
    if (!this.dlqUrl) return;

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.dlqUrl,
          MessageBody: JSON.stringify({ ...job, finalError, movedAt: new Date() }),
        })
      );
      await this.ack(job);
    } catch (err) {
      console.error('[SQS] Error moving to DLQ:', err);
    }
  }

  async getStats(campaignId?: string): Promise<QueueStats> {
    // SQS stats can be read from CloudWatch or approximate attributes
    return {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      deadLetter: 0,
    };
  }
}
