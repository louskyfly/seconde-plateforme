import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const resources = await query('SELECT * FROM resources ORDER BY created_at DESC');
    res.json(resources);
  } catch (err) {
    console.error('Get resources error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, subject, file_url, link_url } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Titre requis' });
      return;
    }

    const result = await execute(
      `INSERT INTO resources (title, description, subject, file_url, link_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        title.trim(),
        (description || '').trim(),
        (subject || 'autre').trim(),
        file_url || null,
        link_url || null
      ]
    );

    const resource = await queryOne('SELECT * FROM resources WHERE id = $1', [result.lastInsertId]);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Create resource error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM resources WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }

    const { title, description, subject, file_url, link_url } = req.body;
    await execute(
      `UPDATE resources SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        subject = COALESCE($3, subject),
        file_url = $4,
        link_url = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        title?.trim() ?? null,
        description?.trim() ?? null,
        subject?.trim() ?? null,
        file_url !== undefined ? file_url : (existing as any).file_url,
        link_url !== undefined ? link_url : (existing as any).link_url,
        id
      ]
    );

    const updated = await queryOne('SELECT * FROM resources WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Update resource error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM resources WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }

    await execute('DELETE FROM resources WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete resource error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;