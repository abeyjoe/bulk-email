import { prisma } from '../db/prisma';
import { SuppressionReason, RecipientStatus } from '@prisma/client';

export class SuppressionService {
  /**
   * Check if a single email is currently suppressed
   */
  static async isSuppressed(email: string): Promise<boolean> {
    const record = await prisma.suppressionRecord.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return !!record;
  }

  /**
   * Bulk check suppression for large sets of emails.
   * Returns a Set of emails that are suppressed.
   */
  static async getSuppressedEmailSet(emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();

    const normalized = Array.from(new Set(emails.map((e) => e.toLowerCase().trim())));
    const suppressedSet = new Set<string>();

    // Chunk in batches of 1,000 to respect query parameter limits
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < normalized.length; i += CHUNK_SIZE) {
      const chunk = normalized.slice(i, i + CHUNK_SIZE);
      const records = await prisma.suppressionRecord.findMany({
        where: { email: { in: chunk } },
        select: { email: true },
      });
      for (const rec of records) {
        suppressedSet.add(rec.email.toLowerCase());
      }
    }

    return suppressedSet;
  }

  /**
   * Add an email to the permanent suppression list and update the recipient status
   */
  static async suppress(
    email: string,
    reason: SuppressionReason,
    source: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const cleanEmail = email.toLowerCase().trim();

    // Upsert suppression record
    await prisma.suppressionRecord.upsert({
      where: { email: cleanEmail },
      create: {
        email: cleanEmail,
        reason,
        source,
        metadata,
      },
      update: {
        reason,
        source,
        metadata,
      },
    });

    // Update Recipient table status if exists
    let newRecipientStatus: RecipientStatus = RecipientStatus.SUPPRESSED;
    if (reason === SuppressionReason.HARD_BOUNCE) {
      newRecipientStatus = RecipientStatus.BOUNCED;
    } else if (reason === SuppressionReason.UNSUBSCRIBE) {
      newRecipientStatus = RecipientStatus.UNSUBSCRIBED;
    }

    await prisma.recipient.updateMany({
      where: { email: cleanEmail },
      data: { status: newRecipientStatus },
    });
  }

  /**
   * Remove an email from suppression list (Admin only)
   */
  static async unsuppress(email: string): Promise<boolean> {
    const cleanEmail = email.toLowerCase().trim();
    const result = await prisma.suppressionRecord.deleteMany({
      where: { email: cleanEmail },
    });

    if (result.count > 0) {
      await prisma.recipient.updateMany({
        where: { email: cleanEmail },
        data: { status: RecipientStatus.SUBSCRIBED },
      });
      return true;
    }
    return false;
  }

  /**
   * List suppression records with pagination and search
   */
  static async list(params: { page?: number; limit?: number; search?: string; reason?: SuppressionReason }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.search) {
      where.email = { contains: params.search.toLowerCase().trim(), mode: 'insensitive' };
    }
    if (params.reason) {
      where.reason = params.reason;
    }

    const [total, records] = await Promise.all([
      prisma.suppressionRecord.count({ where }),
      prisma.suppressionRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
