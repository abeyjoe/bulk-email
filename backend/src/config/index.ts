import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-bulk-email-secret-key-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  queue: {
    driver: (process.env.QUEUE_DRIVER || 'database') as 'database' | 'sqs',
    sqsQueueUrl: process.env.AWS_SQS_QUEUE_URL || '',
    sqsDlqUrl: process.env.AWS_SQS_DLQ_URL || '',
  },

  email: {
    provider: (process.env.EMAIL_PROVIDER || 'simulator') as 'ses' | 'simulator',
    sourceEmail: process.env.AWS_SES_SOURCE_EMAIL || 'noreply@bulkemail.cloud',
    configurationSet: process.env.AWS_SES_CONFIGURATION_SET || 'bulk-email-events',
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },

  worker: {
    defaultRateLimit: parseFloat(process.env.DEFAULT_MAX_SENDING_RATE || '5.0'), // messages per second
    concurrency: parseInt(process.env.DEFAULT_WORKER_CONCURRENCY || '4', 10),
    maxConcurrency: parseInt(process.env.MAX_WORKER_CONCURRENCY || '20', 10),
    batchSize: 10,
    pollIntervalMs: 500,
    jobLockDurationSeconds: 120, // 2 minutes visibility timeout
  },

  compliance: {
    defaultBounceThresholdPercent: parseFloat(process.env.DEFAULT_BOUNCE_THRESHOLD_PERCENT || '5.0'),
    defaultComplaintThresholdPercent: parseFloat(process.env.DEFAULT_COMPLAINT_THRESHOLD_PERCENT || '0.1'),
    physicalPostalAddress: process.env.PHYSICAL_POSTAL_ADDRESS || 'Bulk Email Operations, 100 Tech Innovation Blvd, Lagos, Nigeria',
    companyName: process.env.COMPANY_NAME || 'Bulk Email Inc.',
  },
};
