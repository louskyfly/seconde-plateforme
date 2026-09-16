import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const resources = db
      .prepare('SELECT * FROM resources ORDER BY created_at DESC')
      .all();
    res.json(resources);
  } catch (err) {
    console.error('Get resources error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, subject, file_url, link_url } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Titre requis' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO resources (title, description, subject, file_url, link_url)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        (description || '').trim(),
        (subject || 'autre').trim(),
        file_url || null,
        link_url || null
      );

    const resource = db
      .prepare('SELECT * FROM resources WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    res.status(201).json(resource);
  } catch (err) {
    console.error('Create resource error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }

    const { title, description, subject, file_url, link_url } = req.body;
    db.prepare(
      `UPDATE resources SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        subject = COALESCE(?, subject),
        file_url = ?,
        link_url = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      title?.trim() ?? null,
      description?.trim() ?? null,
      subject?.trim() ?? null,
      file_url !== undefined ? file_url : (existing as any).file_url,
      link_url !== undefined ? link_url : (existing as any).link_url,
      id
    );

    const updated = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update resource error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }

    db.prepare('DELETE FROM resources WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete resource error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
