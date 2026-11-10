import { Router } from 'express';
import { AnalyticsService } from './analytics.service';
import { authMiddleware } from '../auth/auth.middleware';
import { getEmailProvider } from '../providers';

export const analyticsRouter = Router();

analyticsRouter.use(authMiddleware);

analyticsRouter.get('/dashboard', async (req, res) => {
  try {
    const overview = await AnalyticsService.getDashboardOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

analyticsRouter.get('/campaigns/:id', async (req, res) => {
  try {
    const report = await AnalyticsService.getCampaignReport(req.params.id);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

analyticsRouter.get('/quota', async (req, res) => {
  try {
    const provider = getEmailProvider();
    const quota = await provider.getQuota();
    res.json({ quota });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
