import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/password.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const settings = db
      .prepare('SELECT class_name, delegate_name, accent_color, home_info FROM settings WHERE id = 1')
      .get();
    if (!settings) {
      res.status(404).json({ error: 'Configuration introuvable' });
      return;
    }
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/', requireAuth, (req, res) => {
  try {
    const { class_name, delegate_name, accent_color, home_info } = req.body;
    db.prepare(
      `UPDATE settings SET
        class_name = COALESCE(?, class_name),
        delegate_name = COALESCE(?, delegate_name),
        accent_color = COALESCE(?, accent_color),
        home_info = COALESCE(?, home_info),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`
    ).run(
      class_name?.trim() ?? null,
      delegate_name?.trim() ?? null,
      accent_color?.trim() ?? null,
      home_info?.trim() ?? null
    );

    const updated = db
      .prepare('SELECT class_name, delegate_name, accent_color, home_info FROM settings WHERE id = 1')
      .get();
    res.json(updated);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/regenerate-token', requireAuth, (req, res) => {
  try {
    const newToken = generateToken();
    db.prepare(
      'UPDATE settings SET delegate_link_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
    ).run(newToken);
    res.json({ token: newToken });
  } catch (err) {
    console.error('Regenerate token error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password || typeof old_password !== 'string' || typeof new_password !== 'string') {
      res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
      return;
    }

    const settings = db
      .prepare('SELECT password_hash FROM settings WHERE id = 1')
      .get() as { password_hash: string } | undefined;

    if (!settings) {
      res.status(500).json({ error: 'Erreur de configuration' });
      return;
    }

    const valid = await verifyPassword(old_password, settings.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Ancien mot de passe incorrect' });
      return;
    }

    const newHash = await hashPassword(new_password);
    db.prepare(
      'UPDATE settings SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
    ).run(newHash);

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
