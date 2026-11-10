import {
  SESv2Client,
  SendEmailCommand,
  GetAccountCommand,
} from '@aws-sdk/client-sesv2';
import { EmailProvider, SendEmailInput, SendEmailResult, AccountQuotaInfo } from './email-provider.interface';
import { config } from '../config';

export class SesProviderService implements EmailProvider {
  name = 'Amazon SES';
  private client: SESv2Client;

  constructor() {
    this.client = new SESv2Client({
      region: config.aws.region,
      credentials: config.aws.accessKeyId && config.aws.secretAccessKey ? {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      } : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const emailHeaders: Array<{ Name: string; Value: string }> = [];
      if (input.headers) {
        for (const [key, value] of Object.entries(input.headers)) {
          emailHeaders.push({ Name: key, Value: value });
        }
      }

      // Add campaign and recipient tracking headers
      if (input.campaignId) {
        emailHeaders.push({ Name: 'X-BulkEmail-Campaign-ID', Value: input.campaignId });
      }
      if (input.recipientId) {
        emailHeaders.push({ Name: 'X-BulkEmail-Recipient-ID', Value: input.recipientId });
      }

      const command = new SendEmailCommand({
        FromEmailAddress: input.from,
        Destination: {
          ToAddresses: [input.to],
        },
        ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
        ConfigurationSetName: input.configurationSet || config.email.configurationSet,
        Content: {
          Simple: {
            Subject: {
              Data: input.subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: input.html,
                Charset: 'UTF-8',
              },
              Text: input.text ? {
                Data: input.text,
                Charset: 'UTF-8',
              } : undefined,
            },
            Headers: emailHeaders.length > 0 ? emailHeaders : undefined,
          },
        },
      });

      const response = await this.client.send(command);

      return {
        success: true,
        messageId: response.MessageId || `ses-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        provider: 'Amazon SES',
        timestamp: new Date(),
      };
    } catch (err: any) {
      const isTransient =
        err.name === 'TooManyRequestsException' ||
        err.name === 'ServiceUnavailable' ||
        err.name === 'InternalServiceErrorException' ||
        err.$metadata?.httpStatusCode >= 500;

      return {
        success: false,
        messageId: '',
        provider: 'Amazon SES',
        timestamp: new Date(),
        error: err.message || 'Unknown SES delivery error',
        isTransient,
      };
    }
  }

  async getQuota(): Promise<AccountQuotaInfo> {
    try {
      const command = new GetAccountCommand({});
      const response = await this.client.send(command);

      return {
        dailyQuota: response.SendQuota?.Max24HourSend || 50000,
        sentLast24Hours: response.SendQuota?.SentLast24Hours || 0,
        maxSendRate: response.SendQuota?.MaxSendRate || 14.0,
        isProduction: response.ProductionAccessEnabled ?? false,
        sendingEnabled: response.SendingEnabled ?? true,
      };
    } catch (err) {
      // Return safe defaults if credentials aren't active in dev
      return {
        dailyQuota: 50000,
        sentLast24Hours: 0,
        maxSendRate: 14.0,
        isProduction: false,
        sendingEnabled: true,
      };
    }
  }
}
