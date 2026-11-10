import { EmailProvider } from './email-provider.interface';
import { SesProviderService } from './ses-provider.service';
import { SimulatorProviderService } from './simulator-provider.service';
import { SmtpProviderService } from './smtp-provider.service';
import { config } from '../config';

let activeProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!activeProvider) {
    if (config.email.provider === 'ses' && config.aws.accessKeyId) {
      activeProvider = new SesProviderService();
    } else if (config.email.provider === 'smtp' && config.smtp.host) {
      activeProvider = new SmtpProviderService({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user && config.smtp.pass ? {
          user: config.smtp.user,
          pass: config.smtp.pass,
        } : undefined,
      });
    } else {
      activeProvider = new SimulatorProviderService();
    }
  }
  return activeProvider;
}

export function setCustomProvider(provider: EmailProvider): void {
  activeProvider = provider;
}
