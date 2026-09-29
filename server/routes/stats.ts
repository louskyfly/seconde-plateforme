import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';

const router = Router();

/**
 * Enregistre une visite.
 *
 * Route publique : c'est le premier appel que fait l'application, avant toute
 * authentification. On se contente de l'empreinte appareil, sans IP ni donnée
 * personnelle. Recharger la page incrémente `hits` mais ne crée pas de nouvelle
 * ligne, pour que le compteur d'élèves reste juste.
 */
router.post('/visit', (req, res) => {
  try {
    const fingerprint = cleanText(req.body?.fingerprint, 64);
    if (fingerprint.length < 8) {
      res.status(400).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const page = cleanText(req.body?.page, 60) || null;
    const jour = new Date().toISOString().slice(0, 10);
    const ua = cleanText(req.headers['user-agent'] ?? '', 200) || null;

    db.prepare(
      `INSERT INTO visits (fingerprint, day, page, user_agent)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(fingerprint, day) DO UPDATE SET
         hits = hits + 1,
         last_seen_at = CURRENT_TIMESTAMP,
         page = COALESCE(excluded.page, page)`
    ).run(fingerprint, jour, page, ua);

    res.json({ success: true });
  } catch (err) {
    console.error('Record visit error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Statistiques de visites, réservées au délégué.
 *
 * `days` renvoie, jour par jour, le nombre d'élèves distincts et le total
 * d'ouvertures. `identites` donne, pour aujourd'hui, qui est venu et à quelle
 * heure — c'est la partie « identité » demandée. L'empreinte n'est jamais
 * exposée telle quelle : seul un libellé court et stable est renvoyé.
 */
router.get('/visits', requireAuth, (req, res) => {
  try {
    const jours = Number(req.query.days);
    const limite = Number.isFinite(jours) ? Math.min(Math.max(Math.trunc(jours), 1), 90) : 14;

    const days = db
      .prepare(
        `SELECT day,
                COUNT(*) AS visitors,
                SUM(hits) AS hits
         FROM visits
         WHERE day >= date('now', ?)
         GROUP BY day
         ORDER BY day DESC`
      )
      .all(`-${limite} days`) as { day: string; visitors: number; hits: number }[];

    const today = new Date().toISOString().slice(0, 10);
    const identites = db
      .prepare(
        `SELECT fingerprint, first_seen_at, last_seen_at, hits, page
         FROM visits
         WHERE day = ?
         ORDER BY last_seen_at DESC`
      )
      .all(today) as any[];

    res.json({
      days,
      identites: identites.map((row) => ({
        // Identifiant court et anonyme : les 6 premiers caractères suffisent à
        // distinguer deux visiteurs d'un jour à l'autre sans exposer l'empreinte.
        label: `Appareil ${String(row.fingerprint).slice(0, 6)}`,
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at,
        hits: row.hits,
        page: row.page,
      })),
    });
  } catch (err) {
    console.error('Get visits error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', requireAuth, (req, res) => {
  try {
    const newMessages = db
      .prepare("SELECT COUNT(*) AS count FROM messages WHERE status = 'nouveau'")
      .get() as { count: number };

    const newIdeas = db
      .prepare("SELECT COUNT(*) AS count FROM ideas WHERE status = 'a_etudier'")
      .get() as { count: number };

    const activePolls = db
      .prepare('SELECT COUNT(*) AS count FROM polls WHERE active = 1')
      .get() as { count: number };

    const announcementsCount = db
      .prepare('SELECT COUNT(*) AS count FROM announcements')
      .get() as { count: number };

    const upcomingEvents = db
      .prepare("SELECT COUNT(*) AS count FROM events WHERE date >= date('now')")
      .get() as { count: number };

    res.json({
      newMessages: newMessages.count,
      newIdeas: newIdeas.count,
      activePolls: activePolls.count,
      announcementsCount: announcementsCount.count,
      upcomingEvents: upcomingEvents.count,
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
