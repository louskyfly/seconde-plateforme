import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const projects = db
      .prepare('SELECT * FROM projects ORDER BY created_at DESC')
      .all();
    res.json(projects);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { name, description, status, date, image_url } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Nom requis' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO projects (name, description, status, date, image_url)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        name.trim(),
        (description || '').trim(),
        (status || 'en_preparation').trim(),
        (date || '').trim() || null,
        image_url || null
      );

    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Projet introuvable' });
      return;
    }

    const { name, description, status, date, image_url } = req.body;
    db.prepare(
      `UPDATE projects SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        date = COALESCE(?, date),
        image_url = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      name?.trim() ?? null,
      description?.trim() ?? null,
      status?.trim() ?? null,
      date?.trim() ?? null,
      image_url !== undefined ? image_url : (existing as any).image_url,
      id
    );

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Projet introuvable' });
      return;
    }

    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
