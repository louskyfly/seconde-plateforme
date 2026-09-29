import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';

const router = Router();

/** Bornes de durée : une session de dix minutes n'est pas une session. */
const MIN_DURATION = 15;
const MAX_DURATION = 480;

/** `HH:MM`, sinon null. */
function cleanTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value.trim())) return null;
  const [h, m] = value.trim().split(':').map(Number);
  return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
}

/** `AAAA-MM-JJ`, sinon null. */
function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  // On vérifie que la date existe vraiment : le 31 février passerait sinon.
  const [y, m, d] = v.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d ? v : null;
}

function cleanDuration(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 60;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(n)));
}

/**
 * Sessions de révision, lisibles par tous.
 *
 * Le détail est public : c'est l'intérêt, un élève doit pouvoir retrouver
 * quand et où se tient la prochaine session. Seuls les élèves connectés
 * voient les sessions déjà passées, et encore seulement si `upcoming=false` est
 * demandé explicitement.
 */
router.get('/', (req, res) => {
  try {
    const seulementAVenir = req.query.upcoming !== 'false';
    const sessions = db
      .prepare(
        `SELECT * FROM revision_sessions
         ${seulementAVenir ? "WHERE date >= date('now')" : ''}
         ORDER BY date ASC, time IS NULL, time ASC`
      )
      .all();
    res.json(sessions);
  } catch (err) {
    console.error('Get revision sessions error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const title = cleanText(req.body?.title, 100);
    const date = cleanDate(req.body?.date);
    if (title.length < 2) {
      res.status(400).json({ error: 'Titre requis' });
      return;
    }
    if (!date) {
      res.status(400).json({ error: 'Date invalide' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO revision_sessions (title, subject, date, time, duration, location, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        cleanText(req.body?.subject, 30) || 'autre',
        date,
        cleanTime(req.body?.time),
        cleanDuration(req.body?.duration),
        cleanText(req.body?.location, 80),
        cleanText(req.body?.description, 1000)
      );

    res.status(201).json(db.prepare('SELECT * FROM revision_sessions WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error('Create revision session error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM revision_sessions WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Session introuvable' });
      return;
    }

    const title = cleanText(req.body?.title, 100) || existing.title;
    const date = req.body?.date === undefined ? existing.date : cleanDate(req.body.date);
    if (!date) {
      res.status(400).json({ error: 'Date invalide' });
      return;
    }

    db.prepare(
      `UPDATE revision_sessions
       SET title = ?, subject = ?, date = ?, time = ?, duration = ?, location = ?, description = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      title,
      cleanText(req.body?.subject, 30) || existing.subject,
      date,
      req.body?.time === undefined ? existing.time : cleanTime(req.body.time),
      req.body?.duration === undefined ? existing.duration : cleanDuration(req.body.duration),
      req.body?.location === undefined ? existing.location : cleanText(req.body.location, 80),
      req.body?.description === undefined ? existing.description : cleanText(req.body.description, 1000),
      id
    );

    res.json(db.prepare('SELECT * FROM revision_sessions WHERE id = ?').get(id));
  } catch (err) {
    console.error('Update revision session error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM revision_sessions WHERE id = ?').get(id)) {
      res.status(404).json({ error: 'Session introuvable' });
      return;
    }
    db.prepare('DELETE FROM revision_sessions WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete revision session error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
