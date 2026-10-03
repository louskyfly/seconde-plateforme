import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { cleanText } from '../lib/files.js';

interface RevisionSessionRow {
  id: number;
  title: string;
  subject: string;
  date: string;
  time: string | null;
  duration: number;
  location: string;
  description: string;
  created_by_fingerprint: string | null;
  created_at: string;
}

const router = Router();

const MIN_DURATION = 15;
const MAX_DURATION = 480;

function cleanTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value.trim())) return null;
  const [h, m] = value.trim().split(':').map(Number);
  return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d ? v : null;
}

function cleanDuration(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 60;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(n)));
}

function identifier(req: { session?: { authenticated?: boolean }; body?: any; query?: any }) {
  if (req.session?.authenticated === true) return { estDelegue: true, empreinte: '' as string };
  const empreinte = cleanText(req.body?.fingerprint ?? req.query?.fingerprint, 64);
  if (empreinte.length < 8) return null;
  return { estDelegue: false, empreinte };
}

router.get('/', async (req, res) => {
  try {
    const seulementAVenir = req.query.upcoming !== 'false';
    const sessions = await query<RevisionSessionRow>(
      `SELECT * FROM revision_sessions
       ${seulementAVenir ? "WHERE date >= date('now')" : ''}
       ORDER BY date ASC, time IS NULL, time ASC`
    );

    const estDelegue = req.session?.authenticated === true;
    const empreinte = cleanText(req.query.fingerprint, 64);

    res.json(
      sessions.map(({ created_by_fingerprint, ...reste }) => ({
        ...reste,
        mine: !estDelegue && empreinte.length >= 8 && created_by_fingerprint === empreinte,
        peut_modifier:
          estDelegue || (empreinte.length >= 8 && created_by_fingerprint === empreinte),
      }))
    );
  } catch (err) {
    console.error('Get revision sessions error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  try {
    const qui = identifier(req);
    if (!qui) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const { estDelegue, empreinte } = qui;

    const title = cleanText(req.body?.title, 100);
    if (!title) {
      res.status(400).json({ error: 'Titre requis' });
      return;
    }
    const subject = cleanText(req.body?.subject, 30) || 'autre';
    const date = cleanDate(req.body?.date);
    if (!date) {
      res.status(400).json({ error: 'Date invalide' });
      return;
    }
    const time = cleanTime(req.body?.time) || null;
    const duration = cleanDuration(req.body?.duration);
    const location = cleanText(req.body?.location, 80) || '';
    const description = cleanText(req.body?.description, 1000) || '';
    const createdByFp = estDelegue ? null : empreinte;

    const result = await execute(
      `INSERT INTO revision_sessions (title, subject, date, time, duration, location, description, created_by_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [title, subject, date, time, duration, location, description, createdByFp]
    );

    const session = await queryOne<RevisionSessionRow>('SELECT * FROM revision_sessions WHERE id = $1', [result.lastInsertId]);
    if (!session) {
      res.status(500).json({ error: 'Erreur serveur' });
      return;
    }
    res.status(201).json({
      ...session,
      mine: !estDelegue && empreinte.length >= 8 && createdByFp === empreinte,
      peut_modifier: estDelegue || (empreinte.length >= 8 && createdByFp === empreinte),
    });
  } catch (err) {
    console.error('Create revision session error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne<RevisionSessionRow>('SELECT * FROM revision_sessions WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Session introuvable' });
      return;
    }

    const qui = identifier(req);
    if (!qui) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const { estDelegue, empreinte } = qui;

    if (!estDelegue && existing.created_by_fingerprint !== empreinte) {
      res.status(403).json({ error: 'Tu ne peux modifier que les sessions que tu as créées' });
      return;
    }

    const { title, subject, date, time, duration, location, description } = req.body;
    const newTitle = title ? cleanText(title, 100) : existing.title;
    const newSubject = req.body.subject ? cleanText(req.body.subject, 30) : existing.subject;
    const newDate = date ? cleanDate(req.body.date) : existing.date;
    if (date && !newDate) {
      res.status(400).json({ error: 'Date invalide' });
      return;
    }
    const newTime = time ? cleanTime(req.body.time) : existing.time;
    const newDuration = duration ? cleanDuration(req.body.duration) : existing.duration;
    const newLocation = req.body.location ? cleanText(req.body.location, 80) : existing.location;
    const newDescription = req.body.description ? cleanText(req.body.description, 1000) : existing.description;

    await execute(
      `UPDATE revision_sessions SET
         title = $1, subject = $2, date = $3, time = $4, duration = $5, location = $6, description = $7
       WHERE id = $8`,
      [newTitle, newSubject, newDate, newTime, newDuration, newLocation, newDescription, id]
    );

    const updated = await queryOne<RevisionSessionRow>('SELECT * FROM revision_sessions WHERE id = $1', [id]);
    if (!updated) {
      res.status(500).json({ error: 'Erreur serveur' });
      return;
    }
    res.json({
      ...updated,
      mine: !estDelegue && empreinte.length >= 8 && existing.created_by_fingerprint === empreinte,
      peut_modifier: estDelegue || (empreinte.length >= 8 && existing.created_by_fingerprint === empreinte),
    });
  } catch (err) {
    console.error('Update revision session error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne<RevisionSessionRow>('SELECT * FROM revision_sessions WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Session introuvable' });
      return;
    }

    const qui = identifier(req);
    if (!qui) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const { estDelegue, empreinte } = qui;

    if (!estDelegue && existing.created_by_fingerprint !== empreinte) {
      res.status(403).json({ error: 'Tu ne peux supprimer que les sessions que tu as créées' });
      return;
    }

    await execute('DELETE FROM revision_sessions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete revision session error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;