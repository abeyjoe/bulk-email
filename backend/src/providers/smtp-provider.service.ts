import nodemailer, { Transporter } from 'nodemailer';
import { EmailProvider, SendEmailInput, SendEmailResult, AccountQuotaInfo } from './email-provider.interface';

export class SmtpProviderService implements EmailProvider {
  name = 'SMTP / External Provider';
  private transporter: Transporter;
  private sentCount = 0;

  constructor(options: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.auth,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const mailOptions = {
        from: input.from,
        to: input.to,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.sentCount++;

      return {
        success: true,
        messageId: info.messageId || `smtp-${Date.now()}`,
        provider: 'SMTP',
        timestamp: new Date(),
      };
    } catch (err: any) {
      console.error('[SMTP Provider Error]:', err.message);
      return {
        success: false,
        messageId: '',
        provider: 'SMTP',
        timestamp: new Date(),
        error: err.message || 'SMTP delivery failure',
        isTransient: err.responseCode >= 400 && err.responseCode < 500,
      };
    }
  }

  async getQuota(): Promise<AccountQuotaInfo> {
    return {
      dailyQuota: 50000,
      sentLast24Hours: this.sentCount,
      maxSendRate: 14.0,
      isProduction: true,
      sendingEnabled: true,
    };
  }
}
