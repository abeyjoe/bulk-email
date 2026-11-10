import { Router } from 'express';
import { globalRateLimiter } from '../limiter/rate-limiter.service';
import { getQueueService } from '../queue';
import { authMiddleware } from '../auth/auth.middleware';
import { requireRole } from '../auth/roles.guard';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';

export const systemRouter = Router();

// Public health check
systemRouter.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date(),
      uptimeSeconds: process.uptime(),
    });
  } catch (err: any) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

systemRouter.use(authMiddleware);

// Worker & queue engine status
systemRouter.get('/status', async (req, res) => {
  try {
    const queue = getQueueService();
    const stats = await queue.getStats();

    res.json({
      queueEngine: queue.name,
      queueStats: stats,
      globalRateLimitPerSec: globalRateLimiter.getRate(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update global rate limit dynamically
systemRouter.post('/rate-limit', requireRole([Role.ADMIN]), async (req, res) => {
  try {
    const { ratePerSecond } = req.body;
    if (!ratePerSecond || typeof ratePerSecond !== 'number' || ratePerSecond <= 0) {
      res.status(400).json({ error: 'Valid positive ratePerSecond number is required' });
      return;
    }

    globalRateLimiter.setRate(ratePerSecond);

    // Save to system settings table
    await prisma.systemSetting.upsert({
      where: { key: 'MAX_GLOBAL_SEND_RATE' },
      update: { value: String(ratePerSecond) },
      create: {
        key: 'MAX_GLOBAL_SEND_RATE',
        value: String(ratePerSecond),
        description: 'Dynamically updated maximum sending rate per second',
      },
    });

    res.json({
      success: true,
      newRateLimitPerSec: globalRateLimiter.getRate(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
