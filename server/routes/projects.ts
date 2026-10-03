import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const projects = await query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(projects);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description, status, date, image_url } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Nom requis' });
      return;
    }

    const result = await execute(
      `INSERT INTO projects (name, description, status, date, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        name.trim(),
        (description || '').trim(),
        (status || 'en_preparation').trim(),
        (date || '').trim() || null,
        image_url || null
      ]
    );

    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [result.lastInsertId]);
    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM projects WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Projet introuvable' });
      return;
    }

    const { name, description, status, date, image_url } = req.body;
    await execute(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        date = COALESCE($4, date),
        image_url = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        name?.trim() ?? null,
        description?.trim() ?? null,
        status?.trim() ?? null,
        date?.trim() ?? null,
        image_url !== undefined ? image_url : (existing as any).image_url,
        id
      ]
    );

    const updated = await queryOne('SELECT * FROM projects WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM projects WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Projet introuvable' });
      return;
    }

    await execute('DELETE FROM projects WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;