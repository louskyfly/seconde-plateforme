import webpush from 'web-push';
import db from '../db/index.js';
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
}

export function getVapidPublicKey(): string {
  return VAPID_CONFIG.publicKey;
}

export function saveSubscription(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): boolean {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return false;
  }
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
     VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
  return true;
}

export function removeSubscription(endpoint: string): void {
  if (!endpoint) return;
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function sendPushToAll(payload: PushPayload): void {
  const subscriptions = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all() as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
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