import { prisma } from '../db/prisma';
import { quotaManager } from '../quota/quota-manager.service';
import { ProviderCapacity } from '../providers/provider.interface';

export type RoutingStrategy = 'PRIORITY' | 'CAPACITY' | 'COST' | 'MANUAL' | 'HYBRID';

export interface ProviderAllocationPlan {
  providerId: string;
  providerType: string;
  providerName: string;
  allocatedCount: number;
  reservationId: string;
  estimatedCostUsd: number;
}

export interface RoutingDecision {
  strategy: RoutingStrategy;
  totalRequested: number;
  totalAllocated: number;
  allocations: ProviderAllocationPlan[];
  unallocatedCount: number;
}

export interface ManualDistributionConfig {
  [providerId: string]: number; // fraction between 0.0 and 1.0, summing to ~1.0
}

export interface HybridConfig {
  primaryProviderId?: string;
  primaryThresholdPercent?: number; // e.g. 80 (meaning up to 80% capacity of primary)
  secondaryStrategy?: 'CAPACITY' | 'COST';
}

export class ProviderRouterService {
  /**
   * Calculate and reserve provider allocations for a campaign batch.
   */
  public async planDistribution(
    campaignId: string,
    totalRecipients: number,
    strategy: RoutingStrategy = 'PRIORITY',
    customConfig?: {
      manual?: ManualDistributionConfig;
      hybrid?: HybridConfig;
    },
    allowedProviderIds?: string[]
  ): Promise<RoutingDecision> {
    if (totalRecipients <= 0) {
      return {
        strategy,
        totalRequested: 0,
        totalAllocated: 0,
        allocations: [],
        unallocatedCount: 0,
      };
    }

    // 1. Fetch enabled & healthy provider accounts ordered by priority
    const whereClause: any = {
      isEnabled: true,
      status: 'ACTIVE',
      healthStatus: { not: 'DOWN' },
    };

    if (allowedProviderIds && allowedProviderIds.length > 0) {
      whereClause.id = { in: allowedProviderIds };
    }

    const providers = await prisma.providerAccount.findMany({
      where: whereClause,
      orderBy: { priority: 'asc' },
    });

    if (providers.length === 0) {
      return {
        strategy,
        totalRequested: totalRecipients,
        totalAllocated: 0,
        allocations: [],
        unallocatedCount: totalRecipients,
      };
    }

    // 2. Fetch real-time available capacity for each provider
    const capacities = new Map<string, ProviderCapacity>();
    for (const p of providers) {
      const cap = await quotaManager.getProviderCapacity(p.id);
      capacities.set(p.id, cap);
    }

    // 3. Apply selected routing strategy
    let allocations: Array<{ providerId: string; count: number }> = [];

    switch (strategy) {
      case 'CAPACITY':
        allocations = this.allocateByCapacity(providers, capacities, totalRecipients);
        break;

      case 'COST':
        allocations = this.allocateByCost(providers, capacities, totalRecipients);
        break;

      case 'MANUAL':
        allocations = this.allocateManual(providers, capacities, totalRecipients, customConfig?.manual);
        break;

      case 'HYBRID':
        allocations = this.allocateHybrid(providers, capacities, totalRecipients, customConfig?.hybrid);
        break;

      case 'PRIORITY':
      default:
        allocations = this.allocateByPriority(providers, capacities, totalRecipients);
        break;
    }

    // 4. Atomically reserve quota leases for each allocated provider
    const finalAllocations: ProviderAllocationPlan[] = [];
    let totalAllocated = 0;

    for (const alloc of allocations) {
      if (alloc.count <= 0) continue;

      const p = providers.find((prov) => prov.id === alloc.providerId)!;
      const res = await quotaManager.reserveQuota(alloc.providerId, campaignId, alloc.count);

      if (res.success && res.grantedCount > 0) {
        totalAllocated += res.grantedCount;
        const estCost = (res.grantedCount / 1000) * p.costPerThousand;

        finalAllocations.push({
          providerId: p.id,
          providerType: p.providerType,
          providerName: p.name,
          allocatedCount: res.grantedCount,
          reservationId: res.reservationId,
          estimatedCostUsd: Math.round(estCost * 10000) / 10000,
        });
      }
    }

    return {
      strategy,
      totalRequested: totalRecipients,
      totalAllocated,
      allocations: finalAllocations,
      unallocatedCount: Math.max(0, totalRecipients - totalAllocated),
    };
  }

