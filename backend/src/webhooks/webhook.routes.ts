import { Router, Request, Response } from 'express';
import { SesWebhookService } from './ses-webhook.service';

export const webhookRouter = Router();

// AWS SES / SNS Notification Webhook
webhookRouter.post('/ses', async (req: Request, res: Response) => {
  try {
    const result = await SesWebhookService.handleIncomingNotification(req.body);
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    console.error('[SES Webhook Error]:', err);
    res.status(400).json({ error: err.message || 'Webhook processing failed' });
  }
});
