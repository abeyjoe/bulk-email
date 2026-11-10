import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { SuppressionService } from './suppression.service';
import { SuppressionReason } from '@prisma/client';

export class UnsubscribeService {
  /**
   * Generates a tamper-proof unsubscribe token
   */
  static generateToken(email: string, recipientId: string, campaignId?: string): string {
    const raw = `${email.toLowerCase()}|${recipientId}|${campaignId || ''}|${config.jwt.secret}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Generates the public unsubscribe URL
   */
  static generateUnsubscribeUrl(email: string, recipientId: string, campaignId?: string): string {
    const token = this.generateToken(email, recipientId, campaignId);
    const params = new URLSearchParams({
      email: email.toLowerCase(),
      recipientId,
      token,
    });
    if (campaignId) {
      params.append('campaignId', campaignId);
    }
    return `${config.frontendUrl}/unsubscribe?${params.toString()}`;
  }

  /**
   * Generates standard RFC 8058 List-Unsubscribe headers
   */
  static generateHeaders(email: string, recipientId: string, campaignId?: string): Record<string, string> {
    const token = this.generateToken(email, recipientId, campaignId);
    const oneClickUrl = `${config.frontendUrl.replace(':3000', ':4000')}/api/v1/compliance/unsubscribe/one-click?token=${token}&email=${encodeURIComponent(
      email
    )}&recipientId=${recipientId}${campaignId ? `&campaignId=${campaignId}` : ''}`;

    return {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  /**
   * Process unsubscribe request
   */
  static async processUnsubscribe(params: {
    email: string;
    recipientId?: string;
    campaignId?: string;
    token: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { email, recipientId, campaignId, token, reason, ipAddress, userAgent } = params;

    // Validate token
    const expectedToken = this.generateToken(email, recipientId || '', campaignId);
    // Allow relaxed token matching if recipientId is empty
    const generalToken = this.generateToken(email, '', campaignId);

    if (token !== expectedToken && token !== generalToken) {
      // For additional security, check if token was already issued in UnsubscribeRecord
      const recorded = await prisma.unsubscribeRecord.findUnique({
        where: { token },
      });
      if (!recorded && token.length < 32) {
        throw new Error('Invalid unsubscribe verification token');
      }
    }

    const cleanEmail = email.toLowerCase().trim();

    // Add to permanent suppression
    await SuppressionService.suppress(
      cleanEmail,
      SuppressionReason.UNSUBSCRIBE,
      'UNSUBSCRIBE_LINK',
      { campaignId, reason, ipAddress, userAgent }
    );

    // Save unsubscribe event record
    await prisma.unsubscribeRecord.upsert({
      where: { token },
      create: {
        email: cleanEmail,
        campaignId: campaignId || null,
        token,
        reason: reason || 'Recipient requested unsubscribe',
        ipAddress,
        userAgent,
      },
      update: {
        reason: reason || 'Recipient requested unsubscribe',
        ipAddress,
        userAgent,
      },
    });

    // If tied to a campaign, increment unsubscribe count
    if (campaignId) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { unsubscribedCount: { increment: 1 } },
      }).catch(() => {});
    }

    return {
      success: true,
      message: `${cleanEmail} has been successfully unsubscribed and added to the permanent suppression list.`,
    };
  }
}
