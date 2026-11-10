import { EmailProvider } from './email-provider.interface';
import { SesProviderService } from './ses-provider.service';
import { SimulatorProviderService } from './simulator-provider.service';
import { config } from '../config';

let activeProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!activeProvider) {
    if (config.email.provider === 'ses' && config.aws.accessKeyId) {
      activeProvider = new SesProviderService();
    } else {
      activeProvider = new SimulatorProviderService();
    }
  }
  return activeProvider;
}

export function setCustomProvider(provider: EmailProvider): void {
  activeProvider = provider;
}
