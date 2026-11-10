import { RateLimiterService } from '../src/limiter/rate-limiter.service';

describe('RateLimiterService', () => {
  it('should initialize with configured rate', () => {
    const limiter = new RateLimiterService(10.0);
    expect(limiter.getRate()).toBe(10.0);
  });

  it('should dynamically update the rate', () => {
    const limiter = new RateLimiterService(5.0);
    limiter.setRate(14.0);
    expect(limiter.getRate()).toBe(14.0);
  });

  it('should enforce acquire timing when consuming tokens', async () => {
    const limiter = new RateLimiterService(5.0); // 5 tokens/sec
    const start = Date.now();

    // Consume all available tokens and then some
    await limiter.acquire(5);
    await limiter.acquire(1); // Should require a refill wait

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150); // Waited for refill
  });
});
