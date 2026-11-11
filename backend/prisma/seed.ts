import { PrismaClient, Role, SuppressionReason } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding database...');

  // 1. Admin & Manager Users
  const adminPassword = await bcrypt.hash('AdminSecure2026!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@bulkemail.cloud' },
    update: {},
    create: {
      email: 'admin@bulkemail.cloud',
      name: 'System Administrator',
      passwordHash: adminPassword,
      role: Role.ADMIN,
    },
  });

  const managerPassword = await bcrypt.hash('ManagerSecure2026!', 10);
  await prisma.user.upsert({
    where: { email: 'manager@bulkemail.cloud' },
    update: {},
    create: {
      email: 'manager@bulkemail.cloud',
      name: 'Marketing Campaign Manager',
      passwordHash: managerPassword,
      role: Role.MANAGER,
    },
  });

  console.log(`[Seed] Seeded Users: Admin (${admin.email})`);

  // 2. Multi-Provider Accounts (SES, Brevo, Mailchimp, Mock)
  await prisma.providerAccount.upsert({
    where: { id: 'default-ses-account' },
    update: {
      name: 'Amazon SES Production Account',
      providerType: 'SES',
      isDefault: true,
      isEnabled: true,
      priority: 1,
      routingWeight: 1.0,
      dailyQuota: 50000,
      monthlyQuota: 1500000,
      perSecondRateLimit: 14.0,
      costPerThousand: 0.10,
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
    create: {
      id: 'default-ses-account',
      name: 'Amazon SES Production Account',
      providerType: 'SES',
      isDefault: true,
      isSandbox: false,
      isEnabled: true,
      priority: 1,
      routingWeight: 1.0,
      dailyQuota: 50000,
      monthlyQuota: 1500000,
      perSecondRateLimit: 14.0,
      sendingQuotaDaily: 50000,
      sendingRatePerSecond: 14.0,
      costPerThousand: 0.10,
      region: 'us-east-1',
      accessKeyMasked: 'AKIA************',
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
  });

  await prisma.providerAccount.upsert({
    where: { id: 'default-brevo-account' },
    update: {
      name: 'Brevo High-Throughput API',
      providerType: 'BREVO',
      isEnabled: true,
      priority: 2,
      routingWeight: 0.8,
      dailyQuota: 40000,
      monthlyQuota: 1000000,
      perSecondRateLimit: 5.0,
      costPerThousand: 0.25,
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
    create: {
      id: 'default-brevo-account',
      name: 'Brevo High-Throughput API',
      providerType: 'BREVO',
      isDefault: false,
      isSandbox: false,
      isEnabled: true,
      priority: 2,
      routingWeight: 0.8,
      dailyQuota: 40000,
      monthlyQuota: 1000000,
      perSecondRateLimit: 5.0,
      sendingQuotaDaily: 40000,
      sendingRatePerSecond: 5.0,
      costPerThousand: 0.25,
      region: 'eu-west-1',
      accessKeyMasked: 'xkeysib-************',
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
  });

  await prisma.providerAccount.upsert({
    where: { id: 'default-mailchimp-account' },
    update: {
      name: 'Mailchimp Audience Sync & Marketing',
      providerType: 'MAILCHIMP',
      isEnabled: true,
      priority: 3,
      routingWeight: 0.5,
      dailyQuota: 10000,
      monthlyQuota: 300000,
      perSecondRateLimit: 4.0,
      costPerThousand: 1.00,
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
    create: {
      id: 'default-mailchimp-account',
      name: 'Mailchimp Audience Sync & Marketing',
      providerType: 'MAILCHIMP',
      isDefault: false,
      isSandbox: false,
      isEnabled: true,
      priority: 3,
      routingWeight: 0.5,
      dailyQuota: 10000,
      monthlyQuota: 300000,
      perSecondRateLimit: 4.0,
      sendingQuotaDaily: 10000,
      sendingRatePerSecond: 4.0,
      costPerThousand: 1.00,
      region: 'us19',
      accessKeyMasked: 'mc-api-************',
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
  });

  await prisma.providerAccount.upsert({
    where: { id: 'default-mock-account' },
    update: {
      name: 'High-Volume Mock Simulator (Testing)',
      providerType: 'MOCK',
      isEnabled: true,
      priority: 4,
      routingWeight: 0.2,
      dailyQuota: 200000,
      monthlyQuota: 6000000,
      perSecondRateLimit: 50.0,
      costPerThousand: 0.00,
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
    create: {
      id: 'default-mock-account',
      name: 'High-Volume Mock Simulator (Testing)',
      providerType: 'MOCK',
      isDefault: false,
      isSandbox: true,
      isEnabled: true,
      priority: 4,
      routingWeight: 0.2,
      dailyQuota: 200000,
      monthlyQuota: 6000000,
      perSecondRateLimit: 50.0,
      sendingQuotaDaily: 200000,
      sendingRatePerSecond: 50.0,
      costPerThousand: 0.00,
      region: 'local',
      accessKeyMasked: 'mock-key-************',
      healthStatus: 'HEALTHY',
      status: 'ACTIVE',
    },
  });

  // 3. Email Templates
  await prisma.emailTemplate.upsert({
    where: { id: 'welcome-newsletter-template' },
    update: {},
    create: {
      id: 'welcome-newsletter-template',
      name: 'Monthly Product & Security Update',
      subject: 'Important Platform Updates for {{firstName}}',
      category: 'Product Updates',
      htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{subject}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { background: #1e293b; color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .content { padding: 32px 24px; color: #334155; line-height: 1.6; font-size: 16px; }
    .badge { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
    .button-container { text-align: center; margin: 32px 0; }
    .cta-button { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5; }
    .footer a { color: #64748b; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Bulk Email Enterprise</h1>
    </div>
    <div class="content">
      <span class="badge">Official Announcement</span>
      <p>Hello <strong>{{firstName}}</strong>,</p>
      <p>We are excited to share key architectural upgrades designed to deliver world-class deliverability and scale for <strong>{{organisation}}</strong>.</p>
      <p>Our platform now features queue-based asynchronous distribution, real-time SES integration, and automated reputation protection.</p>
      <div class="button-container">
        <a href="https://example.com/dashboard" class="cta-button">Explore What's New</a>
      </div>
      <p>Thank you for partnering with us.</p>
      <p>Warm regards,<br>The Bulk Email Engineering Team</p>
    </div>
    <div class="footer">
      <p>You received this message because you opted in to updates for <strong>{{email}}</strong>.</p>
      <p>{{physicalPostalAddress}}</p>
      <p><a href="{{unsubscribeUrl}}">Unsubscribe from future campaigns</a></p>
    </div>
  </div>
</body>
</html>`,
      plainTextContent: `Hello {{firstName}},

We are excited to share key architectural upgrades designed to deliver world-class deliverability and scale for {{organisation}}.

Our platform now features queue-based asynchronous distribution, real-time SES integration, and automated reputation protection.

Explore what's new: https://example.com/dashboard

Thank you for partnering with us.

The Bulk Email Engineering Team

You received this message because you opted in to updates for {{email}}.
{{physicalPostalAddress}}
Unsubscribe: {{unsubscribeUrl}}`,
    },
  });

  // 4. Sample Suppression Record for testing
  await prisma.suppressionRecord.upsert({
    where: { email: 'bad-bounce-user@test.com' },
    update: {},
    create: {
      email: 'bad-bounce-user@test.com',
      reason: SuppressionReason.HARD_BOUNCE,
      source: 'SES_BOUNCE',
      metadata: { bounceType: 'Permanent', subType: 'General' },
    },
  });

  await prisma.suppressionRecord.upsert({
    where: { email: 'complaint-user@test.com' },
    update: {},
    create: {
      email: 'complaint-user@test.com',
      reason: SuppressionReason.COMPLAINT,
      source: 'SES_COMPLAINT',
      metadata: { userAgent: 'SES-SNS' },
    },
  });

  // 5. System Settings
  const settings = [
    { key: 'MAX_GLOBAL_SEND_RATE', value: '14.0', description: 'Maximum emails dispatched per second across all workers' },
    { key: 'AUTO_CIRCUIT_BREAKER_ENABLED', value: 'true', description: 'Automatically pause campaigns when bounce rate > 5% or complaint > 0.1%' },
    { key: 'DEFAULT_SENDER_NAME', value: 'Bulk Email Operations', description: 'Default sender display name' },
    { key: 'DEFAULT_SENDER_EMAIL', value: 'noreply@bulkemail.cloud', description: 'Default sender address' },
    { key: 'PHYSICAL_POSTAL_ADDRESS', value: 'Bulk Email Operations, 100 Tech Innovation Blvd, Lagos, Nigeria', description: 'Required CAN-SPAM physical address' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: s,
    });
  }

  console.log('[Seed] Database successfully seeded with defaults!');
}

main()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
