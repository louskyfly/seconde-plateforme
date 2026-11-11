/**
 * Robot de notifications (tourne dans GitHub Actions, gratuit sur un dépôt public).
 *
 * Toutes les 30 s, il regarde dans Firebase s'il y a de nouvelles fiches, idées,
 * annonces, sondages, dates d'agenda, ressources, projets ou sessions de
 * révision, et envoie une vraie notification (Web Push) à chaque iPad abonné
 * (`pushSubs`, rempli par le site quand l'élève touche « Activer »).
 *
 * Secrets GitHub nécessaires : BOT_EMAIL, BOT_PASSWORD (compte Firebase du
 * robot, seul autorisé à lire `pushSubs`) et VAPID_PRIVATE_KEY.
 */
import webpush from 'web-push';

const API_KEY = 'AIzaSyDQo9oaIHxOcvPsDxy_7Sx4wCPApvNRBcE';
const DB = 'https://sync-3626f-default-rtdb.europe-west1.firebasedatabase.app';
const SITE = 'https://louskyfly.github.io/seconde-plateforme';
const VAPID_PUBLIC_KEY = 'BBV2uv63gwvTZrDnqDHkytVOvKhfNWOcqqQRH4MHyLyWnOvhY-1vnQeNdg5qDRi4wXXUIZD7-GWmMR54WoM5efY';
const POLL_MS = 30_000;
const LOOKBACK_MS = 3 * 60_000; // rattrape les horloges d'iPad un peu en retard
const RUN_MINUTES = Number(process.env.RUN_MINUTES || 340);
const MODE = process.env.MODE || 'run';

const { BOT_EMAIL, BOT_PASSWORD, VAPID_PRIVATE_KEY } = process.env;
if (!BOT_EMAIL || !BOT_PASSWORD) throw new Error('Secrets BOT_EMAIL / BOT_PASSWORD manquants');

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------------------------- Connexion Firebase --------------------------- */

let token = null;
let tokenAt = 0;
let uid = null;

async function idt(path, body) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j?.error?.message || r.status}`);
  return j;
}

async function signIn() {
  let j;
  try {
    j = await idt('signInWithPassword', { email: BOT_EMAIL, password: BOT_PASSWORD });
  } catch (e) {
    if (MODE !== 'signup') throw e;
    j = await idt('signUp', { email: BOT_EMAIL, password: BOT_PASSWORD });
    log('Compte robot créé');
  }
  token = j.idToken;
  uid = j.localId;
  tokenAt = Date.now();
}

async function auth() {
  if (!token || Date.now() - tokenAt > 45 * 60_000) await signIn();
  return token;
}

async function db(method, path, { query = '', body } = {}) {
  const url = `${DB}/${path}.json?auth=${await auth()}${query}`;
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
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

let state = { lastTs: 0, sent: {} };

async function loadState() {
  const s = (await db('GET', 'pushState')) || {};
  state = { lastTs: Number(s.lastTs) || Date.now(), sent: s.sent || {} };
  if (!s.lastTs) await saveState();
}

async function saveState() {
  const dayAgo = Date.now() - 24 * 3600_000;
  for (const [k, t] of Object.entries(state.sent)) if (t < dayAgo) delete state.sent[k];
  await db('PUT', 'pushState', { body: state });
}

async function findNew() {
  const since = state.lastTs - LOOKBACK_MS;
  const found = [];
  for (const src of SOURCES) {
    let items;
    try {
      items = await db('GET', src.col, { query: `&orderBy=%22createdAt%22&startAt=${since}` });
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
      found.push({ key, created, title, body: String(body).slice(0, 180), url: `${SITE}${src.url}`, authorUid: it.authorUid || null });
    }
  }
  return found.sort((a, b) => a.created - b.created);
}

/* ------------------------------- Envoi ------------------------------------ */

async function send(news) {
  const subs = Object.entries((await db('GET', 'pushSubs')) || {});
  const byEndpoint = new Map();
  for (const [key, s] of subs) if (s?.endpoint && !byEndpoint.has(s.endpoint)) byEndpoint.set(s.endpoint, { key, ...s });
  log(`${news.length} nouveauté(s) → ${byEndpoint.size} appareil(s)`);

  for (const sub of byEndpoint.values()) {
    const mine = news.filter((n) => !(n.authorUid && n.authorUid === sub.uid));
    if (!mine.length) continue;
    const payloads =
      mine.length > 3
        ? [{ title: `🔔 ${mine.length} nouveautés`, body: mine.map((n) => n.body).join(' · ').slice(0, 180), url: `${SITE}/`, tag: 'nouveautes' }]
        : mine.map((n) => ({ title: n.title, body: n.body, url: n.url, tag: n.key }));
    for (const p of payloads) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(p),
          { TTL: 24 * 3600, urgency: 'high' }
        );
      } catch (e) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          log('abonnement expiré supprimé');
          await db('DELETE', `pushSubs/${sub.key}`).catch(() => {});
          break;
        }
        log('envoi échoué', code || e.message);
      }
    }
  }
}

/* ------------------------------- Boucle ----------------------------------- */

async function main() {
  await signIn();
  log('Robot connecté, uid', uid);
  if (MODE === 'signup') return;
  if (!VAPID_PRIVATE_KEY) throw new Error('Secret VAPID_PRIVATE_KEY manquant');
  webpush.setVapidDetails(SITE + '/', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  if (MODE === 'test') {
    await send([{ key: 'test', created: Date.now(), title: '🔔 Test des notifications', body: 'Les notifications de la classe fonctionnent !', url: `${SITE}/`, authorUid: null }]);
    return;
  }

  await loadState();
  const stopAt = Date.now() + RUN_MINUTES * 60_000;
  while (Date.now() < stopAt) {
    try {
      const news = await findNew();
      if (news.length) {
        await send(news);
        for (const n of news) state.sent[n.key] = n.created;
      }
      state.lastTs = Math.max(state.lastTs, ...news.map((n) => n.created), Date.now() - LOOKBACK_MS);
      if (news.length) await saveState();
    } catch (e) {
      log('erreur', e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await saveState().catch(() => {});
  log('Fin de la session, la suivante prend le relais');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
