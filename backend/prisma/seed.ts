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

  // 2. Remove any default placeholder providers so the admin can add their own
  await prisma.providerAccount.deleteMany({
    where: {
      id: {
        in: [
          'default-ses-account',
          'default-brevo-account',
          'default-mailchimp-account',
          'default-mock-account',
        ],
      },
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
