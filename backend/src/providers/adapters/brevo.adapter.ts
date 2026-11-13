import {
  EmailProvider,
  EmailMessage,
  EmailSendResult,
  ProviderStatus,
  ProviderCapacity,
  WebhookProcessingResult,
} from '../provider.interface';
import { prisma } from '../../db/prisma';

export interface BrevoAdapterConfig {
  id: string;
  name?: string;
  apiKey: string;
  dailyQuota?: number;
  perSecondRateLimit?: number;
  costPerThousand?: number;
}

export class BrevoAdapter implements EmailProvider {
  public readonly id: string;
  public readonly type = 'BREVO';
  public readonly name: string;
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';
  private consecutiveFailures = 0;
  private dailyQuota: number;
  private perSecondRateLimit: number;
  private costPerThousand: number;

  constructor(cfg: BrevoAdapterConfig) {
    this.id = cfg.id;
    this.name = cfg.name || 'Brevo API';
    this.apiKey = cfg.apiKey;
    this.dailyQuota = cfg.dailyQuota || 40000;
    this.perSecondRateLimit = cfg.perSecondRateLimit || 5.0;
    this.costPerThousand = cfg.costPerThousand || 0.25;
  }

  public async send(message: EmailMessage): Promise<EmailSendResult> {
    const timestamp = new Date();

    if (!this.apiKey || this.apiKey.includes('***')) {
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: 'Brevo API key is not configured or is a placeholder',
        errorCode: 'BREVO_AUTH_MISSING',
        isTransient: false,
      };
    }

    try {
      const payload: Record<string, any> = {
        sender: {
          name: message.from.includes('<') ? message.from.split('<')[0].trim() : undefined,
          email: message.from.includes('<') ? message.from.match(/<([^>]+)>/)?.[1] || message.from : message.from,
        },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
      };

      if (message.text) {
        payload.textContent = message.text;
      }

      if (message.replyTo) {
        payload.replyTo = { email: message.replyTo };
      }

      const headers: Record<string, string> = { ...message.headers };
      if (message.campaignId) headers['X-BulkEmail-Campaign-ID'] = message.campaignId;
      if (message.recipientId) headers['X-BulkEmail-Recipient-ID'] = message.recipientId;
      payload.headers = headers;

      if (message.campaignId) {
        payload.tags = [`campaign-${message.campaignId}`];
      }

      const res = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await res.json().catch(() => ({}));

      if (res.status === 201 || res.status === 200) {
        this.consecutiveFailures = 0;
        return {
          success: true,
          messageId: responseBody.messageId || `brevo-${Date.now()}`,
          providerId: this.id,
          providerType: this.type,
          timestamp,
          costEstimateUsd: this.costPerThousand / 1000,
          rawResponse: responseBody,
        };
      }

      this.consecutiveFailures++;
      const isRateLimit = res.status === 429;
      const isQuotaExceeded = res.status === 402;
      const isTransient = isRateLimit || res.status >= 500;

      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: responseBody.message || `Brevo HTTP ${res.status}`,
        errorCode: responseBody.code || (isRateLimit ? 'RATE_LIMIT' : `HTTP_${res.status}`),
        isTransient,
        rateLimited: isRateLimit,
        retryAfterMs: isRateLimit ? 30000 : undefined,
        costEstimateUsd: 0,
        rawResponse: responseBody,
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: err.message || 'Brevo network dispatch failure',
        errorCode: 'BREVO_NETWORK_ERROR',
        isTransient: true,
      };
    }
  }

  public async checkHealth(): Promise<ProviderStatus> {
    const lastChecked = new Date();
    if (!this.apiKey || this.apiKey.includes('***')) {
      return {
        status: 'PAUSED',
        healthStatus: 'DEGRADED',
        isProduction: false,
        consecutiveFailures: 0,
        lastChecked,
        message: 'Brevo API key not provisioned',
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/account`, {
        headers: {
          'api-key': this.apiKey,
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        return {
          status: 'ACTIVE',
          healthStatus: 'HEALTHY',
          isProduction: true,
          consecutiveFailures: 0,
          lastChecked,
        };
      }

      let errorMsg = `HTTP ${res.status}`;
      try {
        const errorJson = await res.json();
        if (errorJson.message) {
          errorMsg = errorJson.message;
        }
      } catch {}

      return {
        status: 'PAUSED',
        healthStatus: 'DEGRADED',
        isProduction: false,
        consecutiveFailures: this.consecutiveFailures,
        lastChecked,
        message: errorMsg,
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
    const monthlyQuota = dbAccount?.monthlyQuota || 1000000;
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

  public async processWebhook(payload: any): Promise<WebhookProcessingResult> {
    let data = payload;
    if (typeof payload === 'string') {
      try { data = JSON.parse(payload); } catch {}
    }

    const eventName = data.event || data['event-name'];
    const email = data.email;
    const messageId = data['message-id'] || data.messageId;
    const events: any[] = [];

    if (eventName === 'hard_bounce') {
      events.push({
        eventType: 'HARD_BOUNCE',
        email,
        providerMessageId: messageId,
        timestamp: new Date(data.date || Date.now()),
        reason: data.reason || 'Brevo hard bounce',
        rawPayload: data,
      });
    } else if (eventName === 'soft_bounce') {
      events.push({
        eventType: 'SOFT_BOUNCE',
        email,
        providerMessageId: messageId,
        timestamp: new Date(data.date || Date.now()),
        reason: data.reason || 'Brevo soft bounce',
        rawPayload: data,
      });
    } else if (eventName === 'spam' || eventName === 'complaint') {
      events.push({
        eventType: 'COMPLAINT',
        email,
        providerMessageId: messageId,
        timestamp: new Date(data.date || Date.now()),
        reason: 'Brevo spam complaint reported',
        rawPayload: data,
      });
    } else if (eventName === 'delivered') {
      events.push({
        eventType: 'DELIVERED',
        email,
        providerMessageId: messageId,
        timestamp: new Date(data.date || Date.now()),
        rawPayload: data,
      });
    } else if (eventName === 'unsubscribe') {
      events.push({
        eventType: 'UNSUBSCRIBE',
        email,
        providerMessageId: messageId,
        timestamp: new Date(data.date || Date.now()),
        rawPayload: data,
      });
    }

    return {
      events,
      handled: events.length > 0,
    };
  }
}
