import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import {
  hacherEmpreinte,
  purgerVisitesAnciennes,
  MAX_HITS_PER_DAY,
  VISIT_RETENTION_DAYS,
} from '../lib/visits.js';

const router = Router();

/**
 * Enregistre une visite.
 *
 * Route publique : c'est le premier appel que fait l'application, avant toute
 * authentification. L'empreinte n'est ni en clair ni reverse, et ni l'adresse IP
 * ni le user-agent ne sont conservés — l'IP serait une donnée personnelle et le
 * user-agent n'est jamais affiché. Recharger la page incrémente `hits` mais ne
 * crée pas de nouvelle ligne, pour que le compteur d'élèves reste juste.
 *
 * Limite honnête : sans authentification, cette route ne peut pas distinguer un
 * élève d'un appel automatique. Le nombre d'élèves distincts reste donc
 * indicatif : un seul appareil peut se faire passer pour plusieurs, et rien ici
 * ne l'en empêche. Seul le total d'ouvertures est plafonné.
 */
router.post('/visit', (req, res) => {
  try {
    const fingerprint = cleanText(req.body?.fingerprint, 64);
    if (fingerprint.length < 8) {
      res.status(400).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const empreinte = hacherEmpreinte(fingerprint);
    const page = cleanText(req.body?.page, 60) || null;
    const jour = new Date().toISOString().slice(0, 10);

    db.prepare(
      `INSERT INTO visits (fingerprint, day, page)
       VALUES (?, ?, ?)
       ON CONFLICT(fingerprint, day) DO UPDATE SET
         hits = MIN(hits + 1, ?),
         last_seen_at = CURRENT_TIMESTAMP,
         page = COALESCE(excluded.page, page)`
    ).run(empreinte, jour, page, MAX_HITS_PER_DAY);

    const purges = purgerVisitesAnciennes(db);
    if (purges > 0) {
      console.log(`Visites : ${purges} ligne(s) de plus de ${VISIT_RETENTION_DAYS} jours supprimée(s)`);
    }

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
 * heure — c'est la partie « identité » demandée. L'empreinte n'est ni renvoyée
 * ni stockée en clair : seul un libellé court et stable, tiré du condensat, est
 * renvoyé.
 */
router.get('/visits', requireAuth, (req, res) => {
  try {
    const jours = Number(req.query.days);
    const limite = Number.isFinite(jours) ? Math.min(Math.max(Math.trunc(jours), 1), VISIT_RETENTION_DAYS) : 14;

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
        // Libellé court tiré du condensat : assez pour distinguer deux visiteurs
        // d'un jour à l'autre, insuffisant pour relier l'un d'eux à un vote ou à
        // un message, puisque le condensat n'est pas stocké ailleurs.
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
