import { Readable } from 'stream';
import { parse } from 'csv-parse';
import * as xlsx from 'xlsx';
import { prisma } from '../db/prisma';
import { RecipientStatus, Prisma } from '@prisma/client';
import { SuppressionService } from '../compliance/suppression.service';

export interface RecipientInput {
  email: string;
  firstName?: string;
  lastName?: string;
  organisation?: string;
  customFields?: Record<string, any>;
  consentSource?: string;
}

export interface ImportSummary {
  totalRows: number;
  validRecords: number;
  invalidEmailCount: number;
  duplicateCount: number;
  suppressedCount: number;
  importedCount: number;
  listId?: string;
  errors: Array<{ row: number; reason: string }>;
}

export class RecipientService {
  private static emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (trimmed.length > 254) return false;
    return this.emailRegex.test(trimmed);
  }

  /**
   * High performance streaming CSV and XLSX parser for 50,000+ records.
   * Chunks inserts to avoid loading everything into memory simultaneously.
   */
  static async importFromBuffer(
    buffer: Buffer,
    fileType: 'csv' | 'xlsx',
    columnMapping: {
      email: string;
      firstName?: string;
      lastName?: string;
      organisation?: string;
    },
    options: {
      listId?: string;
      consentSource?: string;
      batchSize?: number;
    } = {}
  ): Promise<ImportSummary> {
    const batchSize = options.batchSize || 1000;
    const summary: ImportSummary = {
      totalRows: 0,
      validRecords: 0,
      invalidEmailCount: 0,
      duplicateCount: 0,
      suppressedCount: 0,
      importedCount: 0,
      listId: options.listId,
      errors: [],
    };

    const seenEmailsInFile = new Set<string>();
    let batch: RecipientInput[] = [];

    const processBatch = async (items: RecipientInput[]) => {
      if (items.length === 0) return;

      const emails = items.map((i) => i.email.toLowerCase().trim());

      // Pre-check suppression
      const suppressedSet = await SuppressionService.getSuppressedEmailSet(emails);

      // Prepare records for database insertion
      const recipientData = items.map((item) => {
        const cleanEmail = item.email.toLowerCase().trim();
        const isSuppressed = suppressedSet.has(cleanEmail);
        if (isSuppressed) {
          summary.suppressedCount++;
        }

        return {
          email: cleanEmail,
          firstName: item.firstName?.trim() || null,
          lastName: item.lastName?.trim() || null,
          organisation: item.organisation?.trim() || null,
          customFields: (item.customFields || {}) as Prisma.InputJsonValue,
          status: isSuppressed ? RecipientStatus.SUPPRESSED : RecipientStatus.SUBSCRIBED,
          consentSource: options.consentSource || 'CSV/XLSX Bulk Import',
          consentTimestamp: new Date(),
        };
      });

      // Insert or skip duplicates in recipient table
      const insertResult = await prisma.recipient.createMany({
        data: recipientData,
        skipDuplicates: true,
      });

      summary.importedCount += insertResult.count;

      // If a list was specified, attach recipients to list
      if (options.listId) {
        const recipientsInDb = await prisma.recipient.findMany({
          where: { email: { in: emails } },
          select: { id: true },
        });

        const listMembersData = recipientsInDb.map((r) => ({
          listId: options.listId!,
          recipientId: r.id,
        }));

        await prisma.recipientListMember.createMany({
          data: listMembersData,
          skipDuplicates: true,
        });

        // Update list total count
        const totalInList = await prisma.recipientListMember.count({
          where: { listId: options.listId },
        });
        await prisma.recipientList.update({
          where: { id: options.listId },
          data: { recipientCount: totalInList },
        });
      }
    };

    if (fileType === 'csv') {
      const stream = Readable.from(buffer).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        })
      );

      let rowIdx = 1;
      for await (const row of stream) {
        rowIdx++;
        summary.totalRows++;

        const emailRaw = row[columnMapping.email];
        if (!emailRaw || !this.isValidEmail(emailRaw)) {
          summary.invalidEmailCount++;
          if (summary.errors.length < 50) {
            summary.errors.push({ row: rowIdx, reason: `Invalid email address: '${emailRaw || 'MISSING'}'` });
          }
          continue;
        }

        const email = emailRaw.toLowerCase().trim();
        if (seenEmailsInFile.has(email)) {
          summary.duplicateCount++;
          continue;
        }
        seenEmailsInFile.add(email);
        summary.validRecords++;

        // Collect custom fields from unmapped columns
        const customFields: Record<string, any> = {};
        for (const [col, val] of Object.entries(row)) {
          if (
            col !== columnMapping.email &&
            col !== columnMapping.firstName &&
            col !== columnMapping.lastName &&
            col !== columnMapping.organisation
          ) {
            customFields[col] = val;
          }
        }

        batch.push({
          email,
          firstName: columnMapping.firstName ? row[columnMapping.firstName] : undefined,
          lastName: columnMapping.lastName ? row[columnMapping.lastName] : undefined,
          organisation: columnMapping.organisation ? row[columnMapping.organisation] : undefined,
          customFields,
        });

        if (batch.length >= batchSize) {
          await processBatch(batch);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await processBatch(batch);
      }
    } else {
      // Excel workbook parsing
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = xlsx.utils.sheet_to_json(sheet);

      let rowIdx = 1;
      for (const row of rows) {
        rowIdx++;
        summary.totalRows++;

        const emailRaw = row[columnMapping.email];
        if (!emailRaw || !this.isValidEmail(emailRaw)) {
          summary.invalidEmailCount++;
          if (summary.errors.length < 50) {
            summary.errors.push({ row: rowIdx, reason: `Invalid email address: '${emailRaw || 'MISSING'}'` });
          }
          continue;
        }

        const email = String(emailRaw).toLowerCase().trim();
        if (seenEmailsInFile.has(email)) {
          summary.duplicateCount++;
          continue;
        }
        seenEmailsInFile.add(email);
        summary.validRecords++;

        batch.push({
          email,
          firstName: columnMapping.firstName ? String(row[columnMapping.firstName] || '') : undefined,
          lastName: columnMapping.lastName ? String(row[columnMapping.lastName] || '') : undefined,
          organisation: columnMapping.organisation ? String(row[columnMapping.organisation] || '') : undefined,
        });

        if (batch.length >= batchSize) {
          await processBatch(batch);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await processBatch(batch);
      }
    }

    return summary;
  }

  /**
   * Search and filter recipients with pagination
   */
  static async listRecipients(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: RecipientStatus;
    listId?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.search) {
      const s = params.search.toLowerCase().trim();
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { organisation: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (params.status) {
      where.status = params.status;
    }
    if (params.listId) {
      where.listMembers = {
        some: { listId: params.listId },
      };
    }

    const [total, recipients] = await Promise.all([
      prisma.recipient.count({ where }),
      prisma.recipient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          listMembers: {
            include: { list: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    return {
      recipients,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update recipient status (e.g. manual unsubscribe or subscribe)
   */
  static async updateStatus(id: string, status: RecipientStatus) {
    return prisma.recipient.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Delete recipient
   */
  static async deleteRecipient(id: string) {
    return prisma.recipient.delete({
      where: { id },
    });
  }
}
