import { Router } from 'express';
import db, { dbPath, isPersistentStorage } from '../db/index.js';
import { listBackups } from '../db/backup.js';
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

/**
 * Export complet de la base au format JSON.
 *
 * Tant qu'aucun disque persistant n'est attaché, le stockage de Render est
 * éphémère : c'est le seul moyen de conserver les données hors du serveur et
 * de les réinjecter après un redéploiement.
 */
router.get('/export', (req, res) => {
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];

    const data: Record<string, any[]> = {};
    for (const { name } of tables) {
      data[name] = db.prepare(`SELECT * FROM "${name}"`).all();
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="seconde-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json({
      version: 1,
      exported_at: new Date().toISOString(),
      persistent_storage: isPersistentStorage,
      tables: data,
    });
  } catch (err) {
    console.error('Export database error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Restauration d'un export JSON. Les tables sont remplacées dans une
 * transaction : soit tout est restauré, soit rien ne change.
 */
router.post('/import', (req, res) => {
  try {
    const payload = req.body?.tables;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Fichier de sauvegarde invalide' });
      return;
    }

    const known = new Set(
      (db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]).map((t) => t.name)
    );

    const restore = db.transaction(() => {
      for (const name of known) {
        db.prepare(`DELETE FROM "${name}"`).run();
      }
      for (const [name, rows] of Object.entries(payload as Record<string, any[]>)) {
        if (!known.has(name) || !Array.isArray(rows) || rows.length === 0) continue;
        const columns = (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map((c) => c.name);
        for (const row of rows) {
          const keys = Object.keys(row).filter((key) => columns.includes(key));
          if (keys.length === 0) continue;
          const placeholders = keys.map(() => '?').join(',');
          db.prepare(
            `INSERT OR REPLACE INTO "${name}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${placeholders})`
          ).run(...keys.map((k) => row[k] as any));
        }
      }
    });

    // Le pragma doit être changé hors transaction : SQLite l'ignore une fois
    // la transaction ouverte, et les DELETE dans l'ordre des tables échoueraient
    // alors sur les clés étrangères.
    db.pragma('foreign_keys = OFF');
    try {
      restore();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    db.prepare('INSERT INTO admin_log (action, target_type, detail) VALUES (?, ?, ?)').run(
      'import',
      'database',
      'Restauration depuis un export JSON'
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Import database error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** État du stockage et sauvegardes disponibles. */
router.get('/storage', (req, res) => {
  try {
    res.json({
      persistent_storage: isPersistentStorage,
      db_path: dbPath,
      backups: listBackups(),
    });
  } catch (err) {
    console.error('Get storage error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
