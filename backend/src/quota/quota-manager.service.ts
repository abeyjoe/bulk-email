import { prisma } from '../db/prisma';
import { ProviderCapacity } from '../providers/provider.interface';

export interface ReservationResult {
  success: boolean;
  reservationId: string;
  grantedCount: number;
  remainingDailyQuota: number;
  reason?: string;
}

export class QuotaManagerService {
  /**
   * Acquire a two-phase quota lease for a campaign and provider.
   * Atomically ensures concurrency safety across workers and prevents over-allocation.
   */
  public async reserveQuota(
    providerId: string,
    campaignId: string,
    requestedCount: number,
    ttlMinutes: number = 120
  ): Promise<ReservationResult> {
    if (requestedCount <= 0) {
      return {
        success: true,
        reservationId: '',
        grantedCount: 0,
        remainingDailyQuota: 0,
      };
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch provider details
      const provider = await tx.providerAccount.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        return {
          success: false,
          reservationId: '',
          grantedCount: 0,
          remainingDailyQuota: 0,
          reason: 'PROVIDER_NOT_FOUND',
        };
      }

      if (!provider.isEnabled || provider.status !== 'ACTIVE') {
        return {
          success: false,
          reservationId: '',
          grantedCount: 0,
          remainingDailyQuota: 0,
          reason: `PROVIDER_INACTIVE_${provider.status}`,
        };
      }

      // 2. Calculate currently active reservations (uncommitted reserved count)
      const now = new Date();
      const activeReservations = await tx.providerQuotaReservation.findMany({
        where: {
          providerId,
          expiresAt: { gt: now },
        },
      });

      const totalReservedUncommitted = activeReservations.reduce((acc, r) => {
        const uncommitted = Math.max(0, r.reservedCount - r.committedCount);
        return acc + uncommitted;
      }, 0);

      // 3. Check daily and monthly limits
      const effectiveDailyUsed = provider.dailyUsed + totalReservedUncommitted;
      const dailyRemaining = Math.max(0, provider.dailyQuota - effectiveDailyUsed);
      const monthlyRemaining = Math.max(0, provider.monthlyQuota - provider.monthlyUsed);

      const maxGrantable = Math.min(dailyRemaining, monthlyRemaining);

      if (maxGrantable <= 0) {
        return {
          success: false,
          reservationId: '',
          grantedCount: 0,
          remainingDailyQuota: 0,
          reason: 'QUOTA_EXHAUSTED',
        };
      }

      const grantedCount = Math.min(requestedCount, maxGrantable);
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      const reservation = await tx.providerQuotaReservation.create({
        data: {
          providerId,
          campaignId,
          reservedCount: grantedCount,
          committedCount: 0,
          expiresAt,
        },
      });

      return {
        success: true,
        reservationId: reservation.id,
        grantedCount,
        remainingDailyQuota: dailyRemaining - grantedCount,
      };
    });
  }

  /**
   * Commit quota upon confirmed dispatch.
   * Atomically increments committed counts on reservation and usage counters on provider.
   */
  public async commitQuota(reservationId: string, count: number = 1): Promise<void> {
    if (!reservationId || count <= 0) return;

    await prisma.$transaction(async (tx) => {
      const reservation = await tx.providerQuotaReservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) return;

      // Update reservation
      await tx.providerQuotaReservation.update({
        where: { id: reservationId },
        data: {
          committedCount: { increment: count },
        },
      });

      // Update provider account metrics
      await tx.providerAccount.update({
        where: { id: reservation.providerId },
        data: {
          dailyUsed: { increment: count },
          monthlyUsed: { increment: count },
        },
      });
    });
  }

  /**
   * Release reserved quota (e.g. if jobs fail permanently, cancel, or reassign).
   */
  public async releaseQuota(reservationId: string, count?: number): Promise<void> {
    if (!reservationId) return;

    await prisma.$transaction(async (tx) => {
      const reservation = await tx.providerQuotaReservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) return;

      if (count === undefined || count >= (reservation.reservedCount - reservation.committedCount)) {
        // Expire reservation immediately so its uncommitted slots are liberated
        await tx.providerQuotaReservation.update({
          where: { id: reservationId },
          data: {
            expiresAt: new Date(),
          },
        });
      } else {
        // Reduce reserved count
        await tx.providerQuotaReservation.update({
          where: { id: reservationId },
          data: {
            reservedCount: { decrement: count },
          },
        });
      }
    });
  }

  /**
   * Calculate real-time provider capacity including active leases.
   */
  public async getProviderCapacity(providerId: string): Promise<ProviderCapacity> {
    const provider = await prisma.providerAccount.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider account not found: ${providerId}`);
    }

    const now = new Date();
    const activeReservations = await prisma.providerQuotaReservation.findMany({
      where: {
        providerId,
        expiresAt: { gt: now },
      },
    });

    const reservedQuota = activeReservations.reduce((acc, r) => {
      return acc + Math.max(0, r.reservedCount - r.committedCount);
    }, 0);

    const dailyRemaining = Math.max(0, provider.dailyQuota - provider.dailyUsed - reservedQuota);
    const monthlyRemaining = Math.max(0, provider.monthlyQuota - provider.monthlyUsed);

    return {
      dailyQuota: provider.dailyQuota,
      dailyUsed: provider.dailyUsed,
      dailyRemaining,
      monthlyQuota: provider.monthlyQuota,
      monthlyUsed: provider.monthlyUsed,
      monthlyRemaining,
      perSecondRateLimit: provider.perSecondRateLimit,
      costPerThousand: provider.costPerThousand,
      reservedQuota,
    };
  }

  /**
   * Reconcile quota usage with official provider telemetry.
   */
  public async reconcileProviderQuota(
    providerId: string,
    actualDailyUsed?: number,
    actualDailyQuota?: number
  ): Promise<void> {
    const updateData: any = {
      lastQuotaSyncAt: new Date(),
    };

    if (typeof actualDailyUsed === 'number' && actualDailyUsed >= 0) {
      updateData.dailyUsed = actualDailyUsed;
    }

    if (typeof actualDailyQuota === 'number' && actualDailyQuota > 0) {
      updateData.dailyQuota = actualDailyQuota;
      updateData.sendingQuotaDaily = actualDailyQuota;
    }

    await prisma.providerAccount.update({
      where: { id: providerId },
      data: updateData,
    });
  }

  /**
   * Periodic garbage collection of expired reservations.
   */
  public async cleanupExpiredReservations(): Promise<number> {
    const result = await prisma.providerQuotaReservation.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }

  /**
   * Daily midnight reset of daily sending counters.
   */
  public async resetDailyQuotas(): Promise<void> {
    await prisma.providerAccount.updateMany({
      data: {
        dailyUsed: 0,
      },
    });
    await this.cleanupExpiredReservations();
  }
}

export const quotaManager = new QuotaManagerService();
