import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logAdminAction } from '../lib/maintenance.js';
import { cleanText, safeFileName, toDataUri, validateDataUri, MAX_SHEET_IMAGE_BYTES } from '../lib/files.js';

interface SheetRow {
  id: number;
  title: string;
  subject: string;
  class_level: string;
  description: string;
  author_name: string;
  author_fingerprint: string | null;
  kind: string;
  mime_type: string | null;
  file_size: number | null;
  file_name: string | null;
  status: string;
  created_at: string;
  file_data: string | null;
  updated_at: string | null;
}

const router = Router();

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

function isAdmin(req: any): boolean {
  return req.session?.authenticated === true;
}

const SHEET_LIST_COLUMNS = `id, title, subject, class_level, description, author_name,
  author_fingerprint, kind, mime_type, file_size, file_name, status, created_at`;

function shapeSheet(row: any) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    class_level: row.class_level,
    description: row.description,
    author_name: row.author_name,
    kind: row.kind,
    mime_type: row.mime_type,
    file_size: row.file_size,
    has_file: row.file_size ? 1 : 0,
    status: row.status,
    created_at: row.created_at,
    is_mine: row.author_fingerprint ? row.__mine === 1 : false,
  };
}

router.get('/', async (req, res) => {
  try {
    const subject = cleanText(req.query.subject, 40);
    const search = cleanText(req.query.q, 60);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

    const where: string[] = [];
    const params: any[] = [];
    if (!req.session?.authenticated) {
      where.push("status = 'active'");
    } else if (req.query.status && ['active', 'hidden'].includes(String(req.query.status))) {
      where.push('status = $' + (params.length + 1));
      params.push(String(req.query.status));
    }
    if (subject) {
      where.push('subject = $' + (params.length + 1));
      params.push(subject);
    }
    if (search) {
      where.push('(title LIKE $' + (params.length + 1) + ' OR description LIKE $' + (params.length + 2) + ' OR author_name LIKE $' + (params.length + 3) + ')');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM sheets ${clause}`, params))?.count ?? 0;

    const rows = await query<SheetRow>(
      `SELECT ${SHEET_LIST_COLUMNS} FROM sheets ${clause} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    const mine = req.session?.authenticated ? null : String(req.query.fingerprint || '');
    res.json({
      items: rows.map((row) => shapeSheet({ ...row, __mine: mine && row.author_fingerprint === mine ? 1 : 0 })),
      total,
      page,
      limit,
      has_more: page * limit < total,
    });
  } catch (err) {
    console.error('Get sheets error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.session?.authenticated === true;
    const mine = isAdmin ? null : String(req.query.fingerprint || '');

    const row = await queryOne<SheetRow>(
      `SELECT ${SHEET_LIST_COLUMNS}, file_data, mime_type, file_name, file_size
       FROM sheets WHERE id = $1`,
      [req.params.id]
    );

    if (!row) {
      res.status(404).json({ error: 'Fiche introuvable' });
      return;
    }
    if (row.status !== 'active' && !isAdmin && row.author_fingerprint !== mine) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    if (!row.file_data) {
      res.status(404).json({ error: 'Fichier introuvable' });
      return;
    }

    const buffer = Buffer.from(row.file_data, 'base64');
    res.set({
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Length': String(row.file_size || buffer.length),
      'Content-Disposition': `inline; filename="${row.file_name || 'fiche'}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none';",
    });
    if (req.query.inline) {
      res.set('Content-Disposition', `inline; filename="${row.file_name || 'fiche'}"`);
    }
    res.send(buffer);
  } catch (err) {
    console.error('Sheet file error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = cleanText(req.body?.title, 80);
    const subject = cleanText(req.body?.subject, 40) || 'autre';
    const class_level = cleanText(req.body?.class_level, 20);
    const description = cleanText(req.body?.description, 500);
    const file = req.body?.file;
    const author_name = cleanText(req.body?.author_name, 40);
    const author_fingerprint = cleanText(req.body?.fingerprint, 64) || null;

    if (!title || !author_name) {
      res.status(400).json({ error: 'Titre et auteur requis' });
      return;
    }
    if (author_name.length < 2) {
      res.status(400).json({ error: 'Auteur : au moins 2 caractères' });
      return;
    }

    let file_data: string | null = null;
    let file_name = '';
    let mime_type = '';
    let file_size = 0;
    let kind = 'image';

    if (file) {
      const check = validateDataUri(file, ['image', 'document']);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
      if (check.file.size > MAX_SHEET_IMAGE_BYTES) {
        res.status(400).json({ error: 'Fichier trop volumineux (max 12 Mo)' });
        return;
      }
      file_data = toDataUri(check.file);
      file_name = safeFileName('fichier', check.file.ext);
      mime_type = check.file.mime;
      file_size = check.file.size;
      kind = check.file.kind === 'image' ? 'image' : 'document';
    }

    const result = await execute(
      `INSERT INTO sheets (title, subject, class_level, description, author_name, author_fingerprint,
        file_data, file_name, mime_type, file_size, kind, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', CURRENT_TIMESTAMP)
       RETURNING id`,
      [title.trim(), subject.trim(), class_level?.trim() || '', description?.trim() || '',
       author_name.trim(), author_fingerprint, file_data, file_name, mime_type, file_size, kind]
    );

    const sheet = await queryOne<SheetRow>('SELECT * FROM sheets WHERE id = $1', [result.lastInsertId]);
    res.status(201).json(sheet);
  } catch (err) {
    console.error('Create sheet error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne<SheetRow>('SELECT * FROM sheets WHERE id = $1', [id]);
    if (!row) {
      res.status(404).json({ error: 'Fiche introuvable' });
      return;
    }

    const isAdminUser = req.session?.authenticated === true;
    const mine = String(req.body?.fingerprint || req.query.fingerprint || '');
    if (!isAdminUser && row.author_fingerprint !== mine) {
      res.status(403).json({ error: 'Seul l\'auteur ou le délégué peut modifier cette fiche' });
      return;
    }

    const title = cleanText(req.body?.title, MAX_TITLE);
    const subject = cleanText(req.body?.subject, 40);
    const class_level = cleanText(req.body?.class_level, 20);
    const description = cleanText(req.body?.description, MAX_DESCRIPTION);
    const status = req.body?.status;

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { updates.push('title = $' + (params.length + 1)); params.push(title.trim()); }
    if (subject !== undefined) { updates.push('subject = $' + (params.length + 1)); params.push(subject.trim()); }
    if (class_level !== undefined) { updates.push('class_level = $' + (params.length + 1)); params.push(class_level.trim()); }
    if (description !== undefined) { updates.push('description = $' + (params.length + 1)); params.push(description?.trim() || ''); }
    if (status !== undefined) { updates.push('status = $' + (params.length + 1)); params.push(status); }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length > 1) {
      params.push(id);
      await execute(
        `UPDATE sheets SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    const updated = await queryOne<SheetRow>('SELECT * FROM sheets WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Update sheet error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne<SheetRow>('SELECT * FROM sheets WHERE id = $1', [id]);
    if (!row) {
      res.status(404).json({ error: 'Fiche introuvable' });
      return;
    }

    const isAdminUser = req.session?.authenticated === true;
    const mine = String(req.body?.fingerprint || req.query.fingerprint || '');
    if (!isAdminUser && row.author_fingerprint !== mine) {
      res.status(403).json({ error: 'Seul l\'auteur ou le délégué peut supprimer cette fiche' });
      return;
    }

    await execute('DELETE FROM sheets WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete sheet error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;