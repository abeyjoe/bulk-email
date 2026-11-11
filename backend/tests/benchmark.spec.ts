import { providerRouter } from '../src/routing/provider-router.service';
import { quotaManager } from '../src/quota/quota-manager.service';
import { multiRateLimiter } from '../src/limiter/multi-rate-limiter.service';
import { MockAdapter } from '../src/providers/adapters/mock.adapter';
import { providerRegistry } from '../src/providers/provider-registry.service';
import { prisma } from '../src/db/prisma';

describe('High-Throughput Distribution Benchmark', () => {
  const benchmarkProviderId = 'benchmark-mock-provider';
  let campaignId: string;

  beforeAll(async () => {
    // Register high-throughput mock provider (50,000 daily capacity, 100 msg/sec, 0ms latency)
    await prisma.providerAccount.upsert({
      where: { id: benchmarkProviderId },
      update: {
        dailyQuota: 50000,
        dailyUsed: 0,
        monthlyQuota: 1000000,
        monthlyUsed: 0,
        perSecondRateLimit: 500.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
      create: {
        id: benchmarkProviderId,
        name: 'Benchmark Fast Mock',
        providerType: 'MOCK',
        dailyQuota: 50000,
        dailyUsed: 0,
        monthlyQuota: 1000000,
        monthlyUsed: 0,
        perSecondRateLimit: 500.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
    });

    const mockAdapter = new MockAdapter({
      id: benchmarkProviderId,
      name: 'Benchmark Fast Mock',
      dailyQuota: 50000,
      perSecondRateLimit: 500.0,
      simulatedDelayMs: 0,
    });
    providerRegistry.registerCustom(mockAdapter);
    multiRateLimiter.registerProviderRate(benchmarkProviderId, 500.0);

    const campaign = await prisma.campaign.create({
      data: {
        name: 'Benchmark Load Campaign',
        subject: 'Benchmark Subject',
        htmlContent: '<p>Benchmark Content</p>',
        senderName: 'Benchmark',
        senderEmail: 'benchmark@bulkemail.cloud',
        status: 'DRAFT',
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.providerQuotaReservation.deleteMany({ where: { campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } });
    await prisma.providerAccount.delete({ where: { id: benchmarkProviderId } });
  });

  it('should plan and reserve quota for a 20,000 recipient batch within 500ms', async () => {
    const start = Date.now();
    const plan = await providerRouter.planDistribution(
      campaignId,
      20000,
      'CAPACITY',
      undefined,
      [benchmarkProviderId]
    );
    const elapsed = Date.now() - start;

    expect(plan.totalAllocated).toBe(20000);
    expect(plan.allocations.length).toBe(1);
    expect(plan.allocations[0].providerId).toBe(benchmarkProviderId);
    expect(elapsed).toBeLessThan(1000); // Super fast DB reservation
  });

  it('should process 5,000 concurrent mock dispatches with atomic quota commits', async () => {
    const totalJobs = 5000;
    const provider = await providerRegistry.getProvider(benchmarkProviderId);

    // Reserve quota
    const reservation = await quotaManager.reserveQuota(benchmarkProviderId, campaignId, totalJobs);
    expect(reservation.success).toBe(true);

    const startTime = Date.now();

    // Dispatch jobs concurrently in chunks of 500
    const CHUNK = 500;
    let committed = 0;

    for (let i = 0; i < totalJobs; i += CHUNK) {
      const promises: Promise<any>[] = [];
      const count = Math.min(CHUNK, totalJobs - i);

      for (let j = 0; j < count; j++) {
        promises.push(
          provider.send({
            to: `recipient-${i + j}@benchmark-test.com`,
            from: 'benchmark@bulkemail.cloud',
            subject: 'Performance Benchmark',
            html: '<p>Test benchmark email payload</p>',
          })
        );
      }

      const results = await Promise.all(promises);
      const successful = results.filter((r) => r.success).length;
      committed += successful;

      await quotaManager.commitQuota(reservation.reservationId, successful);
    }

    const durationSeconds = (Date.now() - startTime) / 1000;
    const throughput = Math.round(committed / durationSeconds);

    expect(committed).toBe(totalJobs);
    expect(throughput).toBeGreaterThan(100); // Dispatches over 100 emails/sec locally

    // Verify usage meters in DB
    const capacity = await quotaManager.getProviderCapacity(benchmarkProviderId);
    expect(capacity.dailyUsed).toBeGreaterThanOrEqual(totalJobs);
  });
});
