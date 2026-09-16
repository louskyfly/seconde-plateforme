import { Router } from 'express';
import db from '../db/index.js';
import { verifyPassword } from '../utils/password.js';
import { requireAuth, checkRateLimit, recordAttempt } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { password, token } = req.body;
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Mot de passe requis' });
      return;
    }

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, db)) {
      res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
      return;
    }

    const settings = db.prepare('SELECT password_hash, delegate_link_token FROM settings WHERE id = 1').get() as
      | { password_hash: string; delegate_link_token: string }
      | undefined;

    if (!settings) {
      recordAttempt(ip, db, false);
      res.status(500).json({ error: 'Erreur de configuration' });
      return;
    }

    if (token && token !== settings.delegate_link_token) {
      res.status(403).json({ error: 'Lien d\u0027accès invalide' });
      return;
    }

    const valid = await verifyPassword(password, settings.password_hash);
    if (!valid) {
      recordAttempt(ip, db, false);
      res.status(401).json({ error: 'Mot de passe incorrect' });
      return;
    }

    recordAttempt(ip, db, true);
    req.session.authenticated = true;
    req.session.userId = 1;
    res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/validate-token/:token', (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ valid: false });
      return;
    }
    const settings = db.prepare('SELECT delegate_link_token FROM settings WHERE id = 1').get() as
      | { delegate_link_token: string }
      | undefined;
    res.json({ valid: settings?.delegate_link_token === token });
  } catch (err) {
    console.error('Validate token error:', err);
    res.status(500).json({ valid: false });
  }
});

router.post('/logout', (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: 'Erreur lors de la déconnexion' });
        return;
      }
      res.json({ success: true });
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/check', (req, res) => {
  try {
    res.json({ authenticated: req.session?.authenticated === true });
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
