import { Router } from 'express';
import { CampaignService } from './campaign.service';
import { authMiddleware } from '../auth/auth.middleware';
import { requireRole } from '../auth/roles.guard';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';

export const campaignRouter = Router();

campaignRouter.use(authMiddleware);

campaignRouter.get('/', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        targetList: { select: { id: true, name: true } },
      },
    });
    res.json({ campaigns });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

campaignRouter.get('/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        targetList: true,
        template: true,
      },
    });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ campaign });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

campaignRouter.post('/', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const campaign = await CampaignService.create(req.body);
    res.status(201).json({ campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update campaign details (name, subject, senderName, senderEmail, htmlContent)
campaignRouter.patch('/:id', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { name, subject, senderName, senderEmail, replyTo, htmlContent } = req.body;
    const data: Record<string, any> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (subject !== undefined) data.subject = String(subject).trim();
    if (senderName !== undefined) data.senderName = String(senderName).trim();
    if (senderEmail !== undefined) data.senderEmail = String(senderEmail).trim();
    if (replyTo !== undefined) data.replyTo = replyTo ? String(replyTo).trim() : null;
    if (htmlContent !== undefined) data.htmlContent = String(htmlContent);

    const campaign = await prisma.campaign.update({
      where: { id },
      data,
    });
    res.json({ campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Preflight review showing total eligible vs excluded recipients
campaignRouter.get('/:id/preflight', async (req, res) => {
  try {
    const review = await CampaignService.getPreflightReview(req.params.id as string);
    res.json({ review });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Launch campaign asynchronously
campaignRouter.post('/:id/launch', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const result = await CampaignService.launchCampaign(req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Pause campaign
campaignRouter.post('/:id/pause', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { reason } = req.body;
    const campaign = await CampaignService.pauseCampaign(req.params.id as string, reason);
    res.json({ campaign });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Resume campaign
campaignRouter.post('/:id/resume', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const campaign = await CampaignService.resumeCampaign(req.params.id as string);
    res.json({ campaign });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel campaign
campaignRouter.post('/:id/cancel', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const campaign = await CampaignService.cancelCampaign(req.params.id as string);
    res.json({ campaign });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send test email
campaignRouter.post('/:id/test-send', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { testEmail, providerId } = req.body;
    if (!testEmail) {
      res.status(400).json({ error: 'testEmail is required' });
      return;
    }
    const result = await CampaignService.sendTestEmail(req.params.id as string, testEmail, providerId);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
