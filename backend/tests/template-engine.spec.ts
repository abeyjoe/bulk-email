import { TemplateEngine } from '../src/templates/template-engine';

describe('TemplateEngine', () => {
  it('should interpolate personal tags correctly', () => {
    const rawTemplate = 'Hello {{firstName}} {{lastName}}, welcome to {{organisation}}!';
    const rendered = TemplateEngine.render(rawTemplate, {
      email: 'john.doe@example.com',
      recipientId: 'rec-123',
      firstName: 'John',
      lastName: 'Doe',
      organisation: 'Acme Corp',
      unsubscribeUrl: 'https://app.bulkemail.cloud/unsubscribe',
    });

    expect(rendered).toBe('Hello John Doe, welcome to Acme Corp!');
  });

  it('should handle fallbacks when variable is missing', () => {
    const rawTemplate = 'Hi {{firstName|Valued Customer}}, your email is {{email}}.';
    const rendered = TemplateEngine.render(rawTemplate, {
      email: 'guest@example.com',
      recipientId: 'rec-456',
      unsubscribeUrl: 'https://app.bulkemail.cloud/unsubscribe',
    });

    expect(rendered).toBe('Hi Valued Customer, your email is guest@example.com.');
  });

  it('should automatically inject compliant unsubscribe footer and physical postal address', () => {
    const rawHtml = '<div><p>Welcome to our platform</p></div>';
    const compliant = TemplateEngine.ensureComplianceFooter(rawHtml, {
      email: 'user@example.com',
      recipientId: 'rec-789',
      unsubscribeUrl: 'https://app.bulkemail.cloud/unsubscribe?token=abc',
    });

    expect(compliant).toContain('Unsubscribe from these emails');
    expect(compliant).toContain('user@example.com');
    expect(compliant).toContain('Nigeria');
  });
});
