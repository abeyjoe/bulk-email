import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { providerRegistry } from './provider-registry.service';
import { quotaManager } from '../quota/quota-manager.service';
import { multiRateLimiter } from '../limiter/multi-rate-limiter.service';
import { authMiddleware } from '../auth/auth.middleware';
import { requireRole } from '../auth/roles.guard';
import { Role } from '@prisma/client';

export const providerRouter = Router();

// Apply auth to all provider endpoints
providerRouter.use(authMiddleware);

/**
 * GET /api/providers
 * Returns all configured providers with real-time capacity and rate status.
 */
providerRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const providers = await prisma.providerAccount.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const limiterStatus = multiRateLimiter.getStatus();

    const results = await Promise.all(
      providers.map(async (p) => {
        let capacity = {
          dailyRemaining: Math.max(0, p.dailyQuota - p.dailyUsed),
          monthlyRemaining: Math.max(0, p.monthlyQuota - p.monthlyUsed),
          reservedQuota: 0,
        };

        try {
          const cap = await quotaManager.getProviderCapacity(p.id);
          capacity = {
            dailyRemaining: cap.dailyRemaining,
            monthlyRemaining: cap.monthlyRemaining,
            reservedQuota: cap.reservedQuota || 0,
          };
        } catch {}

        const bucket = limiterStatus.providers[p.id];

        return {
          id: p.id,
          name: p.name,
          providerType: p.providerType,
          isDefault: p.isDefault,
          isSandbox: p.isSandbox,
          isEnabled: p.isEnabled,
          priority: p.priority,
          routingWeight: p.routingWeight,
          region: p.region,
          accessKeyMasked: p.accessKeyMasked,
          dailyQuota: p.dailyQuota,
          dailyUsed: p.dailyUsed,
          dailyRemaining: capacity.dailyRemaining,
          monthlyQuota: p.monthlyQuota,
          monthlyUsed: p.monthlyUsed,
          monthlyRemaining: capacity.monthlyRemaining,
          reservedQuota: capacity.reservedQuota,
          perSecondRateLimit: p.perSecondRateLimit,
          costPerThousand: p.costPerThousand,
          monthlySubscriptionFee: p.monthlySubscriptionFee,
          status: p.status,
          healthStatus: p.healthStatus,
          consecutiveFailures: p.consecutiveFailures,
          lastHealthCheckAt: p.lastHealthCheckAt,
          lastQuotaSyncAt: p.lastQuotaSyncAt,
          isCoolingDown: bucket?.isCoolingDown || false,
          currentRateTokens: bucket?.currentTokens ?? p.perSecondRateLimit,
        };
      })
    );

    res.json({
      providers: results,
      globalRate: limiterStatus.globalRatePerSecond,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/providers/:id
 * Retrieve single provider details.
 */
providerRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const provider = await prisma.providerAccount.findUnique({
      where: { id },
    });

    if (!provider) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    const capacity = await quotaManager.getProviderCapacity(id);
    const limiter = multiRateLimiter.getStatus().providers[id];

    res.json({
      provider: {
        ...provider,
        credentialsEncrypted: undefined, // never expose raw keys
        capacity,
        limiter,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/providers
 * Create a new email delivery provider account (ADMIN only).
 */
providerRouter.post('/', requireRole([Role.ADMIN]), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      providerType,
      region,
      isDefault,
      isSandbox,
      priority,
      routingWeight,
      dailyQuota,
      monthlyQuota,
      perSecondRateLimit,
      costPerThousand,
      apiKey,
      accessKeyId,
      secretAccessKey,
    } = req.body;

    if (!name?.trim() || !providerType?.trim()) {
      res.status(400).json({ error: 'Name and providerType are required' });
      return;
    }

    const upperType = providerType.toUpperCase();
    if (!['SES', 'BREVO', 'MAILCHIMP', 'MOCK', 'SMTP'].includes(upperType)) {
      res.status(400).json({ error: 'Unsupported providerType' });
      return;
    }

    // Prepare credentials masking
    let accessKeyMasked = 'configured';
    const credentials: Record<string, any> = {};

    if (apiKey) {
      credentials.apiKey = apiKey;
      accessKeyMasked = `${apiKey.substring(0, 8)}************`;
    }
    if (accessKeyId) {
      credentials.accessKeyId = accessKeyId;
      credentials.secretAccessKey = secretAccessKey;
      accessKeyMasked = `${accessKeyId.substring(0, 4)}************`;
    }

    const existingCount = await prisma.providerAccount.count();
    const shouldBeDefault = existingCount === 0 ? true : Boolean(isDefault);

    // If marked default, unset other defaults
    if (shouldBeDefault) {
      await prisma.providerAccount.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.providerAccount.create({
      data: {
        name: name.trim(),
        providerType: upperType,
        region: region || (upperType === 'SES' ? 'us-east-1' : 'us1'),
        isDefault: shouldBeDefault,
        isSandbox: Boolean(isSandbox),
        isEnabled: true,
        priority: priority ? parseInt(priority, 10) : 10,
        routingWeight: routingWeight ? parseFloat(routingWeight) : 1.0,
        dailyQuota: dailyQuota ? parseInt(dailyQuota, 10) : 50000,
        monthlyQuota: monthlyQuota ? parseInt(monthlyQuota, 10) : 1500000,
        perSecondRateLimit: perSecondRateLimit ? parseFloat(perSecondRateLimit) : 10.0,
        costPerThousand: costPerThousand !== undefined ? parseFloat(costPerThousand) : 0.10,
        credentialsEncrypted: credentials,
        accessKeyMasked,
        healthStatus: 'HEALTHY',
        status: 'ACTIVE',
      },
    });

    // Update in-memory registry & limiter
    multiRateLimiter.registerProviderRate(account.id, account.perSecondRateLimit);

    res.status(201).json({ provider: account });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/providers/:id
 * Update configuration for a provider.
 */
providerRouter.patch('/:id', requireRole([Role.ADMIN]), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      name,
      region,
      isEnabled,
      isDefault,
      priority,
      routingWeight,
      dailyQuota,
      monthlyQuota,
      perSecondRateLimit,
      costPerThousand,
      status,
      apiKey,
      accessKeyId,
      secretAccessKey,
    } = req.body;

    const existing = await prisma.providerAccount.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (region) updateData.region = region.trim();
    if (isEnabled !== undefined) updateData.isEnabled = Boolean(isEnabled);
    if (priority !== undefined) updateData.priority = parseInt(priority, 10);
    if (routingWeight !== undefined) updateData.routingWeight = parseFloat(routingWeight);
    if (dailyQuota !== undefined) {
      updateData.dailyQuota = parseInt(dailyQuota, 10);
      updateData.sendingQuotaDaily = parseInt(dailyQuota, 10);
    }
    if (monthlyQuota !== undefined) updateData.monthlyQuota = parseInt(monthlyQuota, 10);
    if (perSecondRateLimit !== undefined) {
      updateData.perSecondRateLimit = parseFloat(perSecondRateLimit);
      updateData.sendingRatePerSecond = parseFloat(perSecondRateLimit);
      multiRateLimiter.registerProviderRate(id, parseFloat(perSecondRateLimit));
    }
    if (costPerThousand !== undefined) updateData.costPerThousand = parseFloat(costPerThousand);
    if (status) updateData.status = status;

    if (isDefault) {
      await prisma.providerAccount.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      updateData.isDefault = true;
    }

    if (apiKey || accessKeyId) {
      const creds = (existing.credentialsEncrypted as Record<string, any>) || {};
      if (apiKey) {
        creds.apiKey = apiKey;
        updateData.accessKeyMasked = `${apiKey.substring(0, 8)}************`;
      }
      if (accessKeyId) {
        creds.accessKeyId = accessKeyId;
        creds.secretAccessKey = secretAccessKey;
        updateData.accessKeyMasked = `${accessKeyId.substring(0, 4)}************`;
      }
      updateData.credentialsEncrypted = creds;
    }

    const updated = await prisma.providerAccount.update({
      where: { id },
      data: updateData,
    });

    // Invalidate cached adapter so next send uses updated credentials
    providerRegistry.evict(id);

    res.json({ provider: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/providers/:id/test
 * Health check & credential verification.
 */
providerRouter.post('/:id/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const provider = await providerRegistry.getProvider(id);
    const health = await provider.checkHealth();

    await prisma.providerAccount.update({
      where: { id },
      data: {
        healthStatus: health.healthStatus,
        lastHealthCheckAt: health.lastChecked,
        consecutiveFailures: health.consecutiveFailures,
      },
    });

    res.json({ health });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/providers/:id/sync-quota
 * Reconcile quota usage with provider upstream API.
 */
providerRouter.post('/:id/sync-quota', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const provider = await providerRegistry.getProvider(id);

    if (provider.reconcileQuota) {
      const syncResult = await provider.reconcileQuota();
      res.json({ success: true, ...syncResult });
    } else {
      res.json({ success: true, message: 'Provider does not require external quota sync' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/providers/:id
 * Delete a non-default provider account.
 */
providerRouter.delete('/:id', requireRole([Role.ADMIN]), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const provider = await prisma.providerAccount.findUnique({ where: { id } });

    if (!provider) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    await prisma.providerAccount.delete({ where: { id } });
    providerRegistry.evict(id);

    if (provider.isDefault) {
      const nextProvider = await prisma.providerAccount.findFirst({
        orderBy: { priority: 'asc' },
      });
      if (nextProvider) {
        await prisma.providerAccount.update({
          where: { id: nextProvider.id },
          data: { isDefault: true },
        });
      }
    }

    res.json({ success: true, message: 'Provider account removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
