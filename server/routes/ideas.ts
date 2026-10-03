import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import { cleanFirstName, isValidFirstName } from '../lib/name.js';
import { logAdminAction } from '../lib/maintenance.js';

const router = Router();

const IDEA_STATUSES = ['a_etudier', 'en_discussion', 'transmise', 'realisee', 'non_retenue'];

router.get('/', async (req, res) => {
  try {
    const ideas = await query('SELECT * FROM ideas ORDER BY created_at DESC') as any[];
    const sanitized = ideas.map((idea) => ({
      ...idea,
      author_name: idea.anonymous === 1 ? null : idea.author_name,
    }));
    res.json(sanitized);
  } catch (err) {
    console.error('Get ideas error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const idea = await queryOne('SELECT id FROM ideas WHERE id = $1', [id]);
    if (!idea) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    const replies = await query(
      `SELECT id, content, author_name, fingerprint, deleted_at, created_at
       FROM idea_replies WHERE idea_id = $1 ORDER BY id ASC`,
      [id]
    ) as any[];

    const mien = cleanText(req.query.fingerprint, 64);
    const isDelegate = req.session?.authenticated === true;

    res.json(
      replies.map((r) => ({
        id: r.id,
        content: r.deleted_at ? 'Message supprimé' : r.content,
        author_name: r.deleted_at ? null : r.author_name,
        created_at: r.created_at,
        deleted_at: r.deleted_at,
        mine: Boolean(mien) && r.fingerprint === mien,
        can_delete: isDelegate || (Boolean(mien) && r.fingerprint === mien),
      }))
    );
  } catch (err) {
    console.error('Get idea replies error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, author_name, fingerprint } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Réponse vide' });
      return;
    }

    const idea = await queryOne('SELECT id FROM ideas WHERE id = $1', [id]);
    if (!idea) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    const author = cleanFirstName(author_name);
    if (!isValidFirstName(author)) {
      res.status(400).json({ error: 'Un prénom est requis pour répondre' });
      return;
    }

    const sender = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 64) : '';

    const result = await execute(
      'INSERT INTO idea_replies (idea_id, content, author_name, fingerprint) VALUES ($1, $2, $3, $4) RETURNING id',
      [id, cleanText(content, 1000), author, sender || null]
    );

    await execute(
      'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES ($1, $2, $3, $4)',
      ['idea_reply_create', 'idea_reply', result.lastInsertId, `Réponse à l'idée ${id}`]
    );

    const replyId = Number(result.lastInsertId);
    const reply = await queryOne<{ id: number; content: string; author_name: string; fingerprint: string | null; created_at: string }>(
      `SELECT id, content, author_name, fingerprint, created_at
       FROM idea_replies WHERE id = $1`,
      [result.lastInsertId]
    );
    if (!reply) {
      res.status(500).json({ error: 'Erreur serveur' });
      return;
    }

    res.status(201).json({ ...reply, mine: Boolean(fingerprint) && reply.fingerprint === fingerprint });
  } catch (err) {
    console.error('Post idea reply error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/replies/:replyId', async (req, res) => {
  try {
    const { replyId } = req.params;
    const { fingerprint } = req.body || {};

    const reply = await queryOne<{ id: number; fingerprint: string | null; idea_id: number }>(
      'SELECT id, fingerprint, idea_id FROM idea_replies WHERE id = $1',
      [req.params.replyId]
    );
    if (!reply) {
      res.status(404).json({ error: 'Réponse introuvable' });
      return;
    }

    const isDelegate = req.session?.authenticated === true;
    const sender = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 64) : '';

    if (!isDelegate && (!sender || reply.fingerprint !== sender)) {
      res.status(403).json({ error: 'Seul l\'auteur ou le délégué peut supprimer cette réponse' });
      return;
    }

    await execute('DELETE FROM idea_replies WHERE id = $1', [replyId]);

    await execute(
      'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES ($1, $2, $3, $4)',
      ['idea_reply_delete', 'idea_reply', replyId, `Suppression réponse idée ${reply.idea_id}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete idea reply error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { content, author_name, fingerprint, anonymous } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Contenu requis' });
      return;
    }

    const author = anonymous ? null : cleanFirstName(author_name);
    if (!anonymous && !isValidFirstName(author!)) {
      res.status(400).json({ error: 'Un prénom est requis pour une idée signée' });
      return;
    }
    if (anonymous && fingerprint) {
      res.status(400).json({ error: 'Une idée anonyme ne doit pas avoir de fingerprint' });
      return;
    }
    if (!anonymous && (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length < 8)) {
      res.status(401).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const sender = !anonymous && fingerprint ? fingerprint.trim().slice(0, 64) : null;
    const isAnon = anonymous ? 1 : 0;

    const result = await execute(
      `INSERT INTO ideas (content, author_name, anonymous, fingerprint, status, created_at)
       VALUES ($1, $2, $3, $4, 'a_etudier', CURRENT_TIMESTAMP) RETURNING id`,
      [cleanText(content, 2000), author, isAnon, sender]
    );

    const ideaId = Number(result.lastInsertId);
    const idea = await queryOne<{ id: number; content: string; author_name: string | null; anonymous: number; fingerprint: string | null; status: string; created_at: string }>('SELECT * FROM ideas WHERE id = $1', [result.lastInsertId]);

    await execute(
      'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES ($1, $2, $3, $4)',
      ['idea_create', 'idea', result.lastInsertId, `Idée créée ${isAnon ? 'anonymement' : 'par ' + author}`]
    );

    res.status(201).json(idea);
  } catch (err) {
    console.error('Create idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne<{ id: number; content: string; author_name: string | null; anonymous: number; fingerprint: string | null; status: string; created_at: string }>('SELECT * FROM ideas WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    const { status } = req.body;
    if (!IDEA_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    await execute(
      `UPDATE ideas SET status = $1, delegate_response = $2, delegate_replied_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [status, req.body.delegate_response ?? null, req.body.delegate_response ? 'NOW()' : null, id]
    );

    if (status === 'transmise' || status === 'realisee') {
      await execute(
        'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES ($1, $2, $3, $4)',
        ['idea_status_change', 'idea', id, `Statut passé à ${status}`]
      );
    }

    const updated = await queryOne('SELECT * FROM ideas WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Update idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne<{ id: number; status: string }>('SELECT * FROM ideas WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    await execute('DELETE FROM ideas WHERE id = $1', [id]);

    await execute(
      'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES ($1, $2, $3, $4)',
      ['idea_delete', 'idea', id, `Idée supprimée (était ${existing.status})`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;