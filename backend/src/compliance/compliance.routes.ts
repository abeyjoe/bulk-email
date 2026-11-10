import { Router, Request, Response } from 'express';
import { SuppressionService } from './suppression.service';
import { UnsubscribeService } from './unsubscribe.service';
import { authMiddleware } from '../auth/auth.middleware';
import { requireRole } from '../auth/roles.guard';
import { Role, SuppressionReason } from '@prisma/client';

export const complianceRouter = Router();

// --- PUBLIC UNSUBSCRIBE ENDPOINTS ---

// Standard form unsubscribe
complianceRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { email, recipientId, campaignId, token, reason } = req.body;
    if (!email || !token) {
      res.status(400).json({ error: 'Email and verification token are required' });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await UnsubscribeService.processUnsubscribe({
      email,
      recipientId,
      campaignId,
      token,
      reason,
      ipAddress,
      userAgent,
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// RFC 8058 One-Click Unsubscribe (GET & POST)
const handleOneClick = async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || (req.body?.token as string);
    const email = (req.query.email as string) || (req.body?.email as string);
    const recipientId = (req.query.recipientId as string) || (req.body?.recipientId as string);
    const campaignId = (req.query.campaignId as string) || (req.body?.campaignId as string);

    if (!email || !token) {
      res.status(400).send('Invalid unsubscribe request. Missing email or token.');
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await UnsubscribeService.processUnsubscribe({
      email,
      recipientId,
      campaignId,
      token,
      reason: 'RFC 8058 One-Click Header Unsubscribe',
      ipAddress,
      userAgent,
    });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Unsubscribed Successfully</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>You have been successfully unsubscribed</h2>
        <p>Your address <strong>${email}</strong> has been placed on our permanent suppression list.</p>
      </body>
      </html>
    `);
  } catch (err: any) {
    res.status(400).send(`Unsubscribe error: ${err.message}`);
  }
};

complianceRouter.get('/unsubscribe/one-click', handleOneClick);
complianceRouter.post('/unsubscribe/one-click', handleOneClick);

// --- PROTECTED SUPPRESSION MANAGEMENT ENDPOINTS ---

complianceRouter.get('/suppression', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { page, limit, search, reason } = req.query;
    const result = await SuppressionService.list({
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 25,
      search: search ? String(search) : undefined,
      reason: reason ? (String(reason) as SuppressionReason) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

complianceRouter.post(
  '/suppression',
  authMiddleware,
  requireRole([Role.ADMIN, Role.MANAGER]),
  async (req: Request, res: Response) => {
    try {
      const { email, reason, notes } = req.body;
      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Valid email is required' });
        return;
      }

      await SuppressionService.suppress(
        email,
        reason || SuppressionReason.ADMIN_MANUAL,
        'ADMIN_DASHBOARD',
        { notes }
      );

      res.status(201).json({ success: true, email });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

complianceRouter.delete(
  '/suppression/:email',
  authMiddleware,
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const success = await SuppressionService.unsuppress(req.params.email as string);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
