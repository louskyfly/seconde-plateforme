import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logAdminAction } from '../lib/maintenance.js';
import { cleanText, safeFileName, toDataUri, validateDataUri, MAX_SHEET_IMAGE_BYTES } from '../lib/files.js';

const router = Router();

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

function isAdmin(req: any): boolean {
  return req.session?.authenticated === true;
}

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
    has_file: row.file_data ? 1 : 0,
    status: row.status,
    created_at: row.created_at,
    is_mine: row.author_fingerprint ? row.__mine === 1 : false,
  };
}

/** Liste des fiches : les fiches masquées ne sont visibles que par le délégué. */
router.get('/', (req, res) => {
  try {
    const subject = cleanText(req.query.subject, 40);
    const search = cleanText(req.query.q, 60);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

    const where: string[] = [];
    const params: any[] = [];
    if (!isAdmin(req)) {
      where.push("status = 'active'");
    } else if (req.query.status && ['active', 'hidden'].includes(String(req.query.status))) {
      where.push('status = ?');
      params.push(String(req.query.status));
    }
    if (subject) {
      where.push('subject = ?');
      params.push(subject);
    }
    if (search) {
      where.push('(title LIKE ? OR description LIKE ? OR author_name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (
      db.prepare(`SELECT COUNT(*) AS count FROM sheets ${clause}`).get(...params) as { count: number }
    ).count;

    const rows = db
      .prepare(
        `SELECT * FROM sheets ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, (page - 1) * limit) as any[];

    const mine = isAdmin(req) ? null : String(req.query.fingerprint || '');
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

/**
 * Fichier de la fiche : servi par l'API avec des en-têtes durcis.
 * Jamais de fichier exécutable ni servi depuis un dossier statique public.
 */
router.get('/:id/file', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM sheets WHERE id = ?').get(req.params.id) as any;
    if (!row || !row.file_data) {
      res.status(404).json({ error: 'Fichier introuvable' });
      return;
    }
    if (row.status !== 'active' && !isAdmin(req)) {
      res.status(404).json({ error: 'Fichier introuvable' });
      return;
    }

    const check = validateDataUri(row.file_data, ['image', 'document'], {
    maxImageBytes: MAX_SHEET_IMAGE_BYTES,
  });
    if (!check.ok) {
      res.status(415).json({ error: 'Fichier illisible' });
      return;
    }

    const inline = check.file.kind === 'image' && req.query.inline === '1';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=600');
    if (inline) {
      res.setHeader('Content-Type', check.file.mime);
      res.send(check.file.buffer);
      return;
    }
    res.setHeader('Content-Type', check.file.mime);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${row.file_name || safeFileName(row.title, check.file.ext)}"`
    );
    res.send(check.file.buffer);
  } catch (err) {
    console.error('Get sheet file error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Dépôt d'une fiche par un élève. */
router.post('/', (req, res) => {
  try {
    const title = cleanText(req.body?.title, MAX_TITLE);
    if (title.length < 2) {
      res.status(400).json({ error: 'Titre requis (2 caractères minimum)' });
      return;
    }

    const subject = cleanText(req.body?.subject, 40) || 'autre';
    const classLevel = cleanText(req.body?.class_level, 30) || null;
    const description = cleanText(req.body?.description, MAX_DESCRIPTION);
    const fingerprint = cleanText(req.body?.fingerprint, 64) || null;

    let authorName = cleanText(req.body?.author_name, 30);
    if (fingerprint) {
      const known = db.prepare('SELECT display_name FROM chat_users WHERE fingerprint = ?').get(fingerprint) as
        | { display_name: string }
        | undefined;
      if (known?.display_name) authorName = known.display_name;
    }
    if (authorName.length < 2) {
      res.status(400).json({ error: 'Indique ton pseudo (2 caractères minimum)' });
      return;
    }

    // Les fiches acceptent des images jusqu'à 15 Mo (le chat reste à 3 Mo).
  const check = validateDataUri(req.body?.file, ['image', 'document'], {
    maxImageBytes: MAX_SHEET_IMAGE_BYTES,
  });
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    const fileName = safeFileName(title, check.file.ext);
    const inserted = db
      .prepare(
        `INSERT INTO sheets (title, subject, class_level, description, author_name, author_fingerprint,
                             file_data, file_name, mime_type, file_size, kind, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        title,
        subject,
        classLevel,
        description,
        authorName,
        fingerprint,
        toDataUri(check.file),
        fileName,
        check.file.mime,
        check.file.size,
        check.file.kind
      );

    const created = db.prepare('SELECT * FROM sheets WHERE id = ?').get(Number(inserted.lastInsertRowid)) as any;
    res.status(201).json(shapeSheet({ ...created, __mine: 1 }));
  } catch (err) {
    console.error('Create sheet error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Modération : masquer / remettre en ligne une fiche. */
router.patch('/:id', requireAuth, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM sheets WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Fiche introuvable' });
      return;
    }
    const status = String(req.body?.status || '');
    if (!['active', 'hidden'].includes(status)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }
    db.prepare('UPDATE sheets SET status = ? WHERE id = ?').run(status, row.id);
    logAdminAction(db, status === 'hidden' ? 'sheet_hide' : 'sheet_show', 'sheet', row.id, row.title);
    res.json({ success: true, status });
  } catch (err) {
    console.error('Update sheet error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Suppression : par l'auteur de la fiche ou par le délégué. Le fichier part avec la ligne. */
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM sheets WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Fiche introuvable' });
      return;
    }

    if (isAdmin(req)) {
      db.prepare('DELETE FROM sheets WHERE id = ?').run(row.id);
      logAdminAction(db, 'sheet_delete', 'sheet', row.id, `« ${row.title} » (${row.author_name}) supprimée`);
      res.json({ success: true });
      return;
    }

    const fingerprint = cleanText(req.body?.fingerprint ?? req.query.fingerprint, 64);
    if (!fingerprint || !row.author_fingerprint || fingerprint !== row.author_fingerprint) {
      res.status(403).json({ error: 'Tu ne peux supprimer que tes propres fiches' });
      return;
    }
    db.prepare('DELETE FROM sheets WHERE id = ?').run(row.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete sheet error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
