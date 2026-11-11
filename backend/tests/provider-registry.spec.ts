import { providerRegistry } from '../src/providers/provider-registry.service';
import { MockAdapter } from '../src/providers/adapters/mock.adapter';
import { BrevoAdapter } from '../src/providers/adapters/brevo.adapter';
import { MailchimpAdapter } from '../src/providers/adapters/mailchimp.adapter';
import { SesAdapter } from '../src/providers/adapters/ses.adapter';

describe('Provider Registry & Adapters', () => {
  it('should resolve seeded provider accounts from database', async () => {
    const sesProvider = await providerRegistry.getProvider('default-ses-account');
    expect(sesProvider).toBeDefined();
    expect(sesProvider.type).toBe('SES');

    const brevoProvider = await providerRegistry.getProvider('default-brevo-account');
    expect(brevoProvider).toBeDefined();
    expect(brevoProvider.type).toBe('BREVO');

    const mockProvider = await providerRegistry.getProvider('default-mock-account');
    expect(mockProvider).toBeDefined();
    expect(mockProvider.type).toBe('MOCK');
  });

  it('should simulate successful dispatches with MockAdapter', async () => {
    const mock = new MockAdapter({ id: 'test-mock', name: 'Test Mock', simulatedDelayMs: 0 });
    const result = await mock.send({
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'Hello Test',
      html: '<p>Test email</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^mock-msg-/);
    expect(result.providerType).toBe('MOCK');
  });

  it('should detect simulated hard bounce in MockAdapter', async () => {
    const mock = new MockAdapter({ id: 'test-mock', simulatedDelayMs: 0 });
    const result = await mock.send({
      to: 'bounce@simulator.amazonses.com',
      from: 'sender@example.com',
      subject: 'Bounce Test',
      html: '<p>Bounce</p>',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('HARD_BOUNCE');
    expect(result.isTransient).toBe(false);
  });

  it('should detect simulated rate limit 429 in MockAdapter', async () => {
    const mock = new MockAdapter({ id: 'test-mock', simulatedDelayMs: 0 });
    const result = await mock.send({
      to: 'trigger-ratelimit-test@example.com',
      from: 'sender@example.com',
      subject: 'Rate Limit Test',
      html: '<p>Rate Limit</p>',
    });

    expect(result.success).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.isTransient).toBe(true);
  });

  it('should parse Brevo webhook payloads', async () => {
    const brevo = new BrevoAdapter({ id: 'test-brevo', apiKey: 'test-key' });
    const res = await brevo.processWebhook({
      event: 'hard_bounce',
      email: 'invalid@recipient.com',
      'message-id': '<brevo-12345>',
      reason: 'Mailbox not found',
    });

    expect(res.handled).toBe(true);
    expect(res.events.length).toBe(1);
    expect(res.events[0].eventType).toBe('HARD_BOUNCE');
    expect(res.events[0].email).toBe('invalid@recipient.com');
  });

  it('should parse Mailchimp webhook cleaned payloads', async () => {
    const mc = new MailchimpAdapter({ id: 'test-mc', apiKey: 'test-key-us1' });
    const res = await mc.processWebhook({
      type: 'cleaned',
      data: {
        email: 'cleaned-user@example.com',
        reason: 'hard',
      },
    });

    expect(res.handled).toBe(true);
    expect(res.events[0].eventType).toBe('HARD_BOUNCE');
    expect(res.events[0].email).toBe('cleaned-user@example.com');
  });
});
