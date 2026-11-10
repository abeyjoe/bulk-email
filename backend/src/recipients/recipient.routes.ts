import { Router, Response } from 'express';
import { RecipientService } from './recipient.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';
import { requireRole } from '../auth/roles.guard';
import { Role, RecipientStatus } from '@prisma/client';
import { prisma } from '../db/prisma';

export const recipientRouter = Router();

recipientRouter.use(authMiddleware);

recipientRouter.get('/', async (req, res) => {
  try {
    const { page, limit, search, status, listId } = req.query;
    const result = await RecipientService.listRecipients({
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 25,
      search: search ? String(search) : undefined,
      status: status ? (String(status) as RecipientStatus) : undefined,
      listId: listId ? String(listId) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

recipientRouter.post('/', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { email, firstName, lastName, organisation, customFields, listId } = req.body;
    if (!email || !RecipientService.isValidEmail(email)) {
      res.status(400).json({ error: 'Valid email address is required' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const recipient = await prisma.recipient.create({
      data: {
        email: cleanEmail,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        organisation: organisation?.trim() || null,
        customFields: customFields || {},
        status: RecipientStatus.SUBSCRIBED,
        consentSource: 'Admin Manual Entry',
        consentTimestamp: new Date(),
      },
    });

    if (listId) {
      await prisma.recipientListMember.create({
        data: { listId, recipientId: recipient.id },
      });
      await prisma.recipientList.update({
        where: { id: listId },
        data: { recipientCount: { increment: 1 } },
      });
    }

    res.status(201).json({ recipient });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Recipient with this email already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// High performance Bulk CSV / XLSX Import
recipientRouter.post('/import', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { fileContent, fileBase64, fileName, columnMapping, listId, consentSource } = req.body;

    if (!columnMapping || !columnMapping.email) {
      res.status(400).json({ error: 'columnMapping with at least "email" field is required' });
      return;
    }

    let buffer: Buffer;
    const isXlsx = fileName && (fileName.endsWith('.xlsx') || fileName.endsWith('.xls'));

    if (fileBase64) {
      buffer = Buffer.from(fileBase64, 'base64');
    } else if (fileContent) {
      buffer = Buffer.from(fileContent, 'utf-8');
    } else {
      res.status(400).json({ error: 'No fileContent or fileBase64 provided' });
      return;
    }

    const summary = await RecipientService.importFromBuffer(
      buffer,
      isXlsx ? 'xlsx' : 'csv',
      columnMapping,
      { listId, consentSource }
    );

    res.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Import processing error' });
  }
});

// Recipient Lists (Segments)
recipientRouter.get('/lists', async (req, res) => {
  try {
    const lists = await prisma.recipientList.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true } },
      },
    });
    res.json({ lists });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

recipientRouter.post('/lists', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: 'List name is required' });
      return;
    }

    const list = await prisma.recipientList.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
      },
    });
    res.status(201).json({ list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

recipientRouter.patch('/:id/status', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!status || !Object.values(RecipientStatus).includes(status)) {
      res.status(400).json({ error: 'Valid status required' });
      return;
    }

    const recipient = await RecipientService.updateStatus(id, status);
    res.json({ recipient });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

recipientRouter.delete('/:id', requireRole([Role.ADMIN]), async (req, res) => {
  try {
    await RecipientService.deleteRecipient(req.params.id as string);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
