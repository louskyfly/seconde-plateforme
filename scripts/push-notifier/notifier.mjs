/**
 * Robot de notifications (tourne dans GitHub Actions, gratuit sur un dépôt public).
 *
 * Toutes les 30 s, il regarde dans Firebase s'il y a de nouvelles fiches, idées,
 * annonces, sondages, dates d'agenda, ressources, projets ou sessions de
 * révision, et envoie une vraie notification (Web Push) à chaque iPad abonné
 * (`pushSubs`, rempli par le site quand l'élève touche « Activer »).
 *
 * Les abonnements sont chiffrés par le site avec la clé publique VAPID : seul
 * ce robot, qui a la clé privée (secret GitHub VAPID_PRIVATE_KEY), peut les lire.
 */
import crypto from 'node:crypto';
import webpush from 'web-push';

const API_KEY = 'AIzaSyDQo9oaIHxOcvPsDxy_7Sx4wCPApvNRBcE';
const DB = 'https://sync-3626f-default-rtdb.europe-west1.firebasedatabase.app';
const SITE = 'https://louskyfly.github.io/seconde-plateforme';
const VAPID_PUBLIC_KEY = 'BBV2uv63gwvTZrDnqDHkytVOvKhfNWOcqqQRH4MHyLyWnOvhY-1vnQeNdg5qDRi4wXXUIZD7-GWmMR54WoM5efY';
const POLL_MS = 30_000;
const LOOKBACK_MS = 3 * 60_000; // rattrape les horloges d'iPad un peu en retard
const RUN_MINUTES = Number(process.env.RUN_MINUTES || 340);
const MODE = process.env.MODE || 'run';

const { VAPID_PRIVATE_KEY } = process.env;

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ------------------------------ Firebase ---------------------------------- */

