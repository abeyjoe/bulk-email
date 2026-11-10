import { EmailWorker } from './worker/email-worker';
import { connectDatabase } from './db/prisma';
import { config } from './config';

async function bootstrapWorker() {
  console.log('==================================================');
  console.log('       BULK EMAIL ASYNCHRONOUS WORKER RUNNER      ');
  console.log('==================================================');

  await connectDatabase();

  const workerCount = Math.max(1, parseInt(process.env.WORKER_PROCESS_COUNT || '1', 10));
  const workers: EmailWorker[] = [];

  for (let i = 1; i <= workerCount; i++) {
    const worker = new EmailWorker(`worker-proc-${process.pid}-${i}`, config.worker.concurrency);
    workers.push(worker);
    await worker.start();
  }

  console.log(`[Worker Runner] Successfully initialized ${workers.length} worker instances.`);

  const shutdown = async () => {
    console.log('[Worker Runner] Graceful shutdown requested...');
    for (const worker of workers) {
      worker.stop();
    }
    // Allow brief time for active in-flight jobs to finish cleanly
    setTimeout(() => {
      console.log('[Worker Runner] Exiting process.');
      process.exit(0);
    }, 2000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrapWorker().catch((err) => {
  console.error('[Worker Runner] Fatal startup exception:', err);
  process.exit(1);
});
