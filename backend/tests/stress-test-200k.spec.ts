import { run200kStressTest } from '../scripts/stress-test-200k';

describe('200,000 Recipient Scale Benchmark & Memory Audit', () => {
  it(
    'should plan, reserve, enqueue, and process high-volume workload with zero data loss',
    async () => {
      const metrics = await run200kStressTest();

      expect(metrics.totalTargetRecipients).toBe(200000);
      expect(metrics.planningTimeMs).toBeLessThan(2000); // Sub-2-second planning

      const totalAllocated = metrics.allocations.reduce((sum, a) => sum + a.allocatedCount, 0);
      expect(totalAllocated).toBe(200000);

      // Verify fleet spillover: all 4 tiers received allocations according to priority
      expect(metrics.allocations.length).toBe(4);
      expect(metrics.allocations[0].type).toBe('SES');
      expect(metrics.allocations[0].allocatedCount).toBe(50000); // 100% full
      expect(metrics.allocations[1].type).toBe('BREVO');
      expect(metrics.allocations[1].allocatedCount).toBe(35000); // 100% full
      expect(metrics.allocations[2].type).toBe('MAILCHIMP');
      expect(metrics.allocations[2].allocatedCount).toBe(15000); // 100% full
      expect(metrics.allocations[3].type).toBe('MOCK');
      expect(metrics.allocations[3].allocatedCount).toBe(100000); // Spilled remainder

      // Verify deduplication
      expect(metrics.duplicateSendsDetected).toBe(0);

      // Verify memory stability (heap remains stable under continuous load)
      expect(metrics.heapMemoryPeakMb).toBeLessThan(512); // Under 512MB
    },
    120000 // 120-second test timeout
  );
});
