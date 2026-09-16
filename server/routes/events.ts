import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const events = db.prepare('SELECT * FROM events ORDER BY date ASC').all();
    res.json(events);
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { title, date, time, description, category } = req.body;
    if (!title || typeof title !== 'string' || !date || typeof date !== 'string') {
      res.status(400).json({ error: 'Titre et date requis' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO events (title, date, time, description, category)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        date.trim(),
        (time || '').trim(),
        (description || '').trim(),
        (category || 'evenement').trim()
      );

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json(event);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Événement introuvable' });
      return;
    }

    const { title, date, time, description, category } = req.body;
    db.prepare(
      `UPDATE events SET
        title = COALESCE(?, title),
        date = COALESCE(?, date),
        time = COALESCE(?, time),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      title?.trim() ?? null,
      date?.trim() ?? null,
      time?.trim() ?? null,
      description?.trim() ?? null,
      category?.trim() ?? null,
      id
    );

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Événement introuvable' });
      return;
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