  /**
   * Helper: Allocate greedily across an ordered list of providers.
   */
  private allocateBySequence(
    orderedProviders: any[],
    capacities: Map<string, ProviderCapacity>,
    totalNeeded: number
  ): Array<{ providerId: string; count: number }> {
    const result: Array<{ providerId: string; count: number }> = [];
    let remaining = totalNeeded;

    for (const p of orderedProviders) {
      if (remaining <= 0) break;
      const cap = capacities.get(p.id);
      const available = cap ? cap.dailyRemaining : 0;
      if (available <= 0) continue;

      const grant = Math.min(remaining, available);
      result.push({ providerId: p.id, count: grant });
      remaining -= grant;
    }

    return result;
  }

  /**
   * Strategy 1: Priority-based
   * Fills highest priority provider to daily limit, then cascades to next.
   */
  private allocateByPriority(
    providers: any[],
    capacities: Map<string, ProviderCapacity>,
    totalNeeded: number
  ): Array<{ providerId: string; count: number }> {
    // Ordered by priority ascending (1 = highest)
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    return this.allocateBySequence(sorted, capacities, totalNeeded);
  }

  /**
   * Strategy 2: Capacity-based
   * Proportional distribution across all providers based on available capacity.
   */
  private allocateByCapacity(
    providers: any[],
    capacities: Map<string, ProviderCapacity>,
    totalNeeded: number
  ): Array<{ providerId: string; count: number }> {
    const result: Array<{ providerId: string; count: number }> = [];

    let totalCapacity = 0;
    const availableProviders = providers.filter((p) => {
      const cap = capacities.get(p.id);
      const avail = cap ? cap.dailyRemaining : 0;
      if (avail > 0) {
        totalCapacity += avail;
        return true;
      }
      return false;
    });

    if (totalCapacity <= 0) return [];

    let remainingNeeded = totalNeeded;

    for (let i = 0; i < availableProviders.length; i++) {
      const p = availableProviders[i];
      const cap = capacities.get(p.id)!;
      const ratio = cap.dailyRemaining / totalCapacity;

      let count: number;
      if (i === availableProviders.length - 1) {
        // Last provider takes remainder up to its capacity
        count = Math.min(remainingNeeded, cap.dailyRemaining);
      } else {
        count = Math.min(Math.floor(totalNeeded * ratio), cap.dailyRemaining, remainingNeeded);
      }

      if (count > 0) {
        result.push({ providerId: p.id, count });
        remainingNeeded -= count;
      }
    }

    return result;
  }

  /**
   * Strategy 3: Cost-based
   * Prioritize the lowest cost-per-thousand providers first.
   */
  private allocateByCost(
    providers: any[],
    capacities: Map<string, ProviderCapacity>,
    totalNeeded: number
  ): Array<{ providerId: string; count: number }> {
    // Sort by costPerThousand ascending
    const sortedByCost = [...providers].sort((a, b) => a.costPerThousand - b.costPerThousand);
    return this.allocateBySequence(sortedByCost, capacities, totalNeeded);
  }

