import { Router } from 'express';
import { pool, query, execute, queryOne } from '../db/index.js';
import { listBackups } from '../db/backup.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/users', async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.display_name, u.kind, u.created_at, u.last_seen_at,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.sender_id = u.id) AS message_count
       FROM chat_users u
       ORDER BY (u.kind = 'delegate') DESC, u.last_seen_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Get chat users error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/log', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await query('SELECT * FROM admin_log ORDER BY id DESC LIMIT $1', [limit]);
    res.json(rows);
  } catch (err) {
    console.error('Get admin log error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const sheets = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM sheets WHERE status = 'active'`);
    const hiddenSheets = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM sheets WHERE status = 'hidden'`);
    const chatMessages = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM chat_messages');
    const chatUsers = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM chat_users WHERE kind = 'student'`);
    const imagesPosted = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM chat_messages WHERE image IS NOT NULL');

    res.json({
      sheets: Number(sheets?.count ?? 0),
      hiddenSheets: Number(hiddenSheets?.count ?? 0),
      chatMessages: Number(chatMessages?.count ?? 0),
      chatUsers: Number(chatUsers?.count ?? 0),
      imagesPosted: Number(imagesPosted?.count ?? 0),
    });
  } catch (err) {
    console.error('Get admin overview error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const tablesResult = await pool.query<{ name: string }>(
      `SELECT tablename AS name
       FROM pg_catalog.pg_tables
       WHERE schemaname = current_schema()
       ORDER BY tablename`
    );

    const data: Record<string, any[]> = {};
    for (const { name } of tablesResult.rows) {
      const quotedName = `"${name.replace(/"/g, '""')}"`;
      const result = await pool.query(`SELECT * FROM ${quotedName}`);
      data[name] = result.rows;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="seconde-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(data);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/import', requireAuth, async (req, res) => {
  try {
    const data = req.body as Record<string, any[]>;
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Données invalides' });
      return;
    }

    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const cols = columns.join(', ');
      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        await execute(
          `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/storage', (req, res) => {
  try {
    const info = {
      persistent: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PGHOST ? true : false,
      message: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PGHOST
        ? 'Stockage persistant (PostgreSQL)'
        : 'Stockage éphémère (SQLite sur Render) — données perdues au redéploiement',
    };
    res.json(info);
  } catch (err) {
    console.error('Get storage info error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/backups', (req, res) => {
  try {
    const backups = listBackups();
    res.json({ backups });
  } catch (err) {
    console.error('List backups error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;