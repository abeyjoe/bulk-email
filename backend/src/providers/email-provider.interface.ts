export interface SendEmailInput {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  configurationSet?: string;
  campaignId?: string;
  recipientId?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId: string;
  provider: string;
  timestamp: Date;
  error?: string;
  isTransient?: boolean;
}

export interface AccountQuotaInfo {
  dailyQuota: number;
  sentLast24Hours: number;
  maxSendRate: number; // max messages per second
  isProduction: boolean;
  sendingEnabled: boolean;
}

export interface EmailProvider {
  name: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
  getQuota(): Promise<AccountQuotaInfo>;
  verifyDomain?(domain: string): Promise<{ verified: boolean; dkimTokens: string[] }>;
}
