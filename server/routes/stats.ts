import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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
