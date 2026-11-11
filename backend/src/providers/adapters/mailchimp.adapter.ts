import crypto from 'crypto';
import {
  EmailProvider,
  EmailMessage,
  EmailSendResult,
  ProviderStatus,
  ProviderCapacity,
  WebhookProcessingResult,
} from '../provider.interface';
import { prisma } from '../../db/prisma';

export interface MailchimpAdapterConfig {
  id: string;
  name?: string;
  apiKey: string;
  serverPrefix?: string; // e.g. "us19"
  dailyQuota?: number;
  perSecondRateLimit?: number;
  costPerThousand?: number;
}

export class MailchimpAdapter implements EmailProvider {
  public readonly id: string;
  public readonly type = 'MAILCHIMP';
  public readonly name: string;
  private apiKey: string;
  private serverPrefix: string;
  private consecutiveFailures = 0;
  private dailyQuota: number;
  private perSecondRateLimit: number;
  private costPerThousand: number;

  constructor(cfg: MailchimpAdapterConfig) {
    this.id = cfg.id;
    this.name = cfg.name || 'Mailchimp Marketing & Sync';
    this.apiKey = cfg.apiKey;
    this.dailyQuota = cfg.dailyQuota || 10000;
    this.perSecondRateLimit = cfg.perSecondRateLimit || 4.0;
    this.costPerThousand = cfg.costPerThousand || 1.00;

    // Derive data center (dc) from api key (e.g. "xxxx-us19")
    if (cfg.apiKey && cfg.apiKey.includes('-')) {
      this.serverPrefix = cfg.apiKey.split('-')[1];
    } else {
      this.serverPrefix = cfg.serverPrefix || 'us1';
    }
  }

  private get baseUrl(): string {
    return `https://${this.serverPrefix}.api.mailchimp.com/3.0`;
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
        error: 'Mailchimp API key is not configured or is a placeholder',
        errorCode: 'MAILCHIMP_AUTH_MISSING',
        isTransient: false,
      };
    }

    try {
      // Transactional relay via Mandrill / Mailchimp Transactional
      const res = await fetch('https://mandrillapp.com/api/1.0/messages/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: this.apiKey,
          message: {
            html: message.html,
            text: message.text,
            subject: message.subject,
            from_email: message.from.includes('<') ? message.from.match(/<([^>]+)>/)?.[1] || message.from : message.from,
            to: [{ email: message.to, type: 'to' }],
            headers: message.headers,
          },
        }),
      });

      const responseBody = await res.json().catch(() => ({}));

      if (res.ok && Array.isArray(responseBody) && responseBody[0]?.status !== 'rejected') {
        this.consecutiveFailures = 0;
        return {
          success: true,
          messageId: responseBody[0]?._id || `mc-${Date.now()}`,
          providerId: this.id,
          providerType: this.type,
          timestamp,
          costEstimateUsd: this.costPerThousand / 1000,
          rawResponse: responseBody,
        };
      }

      // If Mandrill endpoint rejected (e.g. standard marketing key instead of transactional key),
      // fallback to audience sync verification
      if (!res.ok) {
        return {
          success: false,
          messageId: '',
          providerId: this.id,
          providerType: this.type,
          timestamp,
          error: Array.isArray(responseBody) ? responseBody[0]?.reject_reason : responseBody.message || `Mailchimp error HTTP ${res.status}`,
          errorCode: 'MAILCHIMP_DISPATCH_REJECTED',
          isTransient: res.status >= 500,
        };
      }

      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: `Rejected: ${responseBody[0]?.reject_reason || 'Unknown'}`,
        errorCode: 'MAILCHIMP_REJECTED',
        isTransient: false,
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: err.message || 'Mailchimp network failure',
        errorCode: 'MAILCHIMP_NETWORK_ERROR',
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
        message: 'Mailchimp API key not provisioned',
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/ping`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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

      return {
        status: 'PAUSED',
        healthStatus: 'DEGRADED',
        isProduction: false,
        consecutiveFailures: this.consecutiveFailures,
        lastChecked,
        message: `HTTP ${res.status}`,
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
    const monthlyQuota = dbAccount?.monthlyQuota || 300000;
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

    const type = data.type;
    const email = data.data?.email;
    const events: any[] = [];

    if (type === 'cleaned') {
      // Cleaned in Mailchimp means hard bounce
      events.push({
        eventType: 'HARD_BOUNCE',
        email,
        timestamp: new Date(),
        reason: data.data?.reason || 'Mailchimp cleaned address (hard bounce)',
        rawPayload: data,
      });
    } else if (type === 'unsubscribe') {
      events.push({
        eventType: 'UNSUBSCRIBE',
        email,
        timestamp: new Date(),
        reason: data.data?.reason || 'User clicked unsubscribe in Mailchimp',
        rawPayload: data,
      });
    }

    return {
      events,
      handled: events.length > 0,
    };
  }
}
