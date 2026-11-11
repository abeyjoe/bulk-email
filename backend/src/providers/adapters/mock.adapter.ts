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

export interface MockAdapterConfig {
  id: string;
  name?: string;
  dailyQuota?: number;
  perSecondRateLimit?: number;
  costPerThousand?: number;
  simulatedDelayMs?: number;
  failureRate?: number; // 0.0 to 1.0
}

export class MockAdapter implements EmailProvider {
  public readonly id: string;
  public readonly type = 'MOCK';
  public readonly name: string;
  private dailyQuota: number;
  private perSecondRateLimit: number;
  private costPerThousand: number;
  private simulatedDelayMs: number;
  private failureRate: number;
  private consecutiveFailures = 0;
  private totalSent = 0;

  constructor(cfg: MockAdapterConfig) {
    this.id = cfg.id;
    this.name = cfg.name || 'Mock High-Volume Simulator';
    this.dailyQuota = cfg.dailyQuota || 200000;
    this.perSecondRateLimit = cfg.perSecondRateLimit || 50.0;
    this.costPerThousand = cfg.costPerThousand || 0.0;
    this.simulatedDelayMs = cfg.simulatedDelayMs ?? 5;
    this.failureRate = cfg.failureRate ?? 0;
  }

  public async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.simulatedDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedDelayMs));
    }

    const toLower = message.to.toLowerCase();
    const timestamp = new Date();

    // 1. Check for simulated Rate Limit (429)
    if (toLower.includes('ratelimit') || toLower.includes('simulate-429')) {
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: 'Simulated 429 Too Many Requests: Upstream rate limit reached',
        errorCode: 'RATE_LIMIT_429',
        isTransient: true,
        rateLimited: true,
        retryAfterMs: 5000,
      };
    }

    // 2. Check for simulated Hard Bounce
    if (toLower.includes('bounce') || toLower === 'bounce@simulator.amazonses.com') {
      return {
        success: false,
        messageId: `mock-bounce-${crypto.randomBytes(4).toString('hex')}`,
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: 'Simulated 550 5.1.1 User does not exist (Hard Bounce)',
        errorCode: 'HARD_BOUNCE',
        isTransient: false,
      };
    }

    // 3. Check for simulated Transient Error
    if (toLower.includes('transient') || toLower.includes('timeout')) {
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: 'Simulated 503 Service Unavailable (Temporary Gateway Timeout)',
        errorCode: 'TEMPORARY_ERROR',
        isTransient: true,
      };
    }

    // 4. Random failure rate simulation
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      this.consecutiveFailures++;
      return {
        success: false,
        messageId: '',
        providerId: this.id,
        providerType: this.type,
        timestamp,
        error: 'Simulated random hardware / socket disruption',
        errorCode: 'RANDOM_FAILURE',
        isTransient: true,
      };
    }

    this.consecutiveFailures = 0;
    this.totalSent++;

    return {
      success: true,
      messageId: `mock-msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      providerId: this.id,
      providerType: this.type,
      timestamp,
      costEstimateUsd: 0,
    };
  }

  public async checkHealth(): Promise<ProviderStatus> {
    return {
      status: 'ACTIVE',
      healthStatus: this.consecutiveFailures > 10 ? 'DEGRADED' : 'HEALTHY',
      isProduction: false,
      consecutiveFailures: this.consecutiveFailures,
      lastChecked: new Date(),
    };
  }

  public async getCapacity(): Promise<ProviderCapacity> {
    const dbAccount = await prisma.providerAccount.findUnique({
      where: { id: this.id },
    });

    const dailyQuota = dbAccount?.dailyQuota || this.dailyQuota;
    const dailyUsed = dbAccount?.dailyUsed || this.totalSent;
    const monthlyQuota = dbAccount?.monthlyQuota || 6000000;
    const monthlyUsed = dbAccount?.monthlyUsed || this.totalSent;

    return {
      dailyQuota,
      dailyUsed,
      dailyRemaining: Math.max(0, dailyQuota - dailyUsed),
      monthlyQuota,
      monthlyUsed,
      monthlyRemaining: Math.max(0, monthlyQuota - monthlyUsed),
      perSecondRateLimit: dbAccount?.perSecondRateLimit || this.perSecondRateLimit,
      costPerThousand: this.costPerThousand,
    };
  }

  public async processWebhook(payload: any): Promise<WebhookProcessingResult> {
    return {
      events: [],
      handled: true,
    };
  }
}
