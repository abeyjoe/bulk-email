import {
  SESv2Client,
  SendEmailCommand,
  GetAccountCommand,
} from '@aws-sdk/client-sesv2';
import {
  EmailProvider,
  EmailMessage,
  EmailSendResult,
  ProviderStatus,
  ProviderCapacity,
  WebhookProcessingResult,
} from '../provider.interface';
import { prisma } from '../../db/prisma';

export interface SesAdapterConfig {
  id: string;
  name?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  dailyQuota?: number;
  perSecondRateLimit?: number;
  costPerThousand?: number;
}

export class SesAdapter implements EmailProvider {
  public readonly id: string;
  public readonly type = 'SES';
  public readonly name: string;
  private client: SESv2Client;
  private region: string;
  private consecutiveFailures = 0;
  private dailyQuota: number;
  private perSecondRateLimit: number;
  private costPerThousand: number;

  constructor(cfg: SesAdapterConfig) {
    this.id = cfg.id;
    this.name = cfg.name || 'Amazon SES';
    this.region = cfg.region || 'us-east-1';
    this.dailyQuota = cfg.dailyQuota || 50000;
    this.perSecondRateLimit = cfg.perSecondRateLimit || 14.0;
    this.costPerThousand = cfg.costPerThousand || 0.10;

    this.client = new SESv2Client({
      region: this.region,
      credentials: cfg.accessKeyId && cfg.secretAccessKey ? {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      } : undefined,
    });
  }

