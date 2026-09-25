import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToAll } from '../lib/push.js';

const router = Router();

export const REACTIONS = ['vu', 'jaime', 'question', 'important'] as const;

router.get('/', (req, res) => {
  try {
    const fingerprint = typeof req.query.fingerprint === 'string' ? req.query.fingerprint : '';
    const isDelegate = req.session?.authenticated === true;
    const announcements = db
      .prepare(
        isDelegate
          ? 'SELECT * FROM announcements ORDER BY created_at DESC'
          : 'SELECT * FROM announcements WHERE published = 1 ORDER BY created_at DESC'
      )
      .all() as any[];

    const counts = db
      .prepare(
        'SELECT announcement_id, reaction, COUNT(*) AS count FROM announcement_reactions GROUP BY announcement_id, reaction'
      )
      .all() as { announcement_id: number; reaction: string; count: number }[];

    const mine = fingerprint
      ? (db
          .prepare(
            'SELECT announcement_id, reaction FROM announcement_reactions WHERE reactor_fingerprint = ?'
          )
          .all(fingerprint) as { announcement_id: number; reaction: string }[])
      : [];

    const countMap = new Map<number, Record<string, number>>();
    for (const row of counts) {
      const bucket = countMap.get(row.announcement_id) || {};
      bucket[row.reaction] = row.count;
      countMap.set(row.announcement_id, bucket);
    }
    const mineMap = new Map<number, string[]>();
    for (const row of mine) {
      const list = mineMap.get(row.announcement_id) || [];
      list.push(row.reaction);
      mineMap.set(row.announcement_id, list);
    }

    const result = announcements.map((a) => ({
      ...a,
      reactions: countMap.get(a.id) || {},
      my_reactions: mineMap.get(a.id) || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('Get announcements error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, category, importance, author, attachment_url, image, published } = req.body;
    if (!title || typeof title !== 'string' || !description || typeof description !== 'string') {
      res.status(400).json({ error: 'Titre et description requis' });
      return;
    }
    const isPublished = published === undefined ? 1 : published ? 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO announcements (title, description, category, importance, author, attachment_url, image, published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        description.trim(),
        (category || 'general').trim(),
        (importance || 'normal').trim(),
        (author || 'Délégué').trim(),
        attachment_url || null,
        image || null,
        isPublished
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

router.post('/:id/react', (req, res) => {
  try {
    const { id } = req.params;
    const { reaction, fingerprint } = req.body || {};

    if (!REACTIONS.includes(reaction)) {
      res.status(400).json({ error: 'Réaction invalide' });
      return;
    }
    if (!fingerprint || typeof fingerprint !== 'string') {
      res.status(400).json({ error: 'Identifiant requis' });
      return;
    }

    const announcement = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      res.status(404).json({ error: 'Annonce introuvable' });
      return;
    }

    const existing = db
      .prepare(
        'SELECT id FROM announcement_reactions WHERE announcement_id = ? AND reaction = ? AND reactor_fingerprint = ?'
      )
      .get(id, reaction, fingerprint);

    if (existing) {
      db.prepare(
        'DELETE FROM announcement_reactions WHERE announcement_id = ? AND reaction = ? AND reactor_fingerprint = ?'
      ).run(id, reaction, fingerprint);
    } else {
      db.prepare(
        'INSERT INTO announcement_reactions (announcement_id, reaction, reactor_fingerprint) VALUES (?, ?, ?)'
      ).run(id, reaction, fingerprint);
    }

    const rows = db
      .prepare(
        'SELECT reaction, COUNT(*) AS count FROM announcement_reactions WHERE announcement_id = ? GROUP BY reaction'
      )
      .all(id) as { reaction: string; count: number }[];

    const reactions: Record<string, number> = {};
    for (const row of rows) reactions[row.reaction] = row.count;

    const myReactions = (
      db
        .prepare(
          'SELECT reaction FROM announcement_reactions WHERE announcement_id = ? AND reactor_fingerprint = ?'
        )
        .all(id, fingerprint) as { reaction: string }[]
    ).map((r) => r.reaction);

    res.json({ reactions, my_reactions: myReactions });
  } catch (err) {
    console.error('React announcement error:', err);
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
