import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';

const router = Router();

/** Statuts acceptés, alignés sur IDEA_STATUSES côté client. */
const IDEA_STATUSES = ['a_etudier', 'en_discussion', 'transmise', 'realisee', 'non_retenue'];

router.get('/', (req, res) => {
  try {
    const ideas = db.prepare('SELECT * FROM ideas ORDER BY created_at DESC').all() as any[];
    const sanitized = ideas.map((idea) => ({
      ...idea,
      author_name: idea.anonymous === 1 ? null : idea.author_name,
    }));
    res.json(sanitized);
  } catch (err) {
    console.error('Get ideas error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', (req, res) => {
  try {
    const { title, description, category, anonymous, author_name } = req.body;
    if (!title || typeof title !== 'string' || !description || typeof description !== 'string') {
      res.status(400).json({ error: 'Titre et description requis' });
      return;
    }

    const isAnonymous = anonymous ? 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO ideas (title, description, category, anonymous, author_name)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        description.trim(),
        (category || 'classe').trim(),
        isAnonymous,
        isAnonymous ? null : (author_name || null)
      );

    const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    const sanitized = {
      ...idea,
      author_name: idea.anonymous === 1 ? null : idea.author_name,
    };
    res.status(201).json(sanitized);
  } catch (err) {
    console.error('Create idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    const { status, delegate_response } = req.body;

    // Le statut est validé explicitement : une valeur hors liste était
    // acceptée et enregistrée telle quelle, ce qui rendait l'idée invisible
    // des filtres du client.
    let nextStatus: string | null = null;
    if (status !== undefined && status !== null && status !== '') {
      const candidate = cleanText(String(status), 30);
      if (!IDEA_STATUSES.includes(candidate)) {
        res.status(400).json({ error: 'Statut invalide' });
        return;
      }
      nextStatus = candidate;
    }

    const response = cleanText(delegate_response, 2000);

    db.prepare(
      `UPDATE ideas SET
        status = COALESCE(?, status),
        delegate_response = COALESCE(?, delegate_response),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(nextStatus, response || null, id);

    const updated = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
