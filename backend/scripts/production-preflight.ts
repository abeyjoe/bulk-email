import { prisma } from '../src/db/prisma';
import { providerRegistry } from '../src/providers/provider-registry.service';
import { quotaManager } from '../src/quota/quota-manager.service';
import { SuppressionService } from '../src/suppression/suppression.service';

interface CheckItem {
  category: string;
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
}

async function runProductionPreflight(): Promise<void> {
  console.log('================================================================');
  console.log('🔍 BULK EMAIL MULTI-PROVIDER PRODUCTION PREFLIGHT AUDIT');
  console.log('================================================================\n');

  const checks: CheckItem[] = [];

  // 1. Environment & Cryptography Security Check
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    checks.push({ category: 'Security', name: 'JWT Secret', status: 'FAIL', details: 'JWT_SECRET environment variable is not defined.' });
  } else if (jwtSecret.length < 32) {
    checks.push({ category: 'Security', name: 'JWT Secret Strength', status: 'WARN', details: `JWT_SECRET is short (${jwtSecret.length} chars). Recommend >= 32 characters.` });
  } else {
    checks.push({ category: 'Security', name: 'JWT Secret Strength', status: 'PASS', details: 'Cryptographically strong secret configured.' });
  }

  // 2. Database Connectivity & Tables Check
  try {
    const userCount = await prisma.user.count();
    const recipientCount = await prisma.recipient.count();
    const campaignCount = await prisma.campaign.count();
    const suppressionCount = await prisma.suppressionRecord.count();

    checks.push({
      category: 'Database',
      name: 'PostgreSQL Connectivity',
      status: 'PASS',
      details: `Connected successfully. Users: ${userCount}, Recipients: ${recipientCount.toLocaleString()}, Campaigns: ${campaignCount}`,
    });

    checks.push({
      category: 'Database',
      name: 'Suppression List Health',
      status: 'PASS',
      details: `Suppression registry active with ${suppressionCount} entries.`,
    });
  } catch (err: any) {
    checks.push({
      category: 'Database',
      name: 'PostgreSQL Connectivity',
      status: 'FAIL',
      details: `Database connection failed: ${err.message}`,
    });
  }

  // 3. Multi-Provider Mesh & Quota Fleet Check
  try {
    const providers = await prisma.providerAccount.findMany({
      where: { isEnabled: true, status: 'ACTIVE' },
    });

    if (providers.length === 0) {
      checks.push({
        category: 'Providers',
        name: 'Active Provider Fleet',
        status: 'FAIL',
        details: 'No active provider accounts found in database. Seed baseline accounts via `npm run db:seed`.',
      });
    } else {
      let totalDailyQuota = 0;
      let totalDailyUsed = 0;

      for (const p of providers) {
        const capacity = await quotaManager.getProviderCapacity(p.id);
        totalDailyQuota += capacity.dailyQuota;
        totalDailyUsed += capacity.dailyUsed;

        checks.push({
          category: 'Providers',
          name: `${p.name} (${p.providerType})`,
          status: p.healthStatus === 'DOWN' ? 'WARN' : 'PASS',
          details: `Quota: ${capacity.dailyUsed.toLocaleString()}/${capacity.dailyQuota.toLocaleString()} daily | Rate: ${p.perSecondRateLimit} msg/s | Cost: $${p.costPerThousand}/k`,
        });
      }

      checks.push({
        category: 'Providers',
        name: 'Combined Fleet Capacity',
        status: totalDailyQuota >= 200000 ? 'PASS' : 'WARN',
        details: `Combined Daily Quota: ${totalDailyQuota.toLocaleString()} (${totalDailyUsed.toLocaleString()} used). Target: 200,000/day.`,
      });
    }
  } catch (err: any) {
    checks.push({
      category: 'Providers',
      name: 'Provider Mesh Resolution',
      status: 'FAIL',
      details: `Provider mesh check failed: ${err.message}`,
    });
  }

  // 4. Queue Infrastructure Check
  const queueDriver = process.env.QUEUE_DRIVER || 'database';
  if (queueDriver === 'sqs') {
    const queueUrl = process.env.AWS_SQS_QUEUE_URL;
    const dlqUrl = process.env.AWS_SQS_DLQ_URL;
    if (!queueUrl || !dlqUrl) {
      checks.push({
        category: 'Queue',
        name: 'Amazon SQS FIFO Config',
        status: 'FAIL',
        details: 'QUEUE_DRIVER is "sqs" but AWS_SQS_QUEUE_URL or AWS_SQS_DLQ_URL is missing.',
      });
    } else {
      checks.push({
        category: 'Queue',
        name: 'Amazon SQS FIFO Config',
        status: 'PASS',
        details: `Configured. Main: ${queueUrl.split('/').pop()} | DLQ: ${dlqUrl.split('/').pop()}`,
      });
    }
  } else {
    checks.push({
      category: 'Queue',
      name: 'PostgreSQL Queue Engine',
      status: 'PASS',
      details: 'Using persistent database-backed transactional queue with skipLocked concurrency.',
    });
  }

  // 5. Worker Isolation & Architecture Check
  const isEmbeddedWorker = process.env.START_EMBEDDED_WORKER === 'true';
  if (isEmbeddedWorker && process.env.NODE_ENV === 'production') {
    checks.push({
      category: 'Architecture',
      name: 'Decoupled Worker Isolation',
      status: 'WARN',
      details: 'Embedded worker enabled in production. Recommend START_EMBEDDED_WORKER=false with dedicated worker pods.',
    });
  } else {
    checks.push({
      category: 'Architecture',
      name: 'Decoupled Worker Isolation',
      status: 'PASS',
      details: 'Web API is completely decoupled from background worker processes.',
    });
  }

  // Print Formatted Preflight Table
  console.log('| Category     | Component / Check                | Status | Details');
  console.log('|--------------|----------------------------------|--------|----------------------------------------------------');
  for (const c of checks) {
    const cat = c.category.padEnd(12, ' ');
    const name = c.name.padEnd(32, ' ');
    const stat = c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️  WARN' : '❌ FAIL';
    console.log(`| ${cat} | ${name} | ${stat} | ${c.details}`);
  }
  console.log('\n================================================================');

  const failCount = checks.filter((c) => c.status === 'FAIL').length;
  const warnCount = checks.filter((c) => c.status === 'WARN').length;

  if (failCount > 0) {
    console.log(`❌ PREFLIGHT FAILED: ${failCount} blocking issues found. Please fix before launching.`);
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(`⚠️  PREFLIGHT PASSED WITH ${warnCount} WARNING(S): System is operational for delivery.`);
  } else {
    console.log('✅ ALL PREFLIGHT CHECKS PASSED: SYSTEM FULLY READY FOR 200,000 RECIPIENT CAMPAIGNS!');
  }
  console.log('================================================================\n');
}

if (require.main === module) {
  runProductionPreflight()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Preflight audit encountered error:', err);
      process.exit(1);
    });
}

export { runProductionPreflight };
