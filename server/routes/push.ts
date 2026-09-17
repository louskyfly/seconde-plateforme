import { Router } from 'express';
import { getVapidPublicKey, saveSubscription, removeSubscription } from '../lib/push.js';

const router = Router();

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/subscribe', (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    res.status(400).json({ error: 'Abonnement invalide' });
    return;
  }
  if (!saveSubscription(subscription)) {
    res.status(400).json({ error: 'Abonnement invalide' });
    return;
  }
  res.json({ success: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') {
    res.status(400).json({ error: 'Endpoint requis' });
    return;
  }
  removeSubscription(endpoint);
  res.json({ success: true });
});

export default router;