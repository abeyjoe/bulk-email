import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { connectDatabase } from './db/prisma';
import { authRouter } from './auth/auth.routes';
import { recipientRouter } from './recipients/recipient.routes';
import { campaignRouter } from './campaigns/campaign.routes';
import { templateRouter } from './templates/template.routes';
import { complianceRouter } from './compliance/compliance.routes';
import { webhookRouter } from './webhooks/webhook.routes';
import { analyticsRouter } from './analytics/analytics.routes';
import { systemRouter } from './system/system.routes';
import { EmailWorker } from './worker/email-worker';

export const app = express();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // For embedded iframe / preview rendering
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body Parsers: support up to 50MB for 50,000+ recipient CSV / Excel imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ type: ['text/plain', 'application/json', 'application/x-amz-sns-subscription'], limit: '10mb' }));

// Global API Rate Limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', generalLimiter);

// Mount API v1 Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/recipients', recipientRouter);
app.use('/api/v1/campaigns', campaignRouter);
app.use('/api/v1/templates', templateRouter);
app.use('/api/v1/compliance', complianceRouter);
app.use('/api/v1/webhooks', webhookRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/system', systemRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    ...(config.env === 'development' ? { stack: err.stack } : {}),
  });
});

let embeddedWorker: EmailWorker | null = null;

export async function startServer() {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    console.log(`[Bulk Email Server] Running on http://localhost:${config.port}`);
    console.log(`[Bulk Email Server] Environment: ${config.env}`);
    console.log(`[Bulk Email Server] Queue Driver: ${config.queue.driver}`);
    console.log(`[Bulk Email Server] Email Provider: ${config.email.provider}`);
  });

  // Start background worker in-process for single-container/local environments
  if (process.env.START_EMBEDDED_WORKER !== 'false') {
    embeddedWorker = new EmailWorker('embedded-worker-1', config.worker.concurrency);
    await embeddedWorker.start();
  }

  const shutdown = () => {
    console.log('[Bulk Email Server] Graceful shutdown initiated...');
    if (embeddedWorker) {
      embeddedWorker.stop();
    }
    server.close(() => {
      console.log('[Bulk Email Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[Bulk Email Server] Startup failure:', err);
    process.exit(1);
  });
}