async function db(path, query = '') {
  const r = await fetch(`${DB}/${path}.json?${query}`);
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Déchiffre un abonnement (voir sealForRobot dans src/lib/api.ts). */
function openSealed(c) {
  const buf = Buffer.from(c, 'base64url');
  const pub = buf.subarray(0, 65);
  const iv = buf.subarray(65, 77);
  const body = buf.subarray(77, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(VAPID_PRIVATE_KEY, 'base64url'));
  const key = crypto.createHash('sha256').update(ecdh.computeSecret(pub)).digest();
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8'));
}

/* ------------------------------ Nouveautés -------------------------------- */

const fmtDay = (d) => {
  const x = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(x.getTime())
    ? String(d || '')
    : x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
};

const isControle = (e) => e.category === 'controle' || /contr[oô]le/i.test(e.title || '');

const SOURCES = [
  { col: 'sheets', ok: (s) => (s.status || 'active') === 'active', msg: (s) => ['📝 Nouvelle fiche de révision', s.title], url: '/fiches' },
  { col: 'ideas', ok: () => true, msg: (i) => ['💡 Nouvelle idée', i.title], url: '/idees' },
  { col: 'announcements', ok: (a) => a.published !== false, msg: (a) => ['📢 Nouvelle annonce', a.title], url: '/informations' },
  { col: 'polls', ok: (p) => p.active !== false, msg: (p) => ['🗳️ Nouveau sondage', p.question], url: '/sondages' },
  {
    col: 'events',
    ok: () => true,
    msg: (e) => [isControle(e) ? '🔴 Nouveau contrôle' : "📅 Nouveau dans l'agenda", `${e.title} · ${fmtDay(e.date)}`],
    url: '/calendrier',
  },
  { col: 'resources', ok: () => true, msg: (r) => ['📚 Nouvelle ressource', r.title], url: '/ressources' },
  { col: 'projects', ok: () => true, msg: (p) => ['🚀 Nouveau projet', p.name], url: '/projets' },
  {
    col: 'revisions',
    ok: () => true,
    msg: (r) => ['📖 Nouvelle session de révision', `${r.title || r.subject || 'Révisions'} · ${fmtDay(r.date)}`],
    url: '/revisions',
  },
];

// État en mémoire : chaque session reprend 3 min avant son démarrage (LOOKBACK_MS).
const state = { lastTs: Date.now(), sent: {} };
const dead = new Set();

async function findNew() {
  const since = state.lastTs - LOOKBACK_MS;
  const found = [];
  for (const src of SOURCES) {
    let items;
    try {
      items = await db(src.col, `orderBy=%22createdAt%22&startAt=${since}`);
    } catch (e) {
      log('lecture', src.col, e.message);
      continue;
    }
    for (const [id, it] of Object.entries(items || {})) {
      if (!it || typeof it !== 'object') continue;
      const key = `${src.col}/${id}`;
      const created = Number(it.createdAt) || 0;
      if (state.sent[key] || created < since || created < Date.now() - 6 * 3600_000 || !src.ok(it)) continue;
      const [title, body] = src.msg(it);
      if (!body) continue;
      found.push({ key, created, title, body: String(body).slice(0, 180), url: `${SITE}${src.url}`, author: it.authorFingerprint || it.fingerprint || null });
    }
  }
  return found.sort((a, b) => a.created - b.created);
}

/* ------------------------------- Envoi ------------------------------------ */

async function send(news) {
  const byEndpoint = new Map();
  for (const [key, row] of Object.entries((await db('pushSubs')) || {})) {
    if (dead.has(key) || typeof row?.c !== 'string') continue;
    try {
      const s = openSealed(row.c);
      if (s?.e && !byEndpoint.has(s.e)) byEndpoint.set(s.e, { key, ...s });
    } catch {
      dead.add(key); // illisible : ignoré
    }
  }
  log(`${news.length} nouveauté(s) → ${byEndpoint.size} appareil(s)`);

  for (const sub of byEndpoint.values()) {
    const mine = news.filter((n) => !(n.author && sub.f && n.author === sub.f));
    if (!mine.length) continue;
    const payloads =
      mine.length > 3
        ? [{ title: `🔔 ${mine.length} nouveautés`, body: mine.map((n) => n.body).join(' · ').slice(0, 180), url: `${SITE}/`, tag: 'nouveautes' }]
        : mine.map((n) => ({ title: n.title, body: n.body, url: n.url, tag: n.key }));
    for (const p of payloads) {
      try {
        await webpush.sendNotification({ endpoint: sub.e, keys: { p256dh: sub.p, auth: sub.a } }, JSON.stringify(p), {
          TTL: 24 * 3600,
          urgency: 'high',
        });
        log('envoyé', new URL(sub.e).host);
      } catch (e) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          dead.add(sub.key);
          log('abonnement expiré ignoré');
          break;
        }
        log('envoi échoué', code || e.message, e?.body || '');
      }
    }
  }
}

/* ------------------------------- Boucle ----------------------------------- */

async function main() {
  if (!VAPID_PRIVATE_KEY) throw new Error('Secret VAPID_PRIVATE_KEY manquant');
  webpush.setVapidDetails(SITE + '/', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  if (MODE === 'test') {
    await send([{ key: 'test', created: Date.now(), title: '🔔 Test des notifications', body: 'Les notifications de la classe fonctionnent !', url: `${SITE}/`, author: null }]);
    return;
  }

  log('Robot démarré');
  const stopAt = Date.now() + RUN_MINUTES * 60_000;
  while (Date.now() < stopAt) {
    try {
      const news = await findNew();
      if (news.length) {
        await send(news);
        for (const n of news) state.sent[n.key] = n.created;
      }
      state.lastTs = Math.max(state.lastTs, Date.now() - LOOKBACK_MS);
      const dayAgo = Date.now() - 24 * 3600_000;
      for (const [k, t] of Object.entries(state.sent)) if (t < dayAgo) delete state.sent[k];
    } catch (e) {
      log('erreur', e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  log('Fin de la session, la suivante prend le relais');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
