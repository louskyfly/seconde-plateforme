import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/** Pseudo + activité des participants du chat (jamais d'email ni d'identifiant scolaire). */
router.get('/users', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT u.id, u.display_name, u.kind, u.created_at, u.last_seen_at,
                (SELECT COUNT(*) FROM chat_messages m WHERE m.sender_id = u.id) AS message_count
         FROM chat_users u
         ORDER BY (u.kind = 'delegate') DESC, u.last_seen_at DESC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error('Get chat users error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/log', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = db
      .prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT ?')
      .all(limit);
    res.json(rows);
  } catch (err) {
    console.error('Get admin log error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Compteurs pour le tableau de bord. */
router.get('/overview', (req, res) => {
  try {
    const one = (sql: string, ...params: any[]) => (db.prepare(sql).get(...params) as { count: number }).count;
    res.json({
      sheets: one(`SELECT COUNT(*) AS count FROM sheets WHERE status = 'active'`),
      hiddenSheets: one(`SELECT COUNT(*) AS count FROM sheets WHERE status = 'hidden'`),
      chatMessages: one('SELECT COUNT(*) AS count FROM chat_messages'),
      chatUsers: one(`SELECT COUNT(*) AS count FROM chat_users WHERE kind = 'student'`),
      imagesPosted: one('SELECT COUNT(*) AS count FROM chat_messages WHERE image IS NOT NULL'),
    });
  } catch (err) {
    console.error('Get admin overview error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
