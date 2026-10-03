import { Router } from 'express';
import { query, execute, queryOne, transaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { cleanText } from '../lib/files.js';

interface PollRow {
  id: number;
  question: string;
  allow_multiple: number;
  show_results: number;
  anonymous: number;
  active: number;
  closed_at: string | null;
  created_at: string;
}

interface PollOptionRow {
  id: number;
  poll_id: number;
  text: string;
  position: number | null;
}

interface PollVoteRow {
  id: number;
  poll_id: number;
  option_id: number;
  voter_fingerprint: string;
  created_at: string;
}

interface PollTotalsRow {
  poll_id: number;
  votes: number;
  voters: number;
}

interface PollVoteCheckRow {
  poll_id: number;
}

interface PollOptionVoteRow {
  count: number;
}

const router = Router();

function toFlag(value: unknown, defaultValue: 0 | 1): 0 | 1 {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const text = String(value).toLowerCase();
  if (text === 'false' || text === '0' || text === 'non' || text === 'off') return 0;
  return 1;
}

router.get('/', async (req, res) => {
  try {
    const fingerprint = (req.query.fingerprint as string) || '';

    const polls = await query<PollRow>('SELECT * FROM polls WHERE active = 1 ORDER BY created_at DESC');

    if (polls.length === 0) {
      res.json([]);
      return;
    }

    const ids = polls.map((p) => p.id);

    interface PollOptionWithCount extends PollOptionRow {
      vote_count: number;
    }
    const allOptions = await query<PollOptionWithCount>(
      `SELECT o.*,
              (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS vote_count
         FROM poll_options o
        WHERE o.poll_id = ANY($1)
        ORDER BY COALESCE(o.position, o.id), o.id`,
      [ids]
    );

    const optionsByPoll = new Map<number, PollOptionWithCount[]>();
    for (const opt of allOptions) {
      const list = optionsByPoll.get(opt.poll_id) || [];
      list.push(opt);
      optionsByPoll.set(opt.poll_id, list);
    }

    const totals = await query<PollTotalsRow>(
      `SELECT poll_id, COUNT(*) AS votes, COUNT(DISTINCT voter_fingerprint) AS voters
         FROM poll_votes
        WHERE poll_id = ANY($1)
        GROUP BY poll_id`,
      [ids]
    );

    const totalsByPoll = new Map<number, { votes: number; voters: number }>();
    for (const row of totals) totalsByPoll.set(row.poll_id, { votes: Number(row.votes), voters: Number(row.voters) });

    let votedIds = new Set<number>();
    if (fingerprint) {
      const voted = await query<PollVoteCheckRow>(
        `SELECT DISTINCT poll_id FROM poll_votes
           WHERE voter_fingerprint = $1 AND poll_id = ANY($2)`,
        [fingerprint, ids]
      );
      votedIds = new Set(voted.map((row) => row.poll_id));
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

router.get('/single/:id', async (req, res) => {
  try {
    const fingerprint = (req.query.fingerprint as string) || '';
    const poll = await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [req.params.id]);
    if (!poll) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    const options = await query<PollOptionRow>('SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY COALESCE(position, id)', [poll.id]);
    const totals = await queryOne<{ votes: number; voters: number }>(
      `SELECT COUNT(*) AS votes, COUNT(DISTINCT voter_fingerprint) AS voters
         FROM poll_votes WHERE poll_id = $1`,
      [poll.id]
    );
    const voted = fingerprint
      ? await queryOne<{ exists: number }>('SELECT 1 AS exists FROM poll_votes WHERE poll_id = $1 AND voter_fingerprint = $2', [poll.id, fingerprint])
      : null;

    res.json({ ...poll, options, total_votes: totals?.votes ?? 0, total_voters: totals?.voters ?? 0, has_voted: !!voted });
  } catch (err) {
    console.error('Get single poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { question, options, allow_multiple, show_results, anonymous } = req.body;
    if (!question || typeof question !== 'string' || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: 'Question et au moins 2 options requises' });
      return;
    }

    const result = await transaction(async (client) => {
      const pollResult = await client.query(
        `INSERT INTO polls (question, allow_multiple, show_results, anonymous)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [question.trim(), toFlag(allow_multiple, 0), toFlag(show_results, 1), toFlag(anonymous, 1)]
      );

      const pollId = Number(pollResult.rows[0].id);
      for (let i = 0; i < options.length; i++) {
        if (typeof options[i] === 'string' && options[i].trim()) {
          await client.query(
            'INSERT INTO poll_options (poll_id, text, position) VALUES ($1, $2, $3)',
            [pollId, options[i].trim(), i]
          );
        }
      }
      return pollId;
    });

    const pollId = Number(result);
    const poll = await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [pollId]);
    const pollOptions = await query<PollOptionRow>('SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY COALESCE(position, id)', [pollId]);

    sendPushToAll({
      title: '🗳️ Nouveau sondage',
      body: poll?.question || '',
      url: '/sondages',
    });

    res.status(201).json({ ...poll, options: pollOptions });
  } catch (err) {
    console.error('Create poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/vote', async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const { option_ids, fingerprint } = req.body;

    if (!Array.isArray(option_ids) || option_ids.length === 0) {
      res.status(400).json({ error: 'Au moins une option requise' });
      return;
    }
    if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length < 8) {
      res.status(401).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const poll = await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [pollId]);
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
      const existing = await queryOne<{ exists: number }>(
        'SELECT 1 AS exists FROM poll_votes WHERE poll_id = $1 AND voter_fingerprint = $2',
        [pollId, fingerprint]
      );
      if (existing) {
        res.status(400).json({ error: 'Vous avez déjà voté' });
        return;
      }
    }

    const validOptions = await query<{ id: number }>('SELECT id FROM poll_options WHERE poll_id = $1', [pollId]);
    const validIds = new Set(validOptions.map((o) => o.id));
    for (const oid of option_ids) {
      if (!validIds.has(oid)) {
        res.status(400).json({ error: 'Option invalide' });
        return;
      }
    }

    await transaction(async (client) => {
      for (const oid of option_ids) {
        const opt = await client.query('SELECT id FROM poll_options WHERE id = $1 AND poll_id = $2', [oid, pollId]);
        if (opt.rows.length === 0) {
          throw new Error('Option invalide');
        }
        await client.query(
          'INSERT INTO poll_votes (poll_id, option_id, voter_fingerprint) VALUES ($1, $2, $3)',
          [pollId, oid, fingerprint]
        );
      }
    });

    const updated = await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [pollId]);
    res.json(updated);
  } catch (err) {
    console.error('Vote poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const existing = await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (!existing) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    const { question, options, allow_multiple, show_results, active } = req.body;
    const nextQuestion = question !== undefined ? cleanText(question, 200) : '';
    if (question !== undefined && nextQuestion.length < 3) {
      res.status(400).json({ error: 'Question trop courte (3 caractères minimum)' });
      return;
    }

    let optionError = '';
    await transaction(async (client) => {
      if (Array.isArray(req.body.options)) {
        interface CurrentOption {
          id: number;
          text: string;
        }
        const current = await client.query<CurrentOption>(
          'SELECT id, text FROM poll_options WHERE poll_id = $1 ORDER BY COALESCE(position, id), id',
          [pollId]
        );
        const incoming = (req.body.options as any[])
          .map((o: any, index: number) => ({ id: Number((o as any)?.id) || 0, text: cleanText(String((o as any)?.text ?? ''), 80), position: index }))
          .filter((o) => o.text.length > 0);
        if (incoming.length < 2) {
          throw new Error('Au moins 2 options sont nécessaires');
        }

        for (const opt of incoming) {
          if (opt.id && current.rows.some((c) => c.id === opt.id)) {
            await client.query(
              'UPDATE poll_options SET text = $1, position = $2 WHERE id = $3 AND poll_id = $4',
              [opt.text, opt.position, opt.id, pollId]
            );
          } else if (!opt.id) {
            await client.query(
              'INSERT INTO poll_options (poll_id, text, position) VALUES ($1, $2, $3)',
              [pollId, opt.text, opt.position]
            );
          }
        }

        const keptIds = incoming.filter((o) => o.id).map((o) => o.id);
        for (const opt of current.rows) {
          if (keptIds.includes(opt.id)) continue;
          const votes = (await client.query('SELECT COUNT(*) AS count FROM poll_votes WHERE option_id = $1', [opt.id])).rows[0].count;
          if (votes > 0) {
            throw new Error(`L'option « ${opt.text} » a déjà reçu des votes : elle ne peut pas être supprimée. Renomme-la si besoin.`);
          } else {
            await client.query('DELETE FROM poll_options WHERE id = $1 AND poll_id = $2', [opt.id, pollId]);
          }
        }
      }

      const activeVal = req.body.active !== undefined ? (req.body.active ? 1 : 0) : null;
      const allowMultipleVal = req.body.allow_multiple !== undefined ? toFlag(req.body.allow_multiple, 0) : null;
      const showResultsVal = req.body.show_results !== undefined ? toFlag(req.body.show_results, 0) : null;
      const anonymousVal = req.body.anonymous !== undefined ? toFlag(req.body.anonymous, 0) : null;
      const closedAtVal = req.body.active !== undefined && !req.body.active ? 1 : req.body.active !== undefined && req.body.active ? 0 : null;

      await client.query(
        `UPDATE polls SET
           question = COALESCE($1, question),
           active = COALESCE($2, active),
           allow_multiple = COALESCE($3, allow_multiple),
           show_results = COALESCE($4, show_results),
           anonymous = COALESCE($5, anonymous),
           closed_at = CASE WHEN $6 = 1 AND active = 1 THEN CURRENT_TIMESTAMP
                            WHEN $6 = 0 THEN NULL ELSE closed_at END
         WHERE id = $6`,
        [nextQuestion || null, activeVal, allowMultipleVal, showResultsVal, anonymousVal, closedAtVal, pollId]
      );
    });
    res.json(await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [pollId]));
  } catch (err: any) {
    if (err.message && err.message.includes('option')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Update poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const existing = await queryOne<PollRow>('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (!existing) {
      res.status(404).json({ error: 'Sondage introuvable' });
      return;
    }

    await transaction(async (client) => {
      await client.query('DELETE FROM poll_votes WHERE poll_id = $1', [pollId]);
      await client.query('DELETE FROM poll_options WHERE poll_id = $1', [pollId]);
      await client.query('DELETE FROM polls WHERE id = $1', [pollId]);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete poll error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;