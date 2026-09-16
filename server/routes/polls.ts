import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const polls = db
      .prepare('SELECT * FROM polls WHERE active = 1 ORDER BY created_at DESC')
      .all() as any[];

    const result = polls.map((poll) => {
      const options = db
        .prepare('SELECT * FROM poll_options WHERE poll_id = ?')
        .all(poll.id) as any[];

      const optionsWithCounts = options.map((opt) => {
        const voteRow = db
          .prepare('SELECT COUNT(*) AS count FROM poll_votes WHERE option_id = ?')
          .get(opt.id) as { count: number };
        return { ...opt, vote_count: voteRow.count };
      });

      return { ...poll, options: optionsWithCounts };
    });

    res.json(result);
  } catch (err) {
    console.error('Get polls error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/single/:id', (req, res) => {
  try {
    const { id } = req.params;
    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
    if (!poll) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    const options = db
      .prepare('SELECT * FROM poll_options WHERE poll_id = ?')
      .all(id) as any[];

    const optionsWithCounts = options.map((opt) => {
      const voteRow = db
        .prepare('SELECT COUNT(*) AS count FROM poll_votes WHERE option_id = ?')
        .get(opt.id) as { count: number };
      return { ...opt, vote_count: voteRow.count };
    });

    const fingerprint = req.query.fingerprint as string | undefined;
    let hasVoted = false;
    if (fingerprint) {
      const voteCheck = db
        .prepare('SELECT COUNT(*) AS count FROM poll_votes WHERE poll_id = ? AND voter_fingerprint = ?')
        .get(id, fingerprint) as { count: number };
      hasVoted = voteCheck.count > 0;
    }

    res.json({ ...poll, options: optionsWithCounts, has_voted: hasVoted });
  } catch (err) {
    console.error('Get single poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { question, options, allow_multiple, show_results, anonymous } = req.body;
    if (!question || typeof question !== 'string' || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: 'Question et au moins 2 options requises' });
      return;
    }

    const createPoll = db.transaction(() => {
      const pollResult = db
        .prepare(
          `INSERT INTO polls (question, allow_multiple, show_results, anonymous)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          question.trim(),
          allow_multiple ? 1 : 0,
          show_results !== false ? 1 : 0,
          anonymous !== false ? 1 : 0
        );

      const pollId = Number(pollResult.lastInsertRowid);
      const insertOption = db.prepare('INSERT INTO poll_options (poll_id, text) VALUES (?, ?)');
      for (const opt of options) {
        if (typeof opt === 'string' && opt.trim()) {
          insertOption.run(pollId, opt.trim());
        }
      }

      return pollId;
    });

    const pollId = createPoll();
    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId) as any;
    const pollOptions = db.prepare('SELECT * FROM poll_options WHERE poll_id = ?').all(pollId);

    res.status(201).json({ ...poll, options: pollOptions });
  } catch (err) {
    console.error('Create poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/vote', (req, res) => {
  try {
    const { id } = req.params;
    const { option_ids, fingerprint } = req.body;

    if (!Array.isArray(option_ids) || option_ids.length === 0) {
      res.status(400).json({ error: 'Au moins une option requise' });
      return;
    }

    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
    if (!poll) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    if (!poll.active) {
      res.status(400).json({ error: 'Ce sondage est fermé' });
      return;
    }

    if (!poll.allow_multiple && option_ids.length > 1) {
      res.status(400).json({ error: 'Ce sondage n\'autorise qu\'un seul choix' });
      return;
    }

    if (fingerprint) {
      const existing = db
        .prepare('SELECT COUNT(*) AS count FROM poll_votes WHERE poll_id = ? AND voter_fingerprint = ?')
        .get(id, fingerprint) as { count: number };
      if (existing.count > 0) {
        res.status(400).json({ error: 'Vous avez déjà voté' });
        return;
      }
    }

    const validOptions = db
      .prepare('SELECT id FROM poll_options WHERE poll_id = ?')
      .all(id) as { id: number }[];
    const validIds = new Set(validOptions.map((o) => o.id));
    for (const oid of option_ids) {
      if (!validIds.has(oid)) {
        res.status(400).json({ error: 'Option invalide' });
        return;
      }
    }

    const castVotes = db.transaction(() => {
      const insertVote = db.prepare(
        'INSERT INTO poll_votes (poll_id, option_id, voter_fingerprint) VALUES (?, ?, ?)'
      );
      for (const oid of option_ids) {
        insertVote.run(id, oid, fingerprint || null);
      }
    });

    castVotes();
    res.json({ success: true });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM polls WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    const { active, allow_multiple, show_results, anonymous } = req.body;
    db.prepare(
      `UPDATE polls SET
        active = COALESCE(?, active),
        allow_multiple = COALESCE(?, allow_multiple),
        show_results = COALESCE(?, show_results),
        anonymous = COALESCE(?, anonymous),
        closed_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE closed_at END
       WHERE id = ?`
    ).run(
      active !== undefined ? (active ? 1 : 0) : null,
      allow_multiple !== undefined ? (allow_multiple ? 1 : 0) : null,
      show_results !== undefined ? (show_results ? 1 : 0) : null,
      anonymous !== undefined ? (anonymous ? 1 : 0) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );

    const updated = db.prepare('SELECT * FROM polls WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Update poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM polls WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    const deletePoll = db.transaction(() => {
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ?').run(id);
      db.prepare('DELETE FROM poll_options WHERE poll_id = ?').run(id);
      db.prepare('DELETE FROM polls WHERE id = ?').run(id);
    });

    deletePoll();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
