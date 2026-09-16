import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all() as any[];
    const sanitized = messages.map((msg) => ({
      ...msg,
      author_name: msg.anonymous === 1 ? null : msg.author_name,
    }));
    res.json(sanitized);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', (req, res) => {
  try {
    const { content, category, anonymous, author_name } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Contenu requis' });
      return;
    }

    const isAnonymous = anonymous ? 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO messages (content, category, anonymous, author_name)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        content.trim(),
        (category || 'autre').trim(),
        isAnonymous,
        isAnonymous ? null : (author_name || null)
      );

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    const sanitized = {
      ...message,
      author_name: message.anonymous === 1 ? null : message.author_name,
    };
    res.status(201).json(sanitized);
  } catch (err) {
    console.error('Create message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    const { status } = req.body;
    db.prepare(
      `UPDATE messages SET
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(status?.trim() ?? null, id);

    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