  /**
   * Strategy 4: Manual distribution
   * Distribute based on user-configured percentages.
   */
  private allocateManual(
    providers: any[],
    capacities: Map<string, ProviderCapacity>,
    totalNeeded: number,
    manualConfig?: ManualDistributionConfig
  ): Array<{ providerId: string; count: number }> {
    if (!manualConfig || Object.keys(manualConfig).length === 0) {
      return this.allocateByPriority(providers, capacities, totalNeeded);
    }

    const result: Array<{ providerId: string; count: number }> = [];
    let remainingNeeded = totalNeeded;

    for (const [providerId, ratio] of Object.entries(manualConfig)) {
      if (remainingNeeded <= 0) break;
      const p = providers.find((prov) => prov.id === providerId);
      if (!p) continue;

      const cap = capacities.get(providerId);
      const available = cap ? cap.dailyRemaining : 0;
      if (available <= 0) continue;

      const targetCount = Math.round(totalNeeded * ratio);
      const grant = Math.min(targetCount, available, remainingNeeded);

      if (grant > 0) {
        result.push({ providerId, count: grant });
        remainingNeeded -= grant;
      }
    }

    // If remaining recipients left due to rounding or exhausted caps, cascade to other providers
    if (remainingNeeded > 0) {
      const remainingProviders = providers.filter(
        (p) => !result.some((r) => r.providerId === p.id)
      );
      const overflow = this.allocateByPriority(remainingProviders, capacities, remainingNeeded);
      result.push(...overflow);
    }

    return result;
  }

  /**
   * Strategy 5: Hybrid
   * Routes to primary provider up to threshold %, then balances remainder across secondary providers.
   */
  private allocateHybrid(
    providers: any[],
    capacities: Map<string, ProviderCapacity>,
    totalNeeded: number,
    hybridConfig?: HybridConfig
  ): Array<{ providerId: string; count: number }> {
    const primaryId = hybridConfig?.primaryProviderId || providers[0]?.id;
    const thresholdPercent = hybridConfig?.primaryThresholdPercent ?? 80;
    const secondaryStrategy = hybridConfig?.secondaryStrategy || 'CAPACITY';

    const primary = providers.find((p) => p.id === primaryId);
    const result: Array<{ providerId: string; count: number }> = [];
    let remainingNeeded = totalNeeded;

    if (primary) {
      const cap = capacities.get(primary.id);
      if (cap && cap.dailyRemaining > 0) {
        // Max allocation to primary is cap at threshold percentage of its daily quota
        const maxThresholdSlots = Math.floor((primary.dailyQuota * thresholdPercent) / 100);
        const slotsAlreadyUsed = primary.dailyUsed;
        const availableUnderThreshold = Math.max(0, maxThresholdSlots - slotsAlreadyUsed);
        const grant = Math.min(remainingNeeded, availableUnderThreshold, cap.dailyRemaining);

        if (grant > 0) {
          result.push({ providerId: primary.id, count: grant });
          remainingNeeded -= grant;
        }
      }
    }

    if (remainingNeeded > 0) {
      const secondaries = providers.filter((p) => p.id !== primaryId);
      const secondaryAllocations = secondaryStrategy === 'COST'
        ? this.allocateByCost(secondaries, capacities, remainingNeeded)
        : this.allocateByCapacity(secondaries, capacities, remainingNeeded);

      result.push(...secondaryAllocations);
    }

    return result;
  }

  /**
   * Select a failover provider for an in-flight job whose assigned provider failed.
   */
  public async selectFailoverProvider(
    failedProviderId: string,
    campaignId: string,
    allowedProviderIds?: string[]
  ): Promise<{ providerId: string; reservationId: string } | null> {
    const whereClause: any = {
      id: { not: failedProviderId },
      isEnabled: true,
      status: 'ACTIVE',
      healthStatus: 'HEALTHY',
    };

    if (allowedProviderIds && allowedProviderIds.length > 0) {
      whereClause.id = { not: failedProviderId, in: allowedProviderIds };
    }

    const alternatives = await prisma.providerAccount.findMany({
      where: whereClause,
      orderBy: { priority: 'asc' },
    });

    for (const alt of alternatives) {
      const res = await quotaManager.reserveQuota(alt.id, campaignId, 1);
      if (res.success && res.grantedCount > 0) {
        return {
          providerId: alt.id,
          reservationId: res.reservationId,
        };
      }
    }

    return null;
  }
}

export const providerRouter = new ProviderRouterService();
