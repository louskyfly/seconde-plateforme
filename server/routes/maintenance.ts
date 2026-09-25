import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  activateMaintenance,
  deactivateMaintenance,
  getMaintenanceState,
  DEFAULT_MAINTENANCE_MESSAGE,
} from '../lib/maintenance.js';
import { verifyPassword } from '../utils/password.js';
import { cleanText } from '../lib/files.js';

const router = Router();

/** État public : le client en a besoin pour afficher (ou non) la page de maintenance. */
router.get('/state', (req, res) => {
  try {
    const state = getMaintenanceState(db);
    res.json({
      active: state.active,
      message: state.active ? state.message : DEFAULT_MAINTENANCE_MESSAGE,
      is_admin: req.session?.authenticated === true,
    });
  } catch (err) {
    console.error('Get maintenance state error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Activation : mot de passe du délégué redemandé pour éviter un clic accidentel.
 */
router.post('/activate', requireAuth, async (req, res) => {
  try {
    const { password, message } = req.body || {};

    const settings = db.prepare('SELECT password_hash FROM settings WHERE id = 1').get() as
      | { password_hash: string }
      | undefined;
    if (!settings) {
      res.status(500).json({ error: 'Erreur de configuration' });
      return;
    }

    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Mot de passe requis pour confirmer' });
      return;
    }

    const valid = await verifyPassword(password, settings.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Mot de passe incorrect' });
      return;
    }

    const state = activateMaintenance(db, 'Délégué', cleanText(message, 300) || undefined);
    res.json(state);
  } catch (err) {
    console.error('Activate maintenance error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/deactivate', requireAuth, (req, res) => {
  try {
    const state = deactivateMaintenance(db, 'Délégué');
    res.json(state);
  } catch (err) {
    console.error('Deactivate maintenance error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Historique : qui a activé / désactivé, et quand. Réservé au délégué. */
router.get('/history', requireAuth, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, active, message, activated_by, activated_at, deactivated_by, deactivated_at
         FROM maintenance_log ORDER BY id DESC LIMIT 50`
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error('Maintenance history error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
