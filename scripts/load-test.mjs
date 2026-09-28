/**
 * Test de charge : simule N élèves + le délégué sur l'API réelle.
 *
 * Chaque « élève » a son propre fingerprint et appelle les mêmes endpoints que
 * l'application (accueil, chat, annonces, fiches, calendrier, messages) avec
 * le même rythme de rafraîchissement. Le délégué publie en parallèle.
 *
 * Lancement : node scripts/load-test.mjs [url] [eleves] [secondes]
 * Exemple :   node scripts/load-test.mjs https://seconde-plateforme.onrender.com 35 45
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '');
const STUDENTS = Number(process.argv[3] || 35);
const DURATION_S = Number(process.argv[4] || 45);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'delegue2026';

// Un cycle par élève = ce que fait une page ouverte qui se rafraîchit.
const ENDPOINTS = [
  { path: '/api/events', weight: 2 },
  { path: '/api/announcements', weight: 2 },
  { path: '/api/ideas', weight: 2 },
  { path: '/api/resources', weight: 1 },
  { path: '/api/projects', weight: 1 },
  { path: '/api/settings', weight: 1 },
  { path: '/api/chat/unread', weight: 3, needsFingerprint: true },
  { path: '/api/chat/conversation', weight: 2, needsFingerprint: true },
  { path: '/api/chat/messages?conversation_id=1&after=0', weight: 3, needsFingerprint: true },
  { path: '/api/sheets?page=1', weight: 3, needsFingerprint: true },
  { path: '/api/messages/mine', weight: 1, needsFingerprint: true },
  { path: '/api/polls', weight: 2, needsFingerprint: true },
];

const WEIGHTED = ENDPOINTS.flatMap((e) => Array(e.weight).fill(e));

const stats = {
  requests: 0,
  errors: 0,
  timeouts: 0,
  byStatus: new Map(),
  latencies: [],
};
let nextSlot = 0;

function recordLatency(ms) {
  stats.latencies.push(ms);
  if (stats.latencies.length > 20000) stats.latencies.splice(0, 10000);
}

function recordStatus(code) {
  const key = String(code);
  stats.byStatus.set(key, (stats.byStatus.get(key) || 0) + 1);
}

async function call(path, fingerprint, cookie) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}fingerprint=${fingerprint}`;
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Connection: 'keep-alive', ...(cookie ? { Cookie: cookie } : {}) },
    });
    await res.arrayBuffer();
    recordStatus(res.status);
    if (res.status >= 500) stats.errors++;
  } catch (err) {
    if (err.name === 'AbortError') stats.timeouts++;
    else stats.errors++;
    recordStatus('ERR');
  } finally {
    clearTimeout(timer);
    stats.requests++;
    recordLatency(performance.now() - started);
  }
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) return null;
  const cookies = res.headers.getSetCookie?.() || [];
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  return cookie || null;
}

async function delegateLoad(cookie, endAt) {
  if (!cookie) return;
  let n = 0;
  while (Date.now() < endAt) {
    // Le délégué consulte et modifie : c'est le comportement le plus lourd.
    await call('/api/events', 'delegate-load', cookie);
    await call('/api/admin/overview', 'delegate-load', cookie);
    if (n % 3 === 0) {
      const res = await fetch(`${BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          title: `Charge ${n}`,
          date: '2026-10-15',
          time: '',
          description: '',
          category: 'autre',
        }),
      });
      recordStatus(res.status);
      await res.arrayBuffer();
      stats.requests++;
      n++;
    }
    await sleep(2000);
  }
}

/** Inscrit l'élève au chat, comme le fait l'application à la première visite. */
async function joinChat(fingerprint, pseudo) {
  const res = await fetch(`${BASE}/api/chat/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, display_name: pseudo }),
  });
  recordStatus(res.status);
  await res.arrayBuffer();
  stats.requests++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function percentile(p) {
  if (stats.latencies.length === 0) return 0;
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

async function main() {
  console.log(`Cible      : ${BASE}`);
  console.log(`Élèves     : ${STUDENTS} (concurrents)`);
  console.log(`Durée      : ${DURATION_S}s`);
  console.log(`Sessions   : 1 kept-alive par élève via undici\n`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health) {
    console.error('Service injoignable.');
    process.exit(1);
  }
  console.log(`Santé      : ${JSON.stringify(health)}`);

  const cookie = await login();
  console.log(`Délégué    : ${cookie ? 'connecté' : 'non connecté (le test tourne en lecture seule)'}\n`);

  const endAt = Date.now() + DURATION_S * 1000;
  const t0 = Date.now();

  // Les requêtes sont réparties sur une originating queue : elles partent par
  // vagues de 5-10 comme un vrai groupe d'élèves qui ouvre l'application.
  const workers = Array.from({ length: STUDENTS }, (_, i) => {
    const fingerprint = `load-student-${i}`;
    return (async () => {
      // Chaque élève enregistre son profil de chat, comme à la première visite.
      await joinChat(fingerprint, `Eleve ${i + 1}`);
      while (Date.now() < endAt) {
        const batch = 3 + Math.floor(Math.random() * 4);
        for (let b = 0; b < batch; b++) {
          const slot = nextSlot++;
          const endpoint = WEIGHTED[slot % WEIGHTED.length];
          await call(endpoint.path, fingerprint);
        }
        await sleep(1500 + Math.random() * 2500);
      }
    })();
  });

  const delegate = delegateLoad(cookie, endAt);
  await Promise.all([...workers, delegate]);

  const elapsed = (Date.now() - t0) / 1000;
  const rps = stats.requests / elapsed;
  const ok = stats.requests - stats.errors - stats.timeouts;

  console.log('\n─────────────── RÉSULTATS ───────────────');
  console.log(`Requêtes      : ${stats.requests}`);
  console.log(`Durée         : ${elapsed.toFixed(1)}s`);
  console.log(`Débit         : ${rps.toFixed(1)} req/s`);
  console.log(`Succès        : ${ok} (${((ok / stats.requests) * 100).toFixed(2)}%)`);
  console.log(`Erreurs 5xx   : ${[...stats.byStatus.entries()].filter(([c]) => /^5/.test(c)).reduce((a, [, v]) => a + v, 0)}`);
  console.log(`Timeouts      : ${stats.timeouts}`);
  console.log(`Latence p50   : ${percentile(50).toFixed(0)} ms`);
  console.log(`Latence p95   : ${percentile(95).toFixed(0)} ms`);
  console.log(`Latence p99   : ${percentile(99).toFixed(0)} ms`);
  console.log(`Latence max   : ${Math.max(...stats.latencies, 0).toFixed(0)} ms`);
  console.log('\nPar code HTTP :');
  for (const [code, count] of [...stats.byStatus.entries()].sort()) {
    console.log(`  ${code} : ${count}`);
  }
  console.log('──────────────────────────────────────────');
}

main();
