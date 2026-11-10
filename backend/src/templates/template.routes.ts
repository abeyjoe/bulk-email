import { Router } from 'express';
import { prisma } from '../db/prisma';
import { authMiddleware } from '../auth/auth.middleware';
import { requireRole } from '../auth/roles.guard';
import { Role } from '@prisma/client';

export const templateRouter = Router();

templateRouter.use(authMiddleware);

templateRouter.get('/', async (req, res) => {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

templateRouter.get('/:id', async (req, res) => {
  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: req.params.id as string },
    });
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

templateRouter.post('/', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { name, subject, htmlContent, plainTextContent, category } = req.body;
    if (!name?.trim() || !subject?.trim() || !htmlContent?.trim()) {
      res.status(400).json({ error: 'Name, subject, and htmlContent are required' });
      return;
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name: name.trim(),
        subject: subject.trim(),
        htmlContent,
        plainTextContent: plainTextContent || null,
        category: category?.trim() || 'General',
      },
    });
    res.status(201).json({ template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

templateRouter.put('/:id', requireRole([Role.ADMIN, Role.MANAGER]), async (req, res) => {
  try {
    const { name, subject, htmlContent, plainTextContent, category } = req.body;
    const template = await prisma.emailTemplate.update({
      where: { id: req.params.id as string },
      data: {
        name: name?.trim(),
        subject: subject?.trim(),
        htmlContent,
        plainTextContent,
        category,
      },
    });
    res.json({ template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

templateRouter.delete('/:id', requireRole([Role.ADMIN]), async (req, res) => {
  try {
    await prisma.emailTemplate.delete({
      where: { id: req.params.id as string },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
