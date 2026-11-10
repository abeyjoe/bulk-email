import crypto from 'crypto';
import { EmailProvider, SendEmailInput, SendEmailResult, AccountQuotaInfo } from './email-provider.interface';

export class SimulatorProviderService implements EmailProvider {
  name = 'Amazon SES Simulator';
  private sentCount = 0;

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    // Simulate real network transit latency (5 - 20ms)
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 15) + 5));

    const toLower = input.to.toLowerCase().trim();

    // SES Mailbox Simulator Behaviors:
    // bounce@simulator.amazonses.com => hard bounce
    // complaint@simulator.amazonses.com => spam complaint
    // ooto@simulator.amazonses.com => soft bounce
    // suppressionlist@simulator.amazonses.com => blacklist rejection
    if (toLower === 'bounce@simulator.amazonses.com' || toLower.includes('+bounce@')) {
      return {
        success: false,
        messageId: `sim-bounce-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        provider: 'Amazon SES Simulator',
        timestamp: new Date(),
        error: '550 5.1.1 The email account that you tried to reach does not exist (Mailbox Simulator Hard Bounce)',
        isTransient: false,
      };
    }

    if (toLower === 'suppressionlist@simulator.amazonses.com') {
      return {
        success: false,
        messageId: `sim-suppressed-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        provider: 'Amazon SES Simulator',
        timestamp: new Date(),
        error: 'Amazon SES has suppressed sending to this address because it is on the Amazon SES suppression list.',
        isTransient: false,
      };
    }

    this.sentCount++;
    const messageId = `0100018d-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(6).toString('hex')}-000000`;

    return {
      success: true,
      messageId,
      provider: 'Amazon SES Simulator',
      timestamp: new Date(),
    };
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
