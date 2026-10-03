import { Router } from 'express';
import { query, queryOne, execute } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/password.js';

const router = Router();

const SEASON_THEMES = ['aucun', 'halloween', 'noel'] as const;

function normalizeSeason(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const theme = String(value).toLowerCase().trim();
  return (SEASON_THEMES as readonly string[]).includes(theme) ? theme : null;
}

router.get('/', async (req, res) => {
  try {
    const settings = await queryOne(
      'SELECT class_name, delegate_name, accent_color, home_info, home_image, season_theme FROM settings WHERE id = 1'
    );
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

router.put('/', requireAuth, async (req, res) => {
  try {
    const { class_name, delegate_name, accent_color, home_info, home_image, season_theme } = req.body;
    const season = normalizeSeason(season_theme);
    if (season_theme !== undefined && season === null) {
      res.status(400).json({ error: 'Thème de saison invalide' });
      return;
    }
    const existing = await queryOne(
      'SELECT class_name, delegate_name, accent_color, home_info, home_image FROM settings WHERE id = 1'
    ) as { home_image: string | null } | undefined;
    await execute(
      `UPDATE settings SET
        class_name = COALESCE($1, class_name),
        delegate_name = COALESCE($2, delegate_name),
        accent_color = COALESCE($3, accent_color),
        home_info = COALESCE($4, home_info),
        season_theme = COALESCE($5, season_theme),
        home_image = $6,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        class_name?.trim() ?? null,
        delegate_name?.trim() ?? null,
        accent_color?.trim() ?? null,
        home_info?.trim() ?? null,
        season,
        home_image !== undefined ? home_image : (existing?.home_image ?? null)
      ]
    );

    const updated = await queryOne(
      'SELECT class_name, delegate_name, accent_color, home_info, home_image, season_theme FROM settings WHERE id = 1'
    );
    res.json(updated);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/regenerate-token', requireAuth, async (req, res) => {
  try {
    const newToken = generateToken();
    await execute(
      'UPDATE settings SET delegate_link_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [newToken]
    );
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

    const settings = await queryOne(
      'SELECT password_hash FROM settings WHERE id = 1'
    ) as { password_hash: string } | undefined;

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
    await execute(
      'UPDATE settings SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [newHash]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;