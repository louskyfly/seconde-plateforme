import { Router } from 'express';
import { query, queryOne, execute } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToAll } from '../lib/push.js';

const router = Router();

export const REACTIONS = ['vu', 'jaime', 'question', 'important'] as const;

router.get('/', async (req, res) => {
  try {
    const fingerprint = typeof req.query.fingerprint === 'string' ? req.query.fingerprint : '';
    const isDelegate = req.session?.authenticated === true;

    const announcements = await query(
      isDelegate
        ? 'SELECT * FROM announcements ORDER BY created_at DESC'
        : 'SELECT * FROM announcements WHERE published = TRUE ORDER BY created_at DESC'
    ) as any[];

    const counts = await query(
      'SELECT announcement_id, reaction, COUNT(*) AS count FROM announcement_reactions GROUP BY announcement_id, reaction'
    ) as { announcement_id: number; reaction: string; count: number }[];

    const mine = fingerprint
      ? await query(
          'SELECT announcement_id, reaction FROM announcement_reactions WHERE reactor_fingerprint = $1',
          [fingerprint]
        ) as { announcement_id: number; reaction: string }[]
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

router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, category, importance, author, attachment_url, image, published } = req.body;
    if (!title || typeof title !== 'string' || !description || typeof description !== 'string') {
      res.status(400).json({ error: 'Titre et description requis' });
      return;
    }
    const isPublished = published === undefined ? true : Boolean(published);

    const result = await execute(
      `INSERT INTO announcements (title, description, category, importance, author, attachment_url, image, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        title.trim(),
        description.trim(),
        (category || 'general').trim(),
        (importance || 'normal').trim(),
        (author || 'Délégué').trim(),
        attachment_url || null,
        image || null,
        isPublished
      ]
    );

    const announcement = await queryOne('SELECT * FROM announcements WHERE id = $1', [result.lastInsertId]);

    if (announcement && (announcement as any).published === true) {
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

router.post('/:id/react', async (req, res) => {
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

    const announcement = await queryOne('SELECT id FROM announcements WHERE id = $1', [id]);
    if (!announcement) {
      res.status(404).json({ error: 'Annonce introuvable' });
      return;
    }

    const existing = await queryOne(
      'SELECT id FROM announcement_reactions WHERE announcement_id = $1 AND reaction = $2 AND reactor_fingerprint = $3',
      [id, reaction, fingerprint]
    );

    if (existing) {
      await execute(
        'DELETE FROM announcement_reactions WHERE announcement_id = $1 AND reaction = $2 AND reactor_fingerprint = $3',
        [id, reaction, fingerprint]
      );
    } else {
      await execute(
        'INSERT INTO announcement_reactions (announcement_id, reaction, reactor_fingerprint) VALUES ($1, $2, $3)',
        [id, reaction, fingerprint]
      );
    }

    const rows = await query(
      'SELECT reaction, COUNT(*) AS count FROM announcement_reactions WHERE announcement_id = $1 GROUP BY reaction',
      [id]
    ) as { reaction: string; count: number }[];

    const reactions: Record<string, number> = {};
    for (const row of rows) reactions[row.reaction] = row.count;

    const myReactions = (
      await query(
        'SELECT reaction FROM announcement_reactions WHERE announcement_id = $1 AND reactor_fingerprint = $2',
        [id, fingerprint]
      ) as { reaction: string }[]
    ).map((r) => r.reaction);

    res.json({ reactions, my_reactions: myReactions });
  } catch (err) {
    console.error('React announcement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM announcements WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Annonce introuvable' });
      return;
    }

    const { title, description, category, importance, author, attachment_url, image, published } = req.body;
    await execute(
      `UPDATE announcements SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        importance = COALESCE($4, importance),
        author = COALESCE($5, author),
        attachment_url = $6,
        image = $7,
        published = COALESCE($8, published),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9`,
      [
        title?.trim() ?? null,
        description?.trim() ?? null,
        category?.trim() ?? null,
        importance?.trim() ?? null,
        author?.trim() ?? null,
        attachment_url !== undefined ? attachment_url : (existing as any).attachment_url,
        image !== undefined ? image : (existing as any).image,
        published !== undefined ? Boolean(published) : null,
        id
      ]
    );

    const updated = await queryOne('SELECT * FROM announcements WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM announcements WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Annonce introuvable' });
      return;
    }

    await execute('DELETE FROM announcements WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;