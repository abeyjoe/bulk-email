import { providerRouter } from '../src/routing/provider-router.service';
import { quotaManager } from '../src/quota/quota-manager.service';
import { prisma } from '../src/db/prisma';

describe('ProviderRouterService - 5 Routing Modes & Failover', () => {
  let testCampaignId: string;
  const p1 = 'router-test-ses';
  const p2 = 'router-test-brevo';
  const p3 = 'router-test-cheapest';

  beforeAll(async () => {
    // Setup 3 test providers with distinct priority, capacity, and cost
    await prisma.providerAccount.upsert({
      where: { id: p1 },
      update: {
        dailyQuota: 500,
        dailyUsed: 0,
        priority: 1,
        costPerThousand: 0.10,
        perSecondRateLimit: 14.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
      create: {
        id: p1,
        name: 'SES Provider P1',
        providerType: 'SES',
        dailyQuota: 500,
        dailyUsed: 0,
        priority: 1,
        costPerThousand: 0.10,
        perSecondRateLimit: 14.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
    });

    await prisma.providerAccount.upsert({
      where: { id: p2 },
      update: {
        dailyQuota: 300,
        dailyUsed: 0,
        priority: 2,
        costPerThousand: 0.25,
        perSecondRateLimit: 5.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
      create: {
        id: p2,
        name: 'Brevo Provider P2',
        providerType: 'BREVO',
        dailyQuota: 300,
        dailyUsed: 0,
        priority: 2,
        costPerThousand: 0.25,
        perSecondRateLimit: 5.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
    });

    await prisma.providerAccount.upsert({
      where: { id: p3 },
      update: {
        dailyQuota: 200,
        dailyUsed: 0,
        priority: 3,
        costPerThousand: 0.05, // Cheapest!
        perSecondRateLimit: 20.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
      create: {
        id: p3,
        name: 'Cheapest Provider P3',
        providerType: 'MOCK',
        dailyQuota: 200,
        dailyUsed: 0,
        priority: 3,
        costPerThousand: 0.05,
        perSecondRateLimit: 20.0,
        isEnabled: true,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        name: 'Routing Test Campaign',
        subject: 'Routing Test',
        htmlContent: '<p>Routing Test</p>',
        senderName: 'Test',
        senderEmail: 'test@example.com',
        status: 'DRAFT',
      },
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.providerQuotaReservation.deleteMany({
      where: { campaignId: testCampaignId },
    });
    await prisma.campaign.delete({
      where: { id: testCampaignId },
    });
    await prisma.providerAccount.deleteMany({
      where: { id: { in: [p1, p2, p3] } },
    });
  });

  beforeEach(async () => {
    // Clear reservations for our test providers before each run
    await prisma.providerQuotaReservation.deleteMany({
      where: { providerId: { in: [p1, p2, p3] } },
    });
    await prisma.providerAccount.updateMany({
      where: { id: { in: [p1, p2, p3] } },
      data: { dailyUsed: 0 },
    });
  });

  it('Strategy 1: PRIORITY should exhaust priority 1 before spilling to priority 2', async () => {
    // Request 600 recipients (P1 has 500, P2 has 300)
    const plan = await providerRouter.planDistribution(testCampaignId, 600, 'PRIORITY', undefined, [p1, p2, p3]);

    expect(plan.strategy).toBe('PRIORITY');
    expect(plan.totalAllocated).toBe(600);

    const sesAlloc = plan.allocations.find((a) => a.providerId === p1);
    const brevoAlloc = plan.allocations.find((a) => a.providerId === p2);

    expect(sesAlloc).toBeDefined();
    expect(sesAlloc?.allocatedCount).toBe(500); // P1 full capacity

    expect(brevoAlloc).toBeDefined();
    expect(brevoAlloc?.allocatedCount).toBe(100); // P2 gets remainder
  });

  it('Strategy 2: CAPACITY should distribute proportionally across all available providers', async () => {
    // Total available: 500 + 300 + 200 = 1000
    // If we request 500, allocations should be roughly 50%, 30%, 20%
    const plan = await providerRouter.planDistribution(testCampaignId, 500, 'CAPACITY', undefined, [p1, p2, p3]);

    expect(plan.strategy).toBe('CAPACITY');
    expect(plan.totalAllocated).toBe(500);
    expect(plan.allocations.length).toBeGreaterThanOrEqual(2);

    const sesAlloc = plan.allocations.find((a) => a.providerId === p1);
    const brevoAlloc = plan.allocations.find((a) => a.providerId === p2);
    const cheapAlloc = plan.allocations.find((a) => a.providerId === p3);

    expect(sesAlloc?.allocatedCount).toBeCloseTo(250, -1);
    expect(brevoAlloc?.allocatedCount).toBeCloseTo(150, -1);
    expect(cheapAlloc?.allocatedCount).toBeCloseTo(100, -1);
  });

  it('Strategy 3: COST should allocate to cheapest provider first', async () => {
    // P3 is $0.05, P1 is $0.10, P2 is $0.25
    // Request 250: P3 should get 200 (its full capacity), P1 should get 50
    const plan = await providerRouter.planDistribution(testCampaignId, 250, 'COST', undefined, [p1, p2, p3]);

    expect(plan.strategy).toBe('COST');
    expect(plan.totalAllocated).toBe(250);

    const cheapAlloc = plan.allocations.find((a) => a.providerId === p3);
    const sesAlloc = plan.allocations.find((a) => a.providerId === p1);

    expect(cheapAlloc?.allocatedCount).toBe(200); // Cheapest provider filled first!
    expect(sesAlloc?.allocatedCount).toBe(50);
  });

  it('Strategy 4: MANUAL should honor explicit percentage split', async () => {
    const manualConfig = {
      [p1]: 0.70, // 70% to P1
      [p2]: 0.30, // 30% to P2
    };

    const plan = await providerRouter.planDistribution(
      testCampaignId,
      200,
      'MANUAL',
      { manual: manualConfig },
      [p1, p2, p3]
    );

    expect(plan.strategy).toBe('MANUAL');
    expect(plan.totalAllocated).toBe(200);

    const sesAlloc = plan.allocations.find((a) => a.providerId === p1);
    const brevoAlloc = plan.allocations.find((a) => a.providerId === p2);

    expect(sesAlloc?.allocatedCount).toBe(140);
    expect(brevoAlloc?.allocatedCount).toBe(60);
  });

  it('Strategy 5: HYBRID should cap primary at threshold and balance remainder', async () => {
    // P1 daily quota = 500, threshold = 40% => max 200 slots for P1
    const hybridConfig = {
      primaryProviderId: p1,
      primaryThresholdPercent: 40,
      secondaryStrategy: 'CAPACITY' as const,
    };

    const plan = await providerRouter.planDistribution(
      testCampaignId,
      300,
      'HYBRID',
      { hybrid: hybridConfig },
      [p1, p2, p3]
    );

    expect(plan.strategy).toBe('HYBRID');
    expect(plan.totalAllocated).toBe(300);

    const sesAlloc = plan.allocations.find((a) => a.providerId === p1);
    expect(sesAlloc?.allocatedCount).toBe(200); // Capped at 40% of 500!

    // Remainder 100 distributed to secondaries
    const secondaryTotal = plan.allocations
      .filter((a) => a.providerId !== p1)
      .reduce((sum, a) => sum + a.allocatedCount, 0);
    expect(secondaryTotal).toBe(100);
  });

  it('Failover: should select a healthy alternative provider when one fails', async () => {
    const failover = await providerRouter.selectFailoverProvider(p1, testCampaignId, [p1, p2, p3]);

    expect(failover).toBeDefined();
    expect(failover?.providerId).not.toBe(p1);
    expect([p2, p3]).toContain(failover?.providerId);
    expect(failover?.reservationId).toBeDefined();
  });
});
