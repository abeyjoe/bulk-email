import { config } from '../config';

export interface PersonalizationContext {
  email: string;
  recipientId: string;
  campaignId?: string;
  firstName?: string | null;
  lastName?: string | null;
  organisation?: string | null;
  registrationId?: string | null;
  unsubscribeUrl: string;
  customFields?: Record<string, any> | null;
}

export class TemplateEngine {
  /**
   * Render template string with context variables
   */
  static render(template: string, context: PersonalizationContext): string {
    if (!template) return '';

    const flatContext: Record<string, string> = {
      email: context.email,
      recipientId: context.recipientId,
      campaignId: context.campaignId || '',
      firstName: context.firstName || 'Friend',
      name: context.firstName || 'Friend',
      Name: context.firstName || 'Friend',
      lastName: context.lastName || '',
      organisation: context.organisation || '',
      organization: context.organisation || '',
      registrationId: context.registrationId || '',
      unsubscribeUrl: context.unsubscribeUrl,
      physicalPostalAddress: config.compliance.physicalPostalAddress,
      companyName: config.compliance.companyName,
    };

    // Include custom fields
    if (context.customFields && typeof context.customFields === 'object') {
      for (const [key, value] of Object.entries(context.customFields)) {
        flatContext[key] = value !== null && value !== undefined ? String(value) : '';
      }
    }

    // Replace {{key}} or {{key|fallback}}
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}\}/g, (match, key, fallback) => {
      const val = flatContext[key];
      if (val !== undefined && val !== '') {
        return val;
      }
      return fallback !== undefined ? fallback : '';
    });
  }

  /**
   * Validate and inject required compliance elements (Unsubscribe link, Physical Address)
   * if they are missing from custom HTML templates
   */
  static ensureComplianceFooter(html: string, context: PersonalizationContext): string {
    let rendered = this.render(html, context);

    // Automatically convert plain-text [Unsubscribe] placeholders into a clickable link
    rendered = rendered.replace(
      /\[\s*unsubscribe\s*\]/gi,
      `<a href="${context.unsubscribeUrl}" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Unsubscribe</a>`
    );

    // If it already contains the actual clickable unsubscribe URL, return
    if (rendered.includes(context.unsubscribeUrl) || /href=["'][^"']*unsubscribe/i.test(rendered)) {
      return rendered;
    }

    // Append compliant footer
    const compliantFooter = `
<div style="margin-top: 32px; padding: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; font-family: sans-serif;">
  <p style="margin: 0 0 8px 0;">This email was sent to <strong>${context.email}</strong>.</p>
  <p style="margin: 0 0 8px 0;">${config.compliance.physicalPostalAddress}</p>
  <p style="margin: 0;"><a href="${context.unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from these emails</a></p>
</div>`;

    if (rendered.includes('</body>')) {
      return rendered.replace('</body>', `${compliantFooter}</body>`);
    }

    return `${rendered}${compliantFooter}`;
  }
}
