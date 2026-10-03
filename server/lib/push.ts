import webpush from 'web-push';
import { query, execute } from '../db/index.js';
import { VAPID_CONFIG } from '../config/vapid.js';

webpush.setVapidDetails(
  VAPID_CONFIG.subject,
  VAPID_CONFIG.publicKey,
  VAPID_CONFIG.privateKey
);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Remplace la notification précédente (empêche l'empilement) */
  tag?: string;
}

export function getVapidPublicKey(): string {
  return VAPID_CONFIG.publicKey;
}

export async function saveSubscription(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<boolean> {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return false;
  }
  await execute(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
     VALUES ($1, $2, $3)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
  return true;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await execute('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const subscriptions = await query<{ endpoint: string; p256dh: string; auth: string }>(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions'
  );
  if (subscriptions.length === 0) return;

  const serialized = JSON.stringify(payload);
  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    webpush
      .sendNotification(pushSubscription, serialized)
      .catch((err: any) => {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          removeSubscription(sub.endpoint);
        } else {
          console.error('Push send error:', err?.message || err);
        }
      });
  }
}