import { quotaManager } from '../src/quota/quota-manager.service';
import { prisma } from '../src/db/prisma';

describe('QuotaManagerService', () => {
  const testProviderId = 'test-quota-provider';
  let testCampaignId: string;

  beforeAll(async () => {
    // Create test provider account
    await prisma.providerAccount.upsert({
      where: { id: testProviderId },
      update: {
        dailyQuota: 100,
        dailyUsed: 0,
        monthlyQuota: 1000,
        monthlyUsed: 0,
        status: 'ACTIVE',
        isEnabled: true,
      },
      create: {
        id: testProviderId,
        name: 'Test Quota Provider',
        providerType: 'MOCK',
        dailyQuota: 100,
        dailyUsed: 0,
        monthlyQuota: 1000,
        monthlyUsed: 0,
        perSecondRateLimit: 10.0,
        status: 'ACTIVE',
        isEnabled: true,
      },
    });

    // Create a dummy campaign for reservations
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Quota Test Campaign',
        subject: 'Quota Test',
        htmlContent: '<p>Quota Test</p>',
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
    await prisma.providerAccount.delete({
      where: { id: testProviderId },
    });
  });

  it('should grant a quota reservation when quota is available', async () => {
    const res = await quotaManager.reserveQuota(testProviderId, testCampaignId, 25);
    expect(res.success).toBe(true);
    expect(res.grantedCount).toBe(25);
    expect(res.reservationId).toBeDefined();

    // Check capacity reflects the reservation
    const capacity = await quotaManager.getProviderCapacity(testProviderId);
    expect(capacity.reservedQuota).toBe(25);
    expect(capacity.dailyRemaining).toBe(75);
  });

  it('should prevent over-allocation beyond available quota', async () => {
    // Try to reserve more than remaining (100 total - 25 reserved = 75 left)
    const res = await quotaManager.reserveQuota(testProviderId, testCampaignId, 80);
    expect(res.success).toBe(true);
    // Should grant only what is remaining (75)
    expect(res.grantedCount).toBe(75);

    // Another reservation should fail with QUOTA_EXHAUSTED
    const emptyRes = await quotaManager.reserveQuota(testProviderId, testCampaignId, 10);
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.reason).toBe('QUOTA_EXHAUSTED');
  });

  it('should commit quota upon successful dispatch', async () => {
    // Reserve 10
    // First let's release previous reservations
    await prisma.providerQuotaReservation.deleteMany({
      where: { providerId: testProviderId },
    });

    const res = await quotaManager.reserveQuota(testProviderId, testCampaignId, 10);
    expect(res.success).toBe(true);

    // Commit 5 sends
    await quotaManager.commitQuota(res.reservationId, 5);

    const provider = await prisma.providerAccount.findUnique({
      where: { id: testProviderId },
    });
    expect(provider?.dailyUsed).toBe(5);
    expect(provider?.monthlyUsed).toBe(5);

    const reservation = await prisma.providerQuotaReservation.findUnique({
      where: { id: res.reservationId },
    });
    expect(reservation?.committedCount).toBe(5);
  });

  it('should release uncommitted quota when requested', async () => {
    // Clean slate of prior reservations
    await prisma.providerQuotaReservation.deleteMany({
      where: { providerId: testProviderId },
    });

    const res = await quotaManager.reserveQuota(testProviderId, testCampaignId, 20);
    expect(res.success).toBe(true);

    // Release reservation
    await quotaManager.releaseQuota(res.reservationId);

    const capacity = await quotaManager.getProviderCapacity(testProviderId);
    // Provider dailyUsed is 5 from previous test, total quota is 100, so remaining should be 95
    expect(capacity.dailyRemaining).toBe(95);
  });
});
