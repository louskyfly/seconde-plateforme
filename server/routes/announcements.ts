import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToAll } from '../lib/push.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const announcements = db
      .prepare('SELECT * FROM announcements WHERE published = 1 ORDER BY created_at DESC')
      .all();
    res.json(announcements);
  } catch (err) {
    console.error('Get announcements error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, category, importance, author, attachment_url, image } = req.body;
    if (!title || typeof title !== 'string' || !description || typeof description !== 'string') {
      res.status(400).json({ error: 'Titre et description requis' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO announcements (title, description, category, importance, author, attachment_url, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        description.trim(),
        (category || 'general').trim(),
        (importance || 'normal').trim(),
        (author || 'Délégué').trim(),
        attachment_url || null,
        image || null
      );

    const announcement = db
      .prepare('SELECT * FROM announcements WHERE id = ?')
      .get(Number(result.lastInsertRowid));

    if (announcement && (announcement as any).published === 1) {
      sendPushToAll({
        title: '📢 Nouvelle annonce',
        body: (announcement as any).title,
        url: '/informations',
      });
    }

    res.status(201).json(announcement);
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Annonce introuvable' });
      return;
    }

    const { title, description, category, importance, author, attachment_url, image, published } = req.body;
    db.prepare(
      `UPDATE announcements SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        importance = COALESCE(?, importance),
        author = COALESCE(?, author),
        attachment_url = ?,
        image = ?,
        published = COALESCE(?, published),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      title?.trim() ?? null,
      description?.trim() ?? null,
      category?.trim() ?? null,
      importance?.trim() ?? null,
      author?.trim() ?? null,
      attachment_url !== undefined ? attachment_url : (existing as any).attachment_url,
      image !== undefined ? image : (existing as any).image,
      published !== undefined ? published : null,
      id
    );

    const updated = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Annonce introuvable' });
      return;
    }

    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
