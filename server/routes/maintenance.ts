import { Router } from 'express';
import { query, execute, queryOne } from '../db/index.js';
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

router.get('/state', async (req, res) => {
  try {
    const state = await getMaintenanceState();
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

router.post('/activate', requireAuth, async (req, res) => {
  try {
    const { password, message } = req.body || {};

    const settings = await queryOne<{ password_hash: string }>('SELECT password_hash FROM settings WHERE id = 1');
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

    const state = await activateMaintenance('Délégué', cleanText(message, 300));
    res.json(state);
  } catch (err) {
    console.error('Activate maintenance error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/deactivate', requireAuth, async (req, res) => {
  try {
    const state = await deactivateMaintenance('Délégué');
    res.json(state);
  } catch (err) {
    console.error('Deactivate maintenance error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, active, message, activated_by, activated_at, deactivated_by, deactivated_at
       FROM maintenance_log ORDER BY id DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('Maintenance history error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;