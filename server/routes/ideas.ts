import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import { cleanFirstName, isValidFirstName } from '../lib/name.js';

const router = Router();

/** Statuts acceptés, alignés sur IDEA_STATUSES côté client. */
const IDEA_STATUSES = ['a_etudier', 'en_discussion', 'transmise', 'realisee', 'non_retenue'];

router.get('/', (req, res) => {
  try {
    const ideas = db.prepare('SELECT * FROM ideas ORDER BY created_at DESC').all() as any[];
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

/**
 * Réponses des élèves sous une idée.
 *
 * Le fil est public : tout le monde voit les réponses, mais seul l'auteur peut
 * supprimer la sienne (via son fingerprint). Le délégué peut tout supprimer.
 */
router.get('/:id/replies', (req, res) => {
  try {
    const { id } = req.params;
    const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(id);
    if (!idea) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    const replies = db
      .prepare(
        `SELECT id, content, author_name, deleted_at, created_at
         FROM idea_replies WHERE idea_id = ? ORDER BY id ASC`
      )
      .all(id) as any[];

    res.json(
      replies.map((r) => ({
        ...r,
        author_name: r.deleted_at ? null : r.author_name,
        content: r.deleted_at ? 'Message supprimé' : r.content,
      }))
    );
  } catch (err) {
    console.error('Get idea replies error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/replies', (req, res) => {
  try {
    const { id } = req.params;
    const { content, author_name, fingerprint } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Réponse vide' });
      return;
    }

    const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(id);
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

    const result = db
      .prepare('INSERT INTO idea_replies (idea_id, content, author_name, fingerprint) VALUES (?, ?, ?, ?)')
      .run(id, cleanText(content, 1000), author, sender || null);

    // Notifie le délégué : une réponse est une nouvelle activité sur une idée.
    db.prepare('INSERT INTO admin_log (action, target_type, target_id, detail) VALUES (?, ?, ?, ?)').run(
      'reply',
      'idea',
      Number(id),
      `Réponse de ${author}`
    );

    const reply = db
      .prepare(
        'SELECT id, content, author_name, deleted_at, created_at FROM idea_replies WHERE id = ?'
      )
      .get(Number(result.lastInsertRowid));

    res.status(201).json(reply);
  } catch (err) {
    console.error('Create idea reply error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/replies/:replyId', (req, res) => {
  try {
    const { replyId } = req.params;
    const { fingerprint } = req.body || {};

    const reply = db.prepare('SELECT * FROM idea_replies WHERE id = ?').get(replyId) as any;
    if (!reply) {
      res.status(404).json({ error: 'Réponse introuvable' });
      return;
    }

    const sender = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 64) : '';
    if (!sender || reply.fingerprint !== sender) {
      res.status(403).json({ error: 'Tu ne peux supprimer que tes propres réponses' });
      return;
    }

    // Suppression logique : l'ordre du fil est conservé, comme dans le chat.
    db.prepare('UPDATE idea_replies SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(replyId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete idea reply error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', (req, res) => {
  try {
    const { title, description, category, anonymous, author_name } = req.body;
    if (!title || typeof title !== 'string' || !description || typeof description !== 'string') {
      res.status(400).json({ error: 'Titre et description requis' });
      return;
    }

    const isAnonymous = anonymous ? 1 : 0;

    // Une idée publiée sous un nom doit porter un prénom : le client peut
    // contourner l'interface, donc la règle est aussi vérifiée ici.
    const author = cleanFirstName(author_name);
    if (!isAnonymous && !isValidFirstName(author)) {
      res.status(400).json({ error: 'Un prénom est requis pour publier une idée signée' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO ideas (title, description, category, anonymous, author_name)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        description.trim(),
        (category || 'classe').trim(),
        isAnonymous,
        isAnonymous ? null : author
      );

    const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    const sanitized = {
      ...idea,
      author_name: idea.anonymous === 1 ? null : idea.author_name,
    };
    res.status(201).json(sanitized);
  } catch (err) {
    console.error('Create idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    const { status, delegate_response } = req.body;

    // Le statut est validé explicitement : une valeur hors liste était
    // acceptée et enregistrée telle quelle, ce qui rendait l'idée invisible
    // des filtres du client.
    let nextStatus: string | null = null;
    if (status !== undefined && status !== null && status !== '') {
      const candidate = cleanText(String(status), 30);
      if (!IDEA_STATUSES.includes(candidate)) {
        res.status(400).json({ error: 'Statut invalide' });
        return;
      }
      nextStatus = candidate;
    }

    const response = cleanText(delegate_response, 2000);

    db.prepare(
      `UPDATE ideas SET
        status = COALESCE(?, status),
        delegate_response = COALESCE(?, delegate_response),
        delegate_replied_at = CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE delegate_replied_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(nextStatus, response || null, response || null, id);

    const updated = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Idée introuvable' });
      return;
    }

    db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete idea error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
