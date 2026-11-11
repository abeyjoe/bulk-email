export * from './provider.interface';
export * from './provider-registry.service';
export * from './adapters/ses.adapter';
export * from './adapters/brevo.adapter';
export * from './adapters/mailchimp.adapter';
export * from './adapters/mock.adapter';

// Legacy compatibility exports
import { EmailProvider as LegacyEmailProvider } from './email-provider.interface';
import { SesProviderService } from './ses-provider.service';
import { SimulatorProviderService } from './simulator-provider.service';
import { SmtpProviderService } from './smtp-provider.service';
import { config } from '../config';

let legacyActiveProvider: LegacyEmailProvider | null = null;

export function getEmailProvider(): LegacyEmailProvider {
  if (!legacyActiveProvider) {
    if (config.email.provider === 'ses' && config.aws.accessKeyId) {
      legacyActiveProvider = new SesProviderService();
    } else if (config.email.provider === 'smtp' && config.smtp.host) {
      legacyActiveProvider = new SmtpProviderService({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user && config.smtp.pass ? {
          user: config.smtp.user,
          pass: config.smtp.pass,
        } : undefined,
      });
    } else {
      legacyActiveProvider = new SimulatorProviderService();
    }
  }
  return legacyActiveProvider;
}

export function setCustomProvider(provider: LegacyEmailProvider): void {
  legacyActiveProvider = provider;
}
