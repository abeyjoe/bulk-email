import nodemailer, { Transporter } from 'nodemailer';
import {
  EmailProvider,
  EmailMessage,
  EmailSendResult,
  ProviderStatus,
  ProviderCapacity,
} from '../provider.interface';
import { prisma } from '../../db/prisma';

export interface SmtpAdapterConfig {
  id: string;
  name?: string;
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  dkimDomain?: string;
  dkimKeySelector?: string;
  dkimPrivateKey?: string;
  dailyQuota?: number;
  perSecondRateLimit?: number;
  costPerThousand?: number;
}

export class SmtpAdapter implements EmailProvider {
  public readonly id: string;
  public readonly type = 'SMTP';
  public readonly name: string;
  private host: string;
  private port: number;
  private secure: boolean;
  private user?: string;
  private pass?: string;
  private dkimDomain?: string;
  private dkimKeySelector?: string;
  private dkimPrivateKey?: string;
  private dailyQuota: number;
  private perSecondRateLimit: number;
  private costPerThousand: number;
  private consecutiveFailures = 0;
  private transporter: Transporter | null = null;

  constructor(cfg: SmtpAdapterConfig) {
    this.id = cfg.id;
    this.name = cfg.name || 'Custom SMTP / Self-Hosted MTA';
    this.host = (cfg.host || '').trim();
    this.port = Number(cfg.port) || 587;
    this.secure = cfg.secure !== undefined ? Boolean(cfg.secure) : this.port === 465;
    this.user = cfg.user ? cfg.user.trim() : undefined;
    this.pass = cfg.pass ? cfg.pass : undefined;
    this.dkimDomain = cfg.dkimDomain?.trim() || undefined;
    this.dkimKeySelector = cfg.dkimKeySelector?.trim() || undefined;
    this.dkimPrivateKey = cfg.dkimPrivateKey?.trim() || undefined;
    this.dailyQuota = cfg.dailyQuota || 100000;
    this.perSecondRateLimit = cfg.perSecondRateLimit || 20.0;
    this.costPerThousand = cfg.costPerThousand ?? 0.0;
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const transportOptions: Record<string, any> = {
      pool: true,
      maxConnections: 10,
      maxMessages: 200,
      host: this.host,
      port: this.port,
      secure: this.secure,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false,
      },
    };

    if (this.user && this.pass) {
      transportOptions.auth = {
        user: this.user,
        pass: this.pass,
      };
    }

    if (this.dkimDomain && this.dkimKeySelector && this.dkimPrivateKey) {
      transportOptions.dkim = {
        domainName: this.dkimDomain,
        keySelector: this.dkimKeySelector,
        privateKey: this.dkimPrivateKey,
      };
    }

    this.transporter = nodemailer.createTransport(transportOptions);
    return this.transporter;
  }

  public async send(message: EmailMessage): Promise<EmailSendResult> {
    const timestamp = new Date();

    if (!this.host) {
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: 'SMTP Host is not configured',
        errorCode: 'SMTP_CONFIG_MISSING',
        isTransient: false,
      };
    }

    try {
      const transporter = this.getTransporter();
      const headers: Record<string, string> = { ...(message.headers || {}) };
      if (message.campaignId) headers['X-BulkEmail-Campaign-ID'] = message.campaignId;
      if (message.recipientId) headers['X-BulkEmail-Recipient-ID'] = message.recipientId;

      let effectiveFrom = message.from;
      if (this.user && this.user.includes('@')) {
        const userDomain = this.user.split('@')[1]?.toLowerCase();
        const fromEmail = message.from.includes('<')
          ? message.from.match(/<([^>]+)>/)?.[1]?.trim() || message.from
          : message.from.trim();
        const fromDomain = fromEmail.split('@')[1]?.toLowerCase();
        if (!fromDomain || fromDomain === 'bulkemail.cloud' || (userDomain && fromDomain !== userDomain)) {
          const displayName = message.from.includes('<') ? message.from.split('<')[0].trim() : '';
          effectiveFrom = displayName ? `${displayName} <${this.user}>` : this.user;
        }
      }

      const info = await transporter.sendMail({
        from: effectiveFrom,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });

      this.consecutiveFailures = 0;

      return {
        success: true,
        messageId: info.messageId || `smtp-${Date.now()}`,
        providerId: this.id,
        providerType: this.type,
        timestamp,
        costEstimateUsd: this.costPerThousand / 1000,
        rawResponse: {
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        },
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      const responseCode = Number(err.responseCode) || 0;
      const isRateLimit =
        responseCode === 421 ||
        responseCode === 450 ||
        /rate|too many|throttl|quota|limit/i.test(err.message || '');
      const isTransient =
        isRateLimit ||
        (responseCode >= 400 && responseCode < 500) ||
        ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET'].includes(err.code);

      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: err.message || 'SMTP delivery failed',
        errorCode: err.code || (responseCode ? `SMTP_${responseCode}` : 'SMTP_ERROR'),
        isTransient,
        rateLimited: isRateLimit,
        retryAfterMs: isRateLimit ? 30000 : undefined,
      };
    }
  }

  public async checkHealth(): Promise<ProviderStatus> {
    const lastChecked = new Date();

    if (!this.host) {
      return {
        status: 'PAUSED',
        healthStatus: 'DEGRADED',
        isProduction: false,
        consecutiveFailures: this.consecutiveFailures,
        lastChecked,
        message: 'SMTP host is missing',
      };
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      this.consecutiveFailures = 0;
      return {
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
        isProduction: true,
        consecutiveFailures: 0,
        lastChecked,
        message: `Connected to ${this.host}:${this.port} successfully`,
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      return {
        status: 'ACTIVE',
        healthStatus: 'DOWN',
        isProduction: false,
        consecutiveFailures: this.consecutiveFailures,
        lastChecked,
        message: `SMTP connection failed (${this.host}:${this.port}): ${err.message}`,
      };
    }
  }

  public async getCapacity(): Promise<ProviderCapacity> {
    const dbRecord = await prisma.providerAccount.findUnique({
      where: { id: this.id },
    });

    const dailyQuota = dbRecord?.dailyQuota ?? this.dailyQuota;
    const dailyUsed = dbRecord?.dailyUsed ?? 0;
    const monthlyQuota = dbRecord?.monthlyQuota ?? dailyQuota * 30;
    const monthlyUsed = dbRecord?.monthlyUsed ?? 0;

    return {
      dailyQuota,
      dailyUsed,
      dailyRemaining: Math.max(0, dailyQuota - dailyUsed),
      monthlyQuota,
      monthlyUsed,
      monthlyRemaining: Math.max(0, monthlyQuota - monthlyUsed),
      perSecondRateLimit: dbRecord?.perSecondRateLimit ?? this.perSecondRateLimit,
      costPerThousand: dbRecord?.costPerThousand ?? this.costPerThousand,
    };
  }
}