  public async send(message: EmailMessage): Promise<EmailSendResult> {
    const timestamp = new Date();
    try {
      const emailHeaders: Array<{ Name: string; Value: string }> = [];
      if (message.headers) {
        for (const [key, value] of Object.entries(message.headers)) {
          emailHeaders.push({ Name: key, Value: value });
        }
      }

      if (message.campaignId) {
        emailHeaders.push({ Name: 'X-BulkEmail-Campaign-ID', Value: message.campaignId });
      }
      if (message.recipientId) {
        emailHeaders.push({ Name: 'X-BulkEmail-Recipient-ID', Value: message.recipientId });
      }

      const command = new SendEmailCommand({
        FromEmailAddress: message.from,
        Destination: {
          ToAddresses: [message.to],
        },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        ConfigurationSetName: message.configurationSet,
        Content: {
          Simple: {
            Subject: {
              Data: message.subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: message.html,
                Charset: 'UTF-8',
              },
              Text: message.text ? {
                Data: message.text,
                Charset: 'UTF-8',
              } : undefined,
            },
            Headers: emailHeaders.length > 0 ? emailHeaders : undefined,
          },
        },
      });

      const response = await this.client.send(command);
      this.consecutiveFailures = 0;

      return {
        success: true,
        messageId: response.MessageId || `ses-${Date.now()}`,
        providerId: this.id,
        providerType: this.type,
        timestamp,
        costEstimateUsd: this.costPerThousand / 1000,
        rawResponse: response,
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      const errorCode = err.name || 'SES_ERROR';
      const isTransient = errorCode === 'ThrottlingException' ||
                          errorCode === 'ServiceUnavailable' ||
                          errorCode === 'InternalServiceErrorException';
      const rateLimited = errorCode === 'ThrottlingException' || errorCode === 'TooManyRequestsException';

      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: err.message || 'Unknown SES dispatch error',
        errorCode,
        isTransient,
        rateLimited,
        retryAfterMs: rateLimited ? 30000 : undefined,
        costEstimateUsd: 0,
      };
    }
  }

  public async checkHealth(): Promise<ProviderStatus> {
    const lastChecked = new Date();
    try {
      const accountRes = await this.client.send(new GetAccountCommand({}));
      const sendingEnabled = accountRes.SendingEnabled ?? true;
      const isProduction = accountRes.ProductionAccessEnabled ?? false;

      return {
        status: sendingEnabled ? 'ACTIVE' : 'PAUSED',
        healthStatus: this.consecutiveFailures > 5 ? 'DEGRADED' : 'HEALTHY',
        isProduction,
        consecutiveFailures: this.consecutiveFailures,
        lastChecked,
      };
    } catch (err: any) {
      return {
        status: 'PAUSED',
        healthStatus: 'DOWN',
        isProduction: false,
        consecutiveFailures: this.consecutiveFailures + 1,
        lastChecked,
        message: err.message,
      };
    }
  }

  public async getCapacity(): Promise<ProviderCapacity> {
    const dbAccount = await prisma.providerAccount.findUnique({
      where: { id: this.id },
    });

    const dailyQuota = dbAccount?.dailyQuota || this.dailyQuota;
    const dailyUsed = dbAccount?.dailyUsed || 0;
    const monthlyQuota = dbAccount?.monthlyQuota || 1500000;
    const monthlyUsed = dbAccount?.monthlyUsed || 0;

    return {
      dailyQuota,
      dailyUsed,
      dailyRemaining: Math.max(0, dailyQuota - dailyUsed),
      monthlyQuota,
      monthlyUsed,
      monthlyRemaining: Math.max(0, monthlyQuota - monthlyUsed),
      perSecondRateLimit: dbAccount?.perSecondRateLimit || this.perSecondRateLimit,
      costPerThousand: dbAccount?.costPerThousand || this.costPerThousand,
    };
  }

  public async reconcileQuota(): Promise<{ dailyQuota: number; dailyUsed: number }> {
    try {
      const accountRes = await this.client.send(new GetAccountCommand({}));
      const dailyQuota = accountRes.SendQuota?.Max24HourSend || this.dailyQuota;
      const dailyUsed = accountRes.SendQuota?.SentLast24Hours || 0;

      await prisma.providerAccount.update({
        where: { id: this.id },
        data: {
          dailyQuota: Math.floor(dailyQuota),
          dailyUsed: Math.floor(dailyUsed),
          lastQuotaSyncAt: new Date(),
        },
      });

      return {
        dailyQuota: Math.floor(dailyQuota),
        dailyUsed: Math.floor(dailyUsed),
      };
    } catch {
      // Fallback to local DB records if GetAccount call not permitted by IAM
      const dbAccount = await prisma.providerAccount.findUnique({
        where: { id: this.id },
      });
      return {
        dailyQuota: dbAccount?.dailyQuota || this.dailyQuota,
        dailyUsed: dbAccount?.dailyUsed || 0,
      };
    }
  }

  public async processWebhook(payload: any): Promise<WebhookProcessingResult> {
    // Process SNS or direct SES webhook format
    let data = payload;
    if (typeof payload === 'string') {
      try { data = JSON.parse(payload); } catch {}
    }
    if (data.Type === 'Notification' && typeof data.Message === 'string') {
      try { data = JSON.parse(data.Message); } catch {}
    }

    const eventTypeRaw = data.eventType || data.notificationType;
    const mail = data.mail || {};
    const recipients = mail.destination || [];
    const messageId = mail.messageId;
    const email = recipients[0] || '';

    const events: any[] = [];

    if (eventTypeRaw === 'Bounce' || eventTypeRaw === 'BOUNCE') {
      const bounce = data.bounce || {};
      const isPermanent = bounce.bounceType === 'Permanent';
      events.push({
        eventType: isPermanent ? 'HARD_BOUNCE' : 'SOFT_BOUNCE',
        email: bounce.bouncedRecipients?.[0]?.emailAddress || email,
        providerMessageId: messageId,
        timestamp: new Date(bounce.timestamp || Date.now()),
        reason: bounce.bouncedRecipients?.[0]?.diagnosticCode || 'SES bounce notification',
        rawPayload: data,
      });
    } else if (eventTypeRaw === 'Complaint' || eventTypeRaw === 'COMPLAINT') {
      const complaint = data.complaint || {};
      events.push({
        eventType: 'COMPLAINT',
        email: complaint.complainedRecipients?.[0]?.emailAddress || email,
        providerMessageId: messageId,
        timestamp: new Date(complaint.timestamp || Date.now()),
        reason: complaint.complaintFeedbackType || 'SES complaint notification',
        rawPayload: data,
      });
    } else if (eventTypeRaw === 'Delivery' || eventTypeRaw === 'DELIVERY') {
      events.push({
        eventType: 'DELIVERED',
        email,
        providerMessageId: messageId,
        timestamp: new Date(),
        rawPayload: data,
      });
    }

    return {
      events,
      handled: events.length > 0,
    };
  }
}
