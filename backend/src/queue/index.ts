import { IQueueService } from './queue.interface';
import { DbQueueService } from './db-queue.service';
import { SqsQueueService } from './sqs-queue.service';
import { config } from '../config';

let activeQueue: IQueueService | null = null;

export function getQueueService(): IQueueService {
  if (!activeQueue) {
    if (config.queue.driver === 'sqs' && config.queue.sqsQueueUrl) {
      activeQueue = new SqsQueueService();
    } else {
      activeQueue = new DbQueueService();
    }
  }
  return activeQueue;
}

export function setCustomQueue(queue: IQueueService): void {
  activeQueue = queue;
}
