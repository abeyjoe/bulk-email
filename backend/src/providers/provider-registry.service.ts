import { EmailProvider } from './provider.interface';
import { SesAdapter } from './adapters/ses.adapter';
import { BrevoAdapter } from './adapters/brevo.adapter';
import { MailchimpAdapter } from './adapters/mailchimp.adapter';
import { MockAdapter } from './adapters/mock.adapter';
import { prisma } from '../db/prisma';
import { multiRateLimiter } from '../limiter/multi-rate-limiter.service';
import { config } from '../config';

export class ProviderRegistryService {
  private cache: Map<string, EmailProvider> = new Map();

  /**
   * Resolve an EmailProvider instance by its ID.
   */
  public async getProvider(providerId: string): Promise<EmailProvider> {
    if (this.cache.has(providerId)) {
      return this.cache.get(providerId)!;
    }

    const account = await prisma.providerAccount.findUnique({
      where: { id: providerId },
    });

    if (!account) {
      throw new Error(`Provider account not found with ID: ${providerId}`);
    }

    const provider = this.instantiateAdapter(account);
    this.cache.set(providerId, provider);

    // Register rate limit in multi-rate-limiter
    multiRateLimiter.registerProviderRate(account.id, account.perSecondRateLimit);

    return provider;
  }

  /**
   * Retrieve all enabled provider instances.
   */
  public async getAllEnabledProviders(): Promise<EmailProvider[]> {
    const accounts = await prisma.providerAccount.findMany({
      where: {
        isEnabled: true,
        status: 'ACTIVE',
      },
      orderBy: {
        priority: 'asc',
      },
    });

    const providers: EmailProvider[] = [];
    for (const account of accounts) {
      if (!this.cache.has(account.id)) {
        const inst = this.instantiateAdapter(account);
        this.cache.set(account.id, inst);
        multiRateLimiter.registerProviderRate(account.id, account.perSecondRateLimit);
      }
      providers.push(this.cache.get(account.id)!);
    }

    return providers;
  }

  /**
   * Retrieve the system default provider.
   */
  public async getDefaultProvider(): Promise<EmailProvider> {
    let account = await prisma.providerAccount.findFirst({
      where: { isDefault: true, isEnabled: true },
    });

    if (!account) {
      account = await prisma.providerAccount.findFirst({
        where: { isEnabled: true },
        orderBy: { priority: 'asc' },
      });
    }

    if (!account) {
      // Fallback in-memory mock if no accounts seeded
      const fallback = new MockAdapter({ id: 'fallback-mock', name: 'Fallback Simulator' });
      this.cache.set('fallback-mock', fallback);
      return fallback;
    }

    return this.getProvider(account.id);
  }

  /**
   * Register a custom provider instance (used in automated unit tests).
   */
  public registerCustom(provider: EmailProvider): void {
    this.cache.set(provider.id, provider);
  }

  /**
   * Evict a cached provider instance (e.g. after credentials or rate limit updates).
   */
  public evict(providerId: string): void {
    this.cache.delete(providerId);
  }

  /**
   * Clear all cached providers and reload from database.
   */
  public async reloadAll(): Promise<void> {
    this.cache.clear();
    await this.getAllEnabledProviders();
  }

  private instantiateAdapter(account: any): EmailProvider {
    const pType = account.providerType.toUpperCase();
    const creds = (account.credentialsEncrypted as Record<string, any>) || {};

    switch (pType) {
      case 'SES':
        return new SesAdapter({
          id: account.id,
          name: account.name,
          region: account.region || config.aws.region,
          accessKeyId: creds.accessKeyId || config.aws.accessKeyId || undefined,
          secretAccessKey: creds.secretAccessKey || config.aws.secretAccessKey || undefined,
          dailyQuota: account.dailyQuota,
          perSecondRateLimit: account.perSecondRateLimit,
          costPerThousand: account.costPerThousand,
        });

      case 'BREVO':
        return new BrevoAdapter({
          id: account.id,
          name: account.name,
          apiKey: creds.apiKey || process.env.BREVO_API_KEY || account.accessKeyMasked || '',
          dailyQuota: account.dailyQuota,
          perSecondRateLimit: account.perSecondRateLimit,
          costPerThousand: account.costPerThousand,
        });

      case 'MAILCHIMP':
        return new MailchimpAdapter({
          id: account.id,
          name: account.name,
          apiKey: creds.apiKey || process.env.MAILCHIMP_API_KEY || account.accessKeyMasked || '',
          serverPrefix: account.region || 'us1',
          dailyQuota: account.dailyQuota,
          perSecondRateLimit: account.perSecondRateLimit,
          costPerThousand: account.costPerThousand,
        });

      case 'MOCK':
      default:
        return new MockAdapter({
          id: account.id,
          name: account.name,
          dailyQuota: account.dailyQuota,
          perSecondRateLimit: account.perSecondRateLimit,
          costPerThousand: account.costPerThousand,
          simulatedDelayMs: account.isSandbox ? 2 : 5,
        });
    }
  }
}

export const providerRegistry = new ProviderRegistryService();
