import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { cleanText } from '../lib/files.js';

const router = Router();

/**
 * Le client envoie 0/1, mais un appel direct peut envoyer false, '0' ou null.
 * `value !== false` traitait 0 comme vrai : les résultats restaient toujours
 * visibles. On normalise donc explicitement.
 */
function toFlag(value: unknown, defaultValue: 0 | 1): 0 | 1 {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const text = String(value).toLowerCase();
  if (text === 'false' || text === '0' || text === 'non' || text === 'off') return 0;
  return 1;
}

router.get('/', (req, res) => {
  try {
    // Le fingerprint permet de savoir si l'élève a déjà voté : sans cela,
    // l'interface affichait un sondage comme votable alors que le serveur
    // refuse ensuite le vote (« Vous avez déjà voté ») et rien ne se passait.
    const fingerprint = (req.query.fingerprint as string) || '';

    const polls = db
      .prepare('SELECT * FROM polls WHERE active = 1 ORDER BY created_at DESC')
      .all() as any[];

    if (polls.length === 0) {
      res.json([]);
      return;
    }

    // Tous les comptages en 3 requêtes au lieu d'une par option (N+1) : la page
    // de l'élève affiche le nombre de vraies réponses et de vrais votants.
    const ids = polls.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(',');

    const optionsByPoll = new Map<number, any[]>();
    const allOptions = db
      .prepare(
        `SELECT o.*,
                (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS vote_count
           FROM poll_options o
          WHERE o.poll_id IN (${placeholders})
          ORDER BY COALESCE(o.position, o.id), o.id`
      )
      .all(...ids) as any[];
    for (const opt of allOptions) {
      const list = optionsByPoll.get(opt.poll_id) || [];
      list.push(opt);
      optionsByPoll.set(opt.poll_id, list);
    }

    const totalsByPoll = new Map<number, { votes: number; voters: number }>();
    const totals = db
      .prepare(
        `SELECT poll_id, COUNT(*) AS votes, COUNT(DISTINCT voter_fingerprint) AS voters
           FROM poll_votes
          WHERE poll_id IN (${placeholders})
          GROUP BY poll_id`
      )
      .all(...ids) as any[];
    for (const row of totals) totalsByPoll.set(row.poll_id, { votes: row.votes, voters: row.voters });

    const votedIds = new Set<number>();
    if (fingerprint) {
      const voted = db
        .prepare(
          `SELECT DISTINCT poll_id FROM poll_votes
            WHERE voter_fingerprint = ? AND poll_id IN (${placeholders})`
        )
        .all(fingerprint, ...ids) as any[];
      for (const row of voted) votedIds.add(row.poll_id);
    }

    const result = polls.map((poll) => {
      const totals = totalsByPoll.get(poll.id) || { votes: 0, voters: 0 };
      return {
        ...poll,
        options: optionsByPoll.get(poll.id) || [],
        total_votes: totals.votes,
        total_voters: totals.voters,
        has_voted: votedIds.has(poll.id),
      };
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
          toFlag(allow_multiple, 0),
          toFlag(show_results, 1),
          toFlag(anonymous, 1)
        );

      const pollId = Number(pollResult.lastInsertRowid);
      const insertOption = db.prepare(
        'INSERT INTO poll_options (poll_id, text, position) VALUES (?, ?, ?)'
      );
      let position = 0;
      for (const opt of options) {
        if (typeof opt === 'string' && opt.trim()) {
          insertOption.run(pollId, opt.trim(), position++);
        }
      }

      return pollId;
    });

    const pollId = createPoll();
    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId) as any;
    const pollOptions = db.prepare('SELECT * FROM poll_options WHERE poll_id = ?').all(pollId);

    sendPushToAll({
      title: '🗳️ Nouveau sondage',
      body: poll.question,
      url: '/sondages',
    });

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
    const existing = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    const { active, allow_multiple, show_results, anonymous, question, options } = req.body;

    // Édition du texte : l'API le proposait déjà mais l'interface n'y donnait
    // pas accès, donc une faute de frappe imposait de supprimer le sondage —
    // et donc de perdre tous les votes déjà enregistrés.
    const nextQuestion = question !== undefined ? cleanText(question, 200) : '';
    if (question !== undefined && nextQuestion.length < 3) {
      res.status(400).json({ error: 'Question trop courte (3 caractères minimum)' });
      return;
    }

    let optionError = '';
    const editOptions = db.transaction(() => {
      if (Array.isArray(options)) {
        const current = db.prepare('SELECT id, text FROM poll_options WHERE poll_id = ? ORDER BY COALESCE(position, id), id').all(id) as any[];
        const incoming = options
          .map((o: unknown, index: number) => ({ id: Number((o as any)?.id) || 0, text: cleanText(String((o as any)?.text ?? ''), 80), position: index }))
          .filter((o) => o.text.length > 0);
        if (incoming.length < 2) {
          optionError = 'Au moins 2 options sont nécessaires';
          return;
        }

        for (const opt of incoming) {
          if (opt.id && current.some((c) => c.id === opt.id)) {
            db.prepare('UPDATE poll_options SET text = ?, position = ? WHERE id = ? AND poll_id = ?').run(
              opt.text,
              opt.position,
              opt.id,
              id
            );
          } else if (!opt.id) {
            db.prepare('INSERT INTO poll_options (poll_id, text, position) VALUES (?, ?, ?)').run(
              id,
              opt.text,
              opt.position
            );
          }
        }

        // Suppression : uniquement des options sans vote, pour ne jamais
        // effacer les réponses d'un élève sans qu'il le sache.
        const keptIds = incoming.filter((o) => o.id).map((o) => o.id);
        for (const opt of current) {
          if (keptIds.includes(opt.id)) continue;
          const votes = (db.prepare('SELECT COUNT(*) AS count FROM poll_votes WHERE option_id = ?').get(opt.id) as any).count;
          if (votes > 0) {
            optionError = `L'option « ${opt.text} » a déjà reçu des votes : elle ne peut pas être supprimée. Renomme-la si besoin.`;
          } else {
            db.prepare('DELETE FROM poll_options WHERE id = ? AND poll_id = ?').run(opt.id, id);
          }
        }
      }

      db.prepare(
        `UPDATE polls SET
          question = COALESCE(?, question),
          active = COALESCE(?, active),
          allow_multiple = COALESCE(?, allow_multiple),
          show_results = COALESCE(?, show_results),
          anonymous = COALESCE(?, anonymous),
          closed_at = CASE WHEN ? = 1 AND active = 1 THEN CURRENT_TIMESTAMP
                           WHEN ? = 0 THEN NULL ELSE closed_at END
         WHERE id = ?`
      ).run(
        nextQuestion || null,
        active !== undefined ? (active ? 1 : 0) : null,
        allow_multiple !== undefined ? toFlag(allow_multiple, 0) : null,
        show_results !== undefined ? toFlag(show_results, 0) : null,
        anonymous !== undefined ? toFlag(anonymous, 0) : null,
        active !== undefined && !active ? 1 : 0,
        active !== undefined && active ? 1 : 0,
        id
      );
    });

    editOptions();
    if (optionError) {
      res.status(400).json({ error: optionError });
      return;
    }

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
