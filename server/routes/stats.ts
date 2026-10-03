import { Router } from 'express';
import { query, execute } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import {
  hacherEmpreinte,
  purgerVisitesAnciennesAsync,
  MAX_HITS_PER_DAY,
  VISIT_RETENTION_DAYS,
} from '../lib/visits.js';

const router = Router();

router.post('/visit', async (req, res) => {
  try {
    const fingerprint = cleanText(req.body?.fingerprint, 64);
    if (fingerprint.length < 8) {
      res.status(400).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const empreinte = hacherEmpreinte(fingerprint);
    const page = cleanText(req.body?.page, 60) || null;
    const jour = new Date().toISOString().slice(0, 10);

    await execute(
      `INSERT INTO visits (fingerprint, day, page)
       VALUES ($1, $2, $3)
       ON CONFLICT(fingerprint, day) DO UPDATE SET
         hits = LEAST(hits + 1, $4),
         last_seen_at = CURRENT_TIMESTAMP,
         page = COALESCE(excluded.page, page)`,
      [empreinte, jour, page, MAX_HITS_PER_DAY]
    );

    const purges = await purgerVisitesAnciennesAsync();
    if (purges > 0) {
      console.log(`Visites : ${purges} ligne(s) de plus de ${VISIT_RETENTION_DAYS} jours supprimée(s)`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Record visit error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/visits', requireAuth, async (req, res) => {
  try {
    const jours = Number(req.query.days);
    const limite = Number.isFinite(jours) ? Math.min(Math.max(Math.trunc(jours), 1), VISIT_RETENTION_DAYS) : 14;

    const days = await query(
      `SELECT day,
              COUNT(*) AS visitors,
              SUM(hits) AS hits
       FROM visits
      WHERE day >= (SELECT MAX(day) FROM visits) - INTERVAL '$1 days'
      GROUP BY day
      ORDER BY day DESC`,
      [limite]
    );

    const identites = await query(
      `SELECT fingerprint, day, hits, page
       FROM visits
      WHERE day = (SELECT MAX(day) FROM visits)
      ORDER BY hits DESC`,
    );

    const identitesSanitized = identites.map((row: any) => ({
      ...row,
      fingerprint: row.fingerprint.slice(0, 6).toUpperCase(),
    }));

    res.json({ days, identites: identitesSanitized });
  } catch (err) {
    console.error('Get visits error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', requireAuth, async (_req, res) => {
  try {
    const resStats = await query(
      `SELECT
         (SELECT COUNT(*) FROM students) AS total_students,
         (SELECT COUNT(*) FROM students WHERE birthday IS NOT NULL) AS students_with_birthday,
         (SELECT COUNT(*) FROM student_groups WHERE status = 'valide') AS validated_groups,
         (SELECT COUNT(*) FROM student_groups WHERE status = 'en_attente') AS pending_groups,
         (SELECT COUNT(*) FROM ideas) AS total_ideas,
         (SELECT COUNT(*) FROM ideas WHERE anonymous = 1) AS anonymous_ideas,
         (SELECT COUNT(*) FROM announcements) AS total_announcements,
         (SELECT COUNT(*) FROM polls WHERE active = 1) AS active_polls,
         (SELECT COUNT(*) FROM events) AS total_events,
         (SELECT COUNT(*) FROM resources) AS total_resources,
         (SELECT COUNT(*) FROM projects) AS total_projects,
         (SELECT COUNT(*) FROM revision_sessions) AS total_revisions,
         (SELECT COUNT(*) FROM sheets WHERE status = 'active') AS active_sheets`
    );
    res.json(resStats[0]);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;