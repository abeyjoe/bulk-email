import { MultiRateLimiterService } from '../src/limiter/multi-rate-limiter.service';

describe('MultiRateLimiterService', () => {
  it('should register and track independent provider buckets', () => {
    const limiter = new MultiRateLimiterService(50.0);

    limiter.registerProviderRate('provider-ses', 14.0);
    limiter.registerProviderRate('provider-brevo', 5.0);

    const status = limiter.getStatus();
    expect(status.providers['provider-ses'].ratePerSecond).toBe(14.0);
    expect(status.providers['provider-brevo'].ratePerSecond).toBe(5.0);
    expect(status.providers['provider-ses'].isCoolingDown).toBe(false);
  });

  it('should enforce cooldown when 429 rate limit is reported', () => {
    const limiter = new MultiRateLimiterService(50.0);
    limiter.registerProviderRate('provider-brevo', 5.0);

    limiter.reportRateLimitHit('provider-brevo', 10);

    const status = limiter.getStatus();
    expect(status.providers['provider-brevo'].isCoolingDown).toBe(true);
    expect(status.providers['provider-brevo'].cooldownRemainingSec).toBeGreaterThanOrEqual(8);
  });

  it('should throttle tokens per provider independently', async () => {
    const limiter = new MultiRateLimiterService(100.0);
    limiter.registerProviderRate('fast-provider', 20.0);

    const start = Date.now();
    // Acquire tokens within limits
    await limiter.acquire('fast-provider', 2);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
