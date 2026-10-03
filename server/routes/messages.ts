import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import { cleanFirstName, isValidFirstName } from '../lib/name.js';

const router = Router();

router.get('/mine', async (req, res) => {
  try {
    const fingerprint = String(req.query.fingerprint || '').slice(0, 64);
    if (!fingerprint) {
      res.status(400).json({ error: 'Fingerprint requis' });
      return;
    }

    const messages = await query(
      `SELECT id, content, category, anonymous, status, delegate_reply, replied_at,
              response_read_at, created_at
       FROM messages
      WHERE fingerprint = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 50`,
      [fingerprint]
    ) as any[];

    const settings = await queryOne<{ delegate_name: string }>('SELECT delegate_name FROM settings WHERE id = 1');
    const delegateName = settings?.delegate_name || '';

    res.json(
      messages.map((msg) => ({
        ...msg,
        author_name: msg.anonymous === 1 ? null : msg.author_name,
        delegate_name: delegateName || null,
      }))
    );
  } catch (err) {
    console.error('Get my messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const messages = await query('SELECT * FROM messages ORDER BY created_at DESC') as any[];
    const sanitized = messages.map((msg) => ({
      ...msg,
      author_name: msg.anonymous === 1 ? null : msg.author_name,
    }));
    for (const msg of sanitized) delete msg.fingerprint;
    res.json(sanitized);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { content, category, anonymous, author_name, fingerprint } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Contenu requis' });
      return;
    }

    const isAnonymous = anonymous ? 1 : 0;
    const senderId = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 64) : '';

    const author = cleanFirstName(author_name);
    if (!isAnonymous && !isValidFirstName(author)) {
      res.status(400).json({ error: 'Un prénom est requis pour envoyer un message signé' });
      return;
    }

    const result = await execute(
      `INSERT INTO messages (content, category, anonymous, author_name, fingerprint)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        content.trim(),
        (category || 'autre').trim(),
        isAnonymous,
        isAnonymous ? null : author,
        senderId || null
      ]
    );

    const message = await queryOne<{ id: number; content: string; category: string; anonymous: number; author_name: string | null; fingerprint: string | null; status: string | null; delegate_reply: string | null; replied_at: string | null; response_read_at: string | null; created_at: string }>('SELECT * FROM messages WHERE id = $1', [result.lastInsertId]);
    const settings2 = await queryOne<{ delegate_name: string }>('SELECT delegate_name FROM settings WHERE id = 1');
    if (message) {
      const { fingerprint: _fingerprint, ...rest } = message;
      const sanitized = {
        ...rest,
        author_name: message.anonymous === 1 ? null : message.author_name,
        delegate_name: settings2?.delegate_name || null,
      };
      res.status(201).json(sanitized);
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  } catch (err) {
    console.error('Create message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne<{ id: number; fingerprint: string | null }>('SELECT * FROM messages WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    const { status, reply } = req.body;
    const hasReply = typeof reply === 'string';
    const cleanReply = hasReply ? cleanText(reply, 1000) : null;

    await execute(
      `UPDATE messages SET
        status = COALESCE($1, status),
        delegate_reply = COALESCE($2, delegate_reply),
        replied_at = CASE WHEN $3 = 1 THEN CURRENT_TIMESTAMP ELSE replied_at END,
        response_read_at = CASE WHEN $4 = 1 THEN NULL ELSE response_read_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        status?.trim() ?? null,
        hasReply ? cleanReply : null,
        hasReply ? 1 : 0,
        hasReply ? 1 : 0,
        id
      ]
    );

    const updated = await queryOne<{ id: number; fingerprint: string | null }>('SELECT * FROM messages WHERE id = $1', [id]);
    if (updated) {
      const { fingerprint: _fingerprint, ...rest } = updated;
      res.json(rest);
    } else {
      res.json(updated);
    }
  } catch (err) {
    console.error('Update message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/mine/:id/read', async (req, res) => {
  try {
    const fingerprint = String(req.query.fingerprint || '').slice(0, 64);
    if (!fingerprint) {
      res.status(400).json({ error: 'Fingerprint requis' });
      return;
    }

    const id = Number(req.params.id);
    const row = await queryOne<{ id: number; response_read_at: string | null }>(
      `SELECT id, response_read_at FROM messages WHERE id = $1 AND fingerprint = $2`,
      [id, fingerprint]
    );
    if (!row) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }
    if (row.response_read_at) {
      res.json({ success: true, already_read: true });
      return;
    }

    await execute(
      'UPDATE messages SET response_read_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark message read error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM messages WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    await execute('DELETE FROM messages WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;