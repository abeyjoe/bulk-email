/**
 * Unified Multi-Provider Email Architecture Interface
 * Defines contracts for SES, Brevo, Mailchimp, Mock, and future integrations.
 */

export interface EmailMessage {
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
  jobId?: string;
  metadata?: Record<string, any>;
}

export type HealthStatusType = 'HEALTHY' | 'DEGRADED' | 'DOWN';
export type AccountStatusType = 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'SUSPENDED';

export interface ProviderStatus {
  status: AccountStatusType;
  healthStatus: HealthStatusType;
  isProduction: boolean;
  consecutiveFailures: number;
  lastChecked: Date;
  message?: string;
}

export interface ProviderCapacity {
  dailyQuota: number;
  dailyUsed: number;
  dailyRemaining: number;
  monthlyQuota: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  perSecondRateLimit: number;
  costPerThousand: number;
  reservedQuota?: number;
}

export interface EmailSendResult {
  success: boolean;
  messageId: string;
  providerId: string;
  providerType: string;
  timestamp: Date;
  error?: string;
  errorCode?: string;
  isTransient?: boolean;
  rateLimited?: boolean;
  retryAfterMs?: number;
  costEstimateUsd?: number;
  rawResponse?: any;
}

export interface WebhookEvent {
  eventType: 'DELIVERED' | 'HARD_BOUNCE' | 'SOFT_BOUNCE' | 'COMPLAINT' | 'OPEN' | 'CLICK' | 'UNSUBSCRIBE' | 'REJECTION';
  email: string;
  providerMessageId?: string;
  campaignId?: string;
  recipientId?: string;
  timestamp: Date;
  reason?: string;
  rawPayload: any;
}

export interface WebhookProcessingResult {
  events: WebhookEvent[];
  handled: boolean;
  responsePayload?: any;
}

export interface EmailProvider {
  readonly id: string;
  readonly type: string;
  readonly name: string;

  /**
   * Dispatch a single rendered email message to the provider's API.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;

  /**
   * Probe provider connectivity, credential validity, and service status.
   */
  checkHealth(): Promise<ProviderStatus>;

  /**
   * Retrieve current capacity limits, usage metrics, and sending speed.
   */
  getCapacity(): Promise<ProviderCapacity>;

  /**
   * Optional: Reconcile daily/monthly usage counts with upstream provider API reports.
   */
  reconcileQuota?(): Promise<{ dailyQuota: number; dailyUsed: number }>;

  /**
   * Optional: Ingest and normalize inbound webhook events from this provider.
   */
  processWebhook?(payload: any, headers?: Record<string, string>): Promise<WebhookProcessingResult>;
}
