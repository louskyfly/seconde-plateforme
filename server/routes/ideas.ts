import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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
    db.prepare(
      `UPDATE ideas SET
        status = COALESCE(?, status),
        delegate_response = COALESCE(?, delegate_response),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      status?.trim() ?? null,
      delegate_response?.trim() ?? null,
      id
    );

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
