import { prisma } from '../db/prisma';
import { getEmailProvider } from '../providers';
import { CampaignStatus, RecipientStatus } from '@prisma/client';

export class AnalyticsService {
  /**
   * System-wide overview metrics for Admin Dashboard
   */
  static async getDashboardOverview() {
    const provider = getEmailProvider();
    const quota = await provider.getQuota();

    const [
      totalRecipients,
      subscribedRecipients,
      suppressedRecipients,
      bouncedRecipients,
      unsubscribedRecipients,
      totalCampaigns,
      activeCampaigns,
      scheduledCampaigns,
      completedCampaigns,
      pausedCampaigns,
      aggregateStats,
      recentEvents,
      recentCampaigns,
      providers,
      costAgg,
      eventsByProviderRaw,
    ] = await Promise.all([
      prisma.recipient.count(),
      prisma.recipient.count({ where: { status: RecipientStatus.SUBSCRIBED } }),
      prisma.recipient.count({ where: { status: RecipientStatus.SUPPRESSED } }),
      prisma.recipient.count({ where: { status: RecipientStatus.BOUNCED } }),
      prisma.recipient.count({ where: { status: RecipientStatus.UNSUBSCRIBED } }),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: { in: [CampaignStatus.RUNNING, CampaignStatus.QUEUING] } } }),
      prisma.campaign.count({ where: { status: CampaignStatus.SCHEDULED } }),
      prisma.campaign.count({ where: { status: CampaignStatus.COMPLETED } }),
      prisma.campaign.count({ where: { status: CampaignStatus.PAUSED } }),
      prisma.campaign.aggregate({
        _sum: {
          queuedCount: true,
          acceptedCount: true,
          deliveredCount: true,
          bouncedCount: true,
          complaintCount: true,
          unsubscribedCount: true,
        },
      }),
      prisma.emailDeliveryEvent.findMany({
        take: 10,
        orderBy: { occurredAt: 'desc' },
        include: {
          campaign: { select: { name: true } },
          providerAccount: { select: { name: true, providerType: true } },
        },
      }),
      prisma.campaign.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.providerAccount.findMany({
        orderBy: [{ priority: 'asc' }],
        select: {
          id: true,
          name: true,
          providerType: true,
          dailyQuota: true,
          dailyUsed: true,
          monthlyQuota: true,
          monthlyUsed: true,
          perSecondRateLimit: true,
          costPerThousand: true,
          status: true,
          healthStatus: true,
          isEnabled: true,
        },
      }),
      prisma.emailDeliveryEvent.aggregate({
        _sum: { costUsd: true },
      }),
      prisma.emailDeliveryEvent.groupBy({
        by: ['providerAccountId'],
        _count: { id: true },
      }),
    ]);

    const accepted = aggregateStats._sum.acceptedCount || 0;
    const delivered = aggregateStats._sum.deliveredCount || 0;
    const bounced = aggregateStats._sum.bouncedCount || 0;
    const complaints = aggregateStats._sum.complaintCount || 0;

    const deliveryRate = accepted > 0 ? ((delivered / accepted) * 100).toFixed(1) : '100.0';
    const bounceRate = accepted > 0 ? ((bounced / accepted) * 100).toFixed(2) : '0.00';
    const complaintRate = accepted > 0 ? ((complaints / accepted) * 100).toFixed(3) : '0.000';

    const totalSystemDailyQuota = providers.reduce(
      (acc, p) => acc + (p.isEnabled ? p.dailyQuota : 0),
      0
    );
    const totalSystemDailyUsed = providers.reduce(
      (acc, p) => acc + (p.isEnabled ? p.dailyUsed : 0),
      0
    );

    // Map provider share
    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const providerShare = eventsByProviderRaw.map((ep) => {
      const p = ep.providerAccountId ? providerMap.get(ep.providerAccountId) : null;
      return {
        providerId: ep.providerAccountId || 'default',
        providerName: p?.name || 'Default SES',
        providerType: p?.providerType || 'SES',
        eventCount: ep._count.id,
      };
    });

    const totalSpendUsd = Math.round((costAgg._sum.costUsd || 0) * 100) / 100;

    return {
      recipients: {
        total: totalRecipients,
        subscribed: subscribedRecipients,
        suppressed: suppressedRecipients,
        bounced: bouncedRecipients,
        unsubscribed: unsubscribedRecipients,
      },
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        scheduled: scheduledCampaigns,
        completed: completedCampaigns,
        paused: pausedCampaigns,
      },
      emails: {
        queued: aggregateStats._sum.queuedCount || 0,
        accepted,
        delivered,
        bounced,
        complaints,
        unsubscribes: aggregateStats._sum.unsubscribedCount || 0,
        totalSpendUsd,
      },
      rates: {
        deliveryRatePercent: parseFloat(deliveryRate),
        bounceRatePercent: parseFloat(bounceRate),
        complaintRatePercent: parseFloat(complaintRate),
      },
      providerQuota: {
        dailyQuota: quota.dailyQuota,
        sentLast24Hours: quota.sentLast24Hours,
        maxSendRate: quota.maxSendRate,
        isProduction: quota.isProduction,
      },
      multiProvider: {
        providers: providers.map((p) => ({
          ...p,
          dailyRemaining: Math.max(0, p.dailyQuota - p.dailyUsed),
        })),
        totalDailyQuota: totalSystemDailyQuota,
        totalDailyUsed: totalSystemDailyUsed,
        totalDailyRemaining: Math.max(0, totalSystemDailyQuota - totalSystemDailyUsed),
        providerShare,
      },
      recentEvents,
      recentCampaigns,
    };
  }

  /**
   * Detailed Campaign Performance Report
   */
  static async getCampaignReport(campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        targetList: true,
        template: { select: { id: true, name: true } },
      },
    });

    if (!campaign) throw new Error('Campaign not found');

    const [recipientCounts, eventsByHour, campaignCostAgg, providerBreakdown] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { status: true },
      }),
      prisma.emailDeliveryEvent.findMany({
        where: { campaignId },
        select: { eventType: true, occurredAt: true, providerAccountId: true, costUsd: true },
        orderBy: { occurredAt: 'asc' },
        take: 2000,
      }),
      prisma.emailDeliveryEvent.aggregate({
        where: { campaignId },
        _sum: { costUsd: true },
      }),
      prisma.emailDeliveryEvent.groupBy({
        by: ['providerAccountId'],
        where: { campaignId },
        _count: { id: true },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const r of recipientCounts) {
      statusMap[r.status] = r._count.status;
    }

    const accepted = campaign.acceptedCount;
    const delivered = campaign.deliveredCount;
    const bounced = campaign.bouncedCount;
    const complaints = campaign.complaintCount;
    const totalCostUsd = Math.round((campaignCostAgg._sum.costUsd || 0) * 100) / 100;

    return {
      campaign,
      metrics: {
        totalTargeted: campaign.totalRecipients,
        eligible: campaign.eligibleRecipients,
        excluded: campaign.excludedRecipients,
        queued: campaign.queuedCount,
        acceptedByProvider: accepted,
        confirmedDelivered: delivered,
        bounces: bounced,
        complaints,
        unsubscribes: campaign.unsubscribedCount,
        deliveryRatePercent: accepted > 0 ? ((delivered / accepted) * 100).toFixed(1) : '0',
        bounceRatePercent: accepted > 0 ? ((bounced / accepted) * 100).toFixed(2) : '0',
        complaintRatePercent: accepted > 0 ? ((complaints / accepted) * 100).toFixed(3) : '0',
        totalCostUsd,
      },
      recipientStatusBreakdown: statusMap,
      providerBreakdown,
      eventLogPreview: eventsByHour.slice(-50),
    };
  }
}
