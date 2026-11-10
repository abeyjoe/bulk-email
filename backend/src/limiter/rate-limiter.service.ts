/**
 * Token Bucket Rate Limiter
 * Ensures strict global sending rate across all asynchronous worker tasks.
 */
export class RateLimiterService {
  private ratePerSecond: number;
  private maxTokens: number;
  private currentTokens: number;
  private lastRefillTimestamp: number;

  constructor(ratePerSecond: number = 5.0) {
    this.ratePerSecond = Math.max(0.5, ratePerSecond);
    this.maxTokens = Math.max(1, Math.ceil(this.ratePerSecond));
    this.currentTokens = this.maxTokens;
    this.lastRefillTimestamp = Date.now();
  }

  public setRate(rate: number): void {
    this.refill();
    this.ratePerSecond = Math.max(0.5, rate);
    this.maxTokens = Math.max(1, Math.ceil(this.ratePerSecond));
    this.currentTokens = Math.min(this.currentTokens, this.maxTokens);
  }

  public getRate(): number {
    return this.ratePerSecond;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTimestamp) / 1000;
    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.ratePerSecond;
      this.currentTokens = Math.min(this.maxTokens, this.currentTokens + tokensToAdd);
      this.lastRefillTimestamp = now;
    }
  }

  /**
   * Acquire a sending permit.
   * If rate limit is reached, this promise resolves only when tokens are replenished.
   */
  public async acquire(tokens: number = 1): Promise<void> {
    while (true) {
      this.refill();
      if (this.currentTokens >= tokens) {
        this.currentTokens -= tokens;
        return;
      }

      // Calculate how long to wait until enough tokens are available
      const deficit = tokens - this.currentTokens;
      const waitMs = Math.ceil((deficit / this.ratePerSecond) * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.max(20, waitMs)));
    }
  }
}

// Global singleton instance shared across worker tasks
export const globalRateLimiter = new RateLimiterService(5.0);
