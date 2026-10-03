import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const events = await query('SELECT * FROM events ORDER BY date ASC');
    res.json(events);
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, date, time, description, category } = req.body;
    if (!title || typeof title !== 'string' || !date || typeof date !== 'string') {
      res.status(400).json({ error: 'Titre et date requis' });
      return;
    }

    const result = await execute(
      `INSERT INTO events (title, date, time, description, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        title.trim(),
        date.trim(),
        (time || '').trim(),
        (description || '').trim(),
        (category || 'evenement').trim()
      ]
    );

    const event = await queryOne('SELECT * FROM events WHERE id = $1', [result.lastInsertId]);
    res.status(201).json(event);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM events WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Événement introuvable' });
      return;
    }

    const { title, date, time, description, category } = req.body;
    await execute(
      `UPDATE events SET
        title = COALESCE($1, title),
        date = COALESCE($2, date),
        time = COALESCE($3, time),
        description = COALESCE($4, description),
        category = COALESCE($5, category),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        title?.trim() ?? null,
        date?.trim() ?? null,
        time?.trim() ?? null,
        description?.trim() ?? null,
        category?.trim() ?? null,
        id
      ]
    );

    const updated = await queryOne('SELECT * FROM events WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM events WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Événement introuvable' });
      return;
    }

    await execute('DELETE FROM events WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;