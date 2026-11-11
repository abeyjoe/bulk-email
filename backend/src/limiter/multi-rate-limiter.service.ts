/**
 * Multi-Provider Token Bucket Rate Limiter
 * Manages independent, thread-safe token buckets per provider account,
 * combined with a global outbound throughput ceiling.
 */

interface BucketState {
  providerId: string;
  ratePerSecond: number;
  maxTokens: number;
  currentTokens: number;
  lastRefillTimestamp: number;
  cooldownUntil: number; // timestamp until which sends are paused (e.g. after HTTP 429)
}

export class MultiRateLimiterService {
  private buckets: Map<string, BucketState> = new Map();
  private globalRatePerSecond: number;
  private globalMaxTokens: number;
  private globalCurrentTokens: number;
  private globalLastRefillTimestamp: number;

  constructor(globalRatePerSecond: number = 50.0) {
    this.globalRatePerSecond = Math.max(1.0, globalRatePerSecond);
    this.globalMaxTokens = Math.max(1, Math.ceil(this.globalRatePerSecond));
    this.globalCurrentTokens = this.globalMaxTokens;
    this.globalLastRefillTimestamp = Date.now();
  }

  /**
   * Register or update the rate limit for a specific provider.
   */
  public registerProviderRate(providerId: string, ratePerSecond: number): void {
    const rate = Math.max(0.1, ratePerSecond);
    const existing = this.buckets.get(providerId);

    if (existing) {
      this.refillBucket(existing);
      existing.ratePerSecond = rate;
      existing.maxTokens = Math.max(1, Math.ceil(rate));
      existing.currentTokens = Math.min(existing.currentTokens, existing.maxTokens);
    } else {
      const maxTokens = Math.max(1, Math.ceil(rate));
      this.buckets.set(providerId, {
        providerId,
        ratePerSecond: rate,
        maxTokens,
        currentTokens: maxTokens,
        lastRefillTimestamp: Date.now(),
        cooldownUntil: 0,
      });
    }
  }

  /**
   * Set the overall system-wide dispatch rate limit.
   */
  public setGlobalRate(rate: number): void {
    this.refillGlobal();
    this.globalRatePerSecond = Math.max(1.0, rate);
    this.globalMaxTokens = Math.max(1, Math.ceil(this.globalRatePerSecond));
    this.globalCurrentTokens = Math.min(this.globalCurrentTokens, this.globalMaxTokens);
  }

  /**
   * Report an upstream 429 Too Many Requests event from a provider to trigger safety cooldown.
   */
  public reportRateLimitHit(providerId: string, cooldownSeconds: number = 30): void {
    const bucket = this.buckets.get(providerId);
    const cooldownMs = Math.max(5000, cooldownSeconds * 1000);
    const now = Date.now();

    if (bucket) {
      bucket.cooldownUntil = now + cooldownMs;
      bucket.currentTokens = 0; // drain tokens
      console.warn(`[MultiRateLimiter] Provider ${providerId} rate-limited. Cooldown for ${cooldownMs / 1000}s`);
    }
  }

  /**
   * Acquire sending permits for a provider.
   * Awaits both provider bucket and global bucket availability.
   */
  public async acquire(providerId: string, tokens: number = 1): Promise<void> {
    if (!this.buckets.has(providerId)) {
      // Default fallback bucket at 5 msg/sec
      this.registerProviderRate(providerId, 5.0);
    }

    const bucket = this.buckets.get(providerId)!;

    while (true) {
      const now = Date.now();

      // 1. Check if provider is under cooldown
      if (bucket.cooldownUntil > now) {
        const remainingCooldown = bucket.cooldownUntil - now;
        await new Promise((r) => setTimeout(r, Math.min(remainingCooldown, 2000)));
        continue;
      }

      // 2. Refill both buckets
      this.refillBucket(bucket);
      this.refillGlobal();

      // 3. Check token availability
      if (bucket.currentTokens >= tokens && this.globalCurrentTokens >= tokens) {
        bucket.currentTokens -= tokens;
        this.globalCurrentTokens -= tokens;
        return;
      }

      // 4. Calculate necessary delay
      const providerDeficit = Math.max(0, tokens - bucket.currentTokens);
      const globalDeficit = Math.max(0, tokens - this.globalCurrentTokens);

      const providerWaitMs = providerDeficit > 0 ? (providerDeficit / bucket.ratePerSecond) * 1000 : 0;
      const globalWaitMs = globalDeficit > 0 ? (globalDeficit / this.globalRatePerSecond) * 1000 : 0;

      const waitMs = Math.max(25, Math.ceil(Math.max(providerWaitMs, globalWaitMs)));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  private refillBucket(bucket: BucketState): void {
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefillTimestamp) / 1000;
    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * bucket.ratePerSecond;
      bucket.currentTokens = Math.min(bucket.maxTokens, bucket.currentTokens + tokensToAdd);
      bucket.lastRefillTimestamp = now;
    }
  }

  private refillGlobal(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.globalLastRefillTimestamp) / 1000;
    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.globalRatePerSecond;
      this.globalCurrentTokens = Math.min(this.globalMaxTokens, this.globalCurrentTokens + tokensToAdd);
      this.globalLastRefillTimestamp = now;
    }
  }

  /**
   * Introspect current rates and token levels.
   */
  public getStatus() {
    const now = Date.now();
    const providerStatuses: Record<string, any> = {};

    for (const [id, bucket] of this.buckets.entries()) {
      providerStatuses[id] = {
        ratePerSecond: bucket.ratePerSecond,
        currentTokens: Math.round(bucket.currentTokens * 100) / 100,
        maxTokens: bucket.maxTokens,
        isCoolingDown: bucket.cooldownUntil > now,
        cooldownRemainingSec: Math.max(0, Math.ceil((bucket.cooldownUntil - now) / 1000)),
      };
    }

    return {
      globalRatePerSecond: this.globalRatePerSecond,
      globalCurrentTokens: Math.round(this.globalCurrentTokens * 100) / 100,
      providers: providerStatuses,
    };
  }
}

export const multiRateLimiter = new MultiRateLimiterService(50.0);
