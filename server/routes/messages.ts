import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import { cleanFirstName, isValidFirstName } from '../lib/name.js';

const router = Router();

/**
 * File des messages de l'élève, alimentée par le delegate_name du compte
 * délégué. Accessible sans authentification mais limitée à un fingerprint :
 * l'élève ne voit que ses propres messages, comme partout ailleurs dans
 * l'application.
 */
router.get('/mine', (req, res) => {
  try {
    const fingerprint = String(req.query.fingerprint || '').slice(0, 64);
    if (!fingerprint) {
      res.status(400).json({ error: 'Fingerprint requis' });
      return;
    }

    const messages = db
      .prepare(
        `SELECT id, content, category, anonymous, status, delegate_reply, replied_at,
                response_read_at, created_at
           FROM messages
          WHERE fingerprint = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 50`
      )
      .all(fingerprint) as any[];

    const { delegate_name: delegateName } =
      (db.prepare('SELECT delegate_name FROM settings WHERE id = 1').get() as any) || {};

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

router.get('/', requireAuth, (req, res) => {
  try {
    const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all() as any[];
    const sanitized = messages.map((msg) => ({
      ...msg,
      author_name: msg.anonymous === 1 ? null : msg.author_name,
    }));
    // Le fingerprint identifie l'élève : inutile pour le délégué, on l'enlève.
    for (const msg of sanitized) delete msg.fingerprint;
    res.json(sanitized);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', (req, res) => {
  try {
    const { content, category, anonymous, author_name, fingerprint } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Contenu requis' });
      return;
    }

    const isAnonymous = anonymous ? 1 : 0;
    const senderId = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 64) : '';

    // Même règle que pour les idées : un message signé exige un prénom, sinon
    // un client qui contourne l'interface pourrait publier sans identité.
    const author = cleanFirstName(author_name);
    if (!isAnonymous && !isValidFirstName(author)) {
      res.status(400).json({ error: 'Un prénom est requis pour envoyer un message signé' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO messages (content, category, anonymous, author_name, fingerprint)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        content.trim(),
        (category || 'autre').trim(),
        isAnonymous,
        isAnonymous ? null : author,
        senderId || null
      );

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    const sanitized = {
      ...message,
      author_name: message.anonymous === 1 ? null : message.author_name,
    };
    delete sanitized.fingerprint;
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

    const { status, reply } = req.body;
    const hasReply = typeof reply === 'string';
    const cleanReply = hasReply ? cleanText(reply, 1000) : null;

    db.prepare(
      `UPDATE messages SET
        status = COALESCE(?, status),
        delegate_reply = COALESCE(?, delegate_reply),
        replied_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE replied_at END,
        response_read_at = CASE WHEN ? = 1 THEN NULL ELSE response_read_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      status?.trim() ?? null,
      hasReply ? cleanReply : null,
      hasReply ? 1 : 0,
      hasReply ? 1 : 0,
      id
    );

    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;
    delete updated.fingerprint;
    res.json(updated);
  } catch (err) {
    console.error('Update message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Marque comme lue la réponse du délégué. Sans cet appel, le compteur
 * « messages à lire » de l'accueil restait affiché même après lecture.
 * La vérification du fingerprint empêche de marquer le message d'un autre élève.
 */
router.post('/mine/:id/read', (req, res) => {
  try {
    const fingerprint = String(req.query.fingerprint || '').slice(0, 64);
    if (!fingerprint) {
      res.status(400).json({ error: 'Fingerprint requis' });
      return;
    }

    const id = Number(req.params.id);
    const updated = db
      .prepare(
        `UPDATE messages SET response_read_at = CURRENT_TIMESTAMP
          WHERE id = ? AND fingerprint = ? AND delegate_reply IS NOT NULL`
      )
      .run(id, fingerprint);

    if (updated.changes === 0) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Mark message read error:', err);
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
