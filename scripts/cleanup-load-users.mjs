/**
 * Nettoyage des comptes créés par un test de charge.
 *
 * Les élèves simulés s'inscrivent au chat : sans ce script, la liste des
 * membres du chat se remplit de « Eleve N » parasites. On exporte la base,
 * on retire les lignes dont le fingerprint correspond au test, puis on
 * restaure via le même endpoint d'import (transactionnel).
 *
 * Prérequis : ADMIN_PASSWORD dans l'environnement.
 * Lancement : node scripts/cleanup-load-users.mjs [url] [prefixe]
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '');
const PREFIX = process.argv[3] || 'load-student-';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.argv.includes('--dry-run');

if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD est requis.');
  process.exit(1);
}

let cookie = '';

async function admin(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && method === 'POST' && path === '/api/auth/login') {
    throw new Error('Connexion refusée : vérifie ADMIN_PASSWORD.');
  }
  return res;
}

const res = await admin('POST', '/api/auth/login', { password: ADMIN_PASSWORD });
cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');

const backup = await (await admin('GET', '/api/admin/export')).json();
const tables = backup.tables;

const matches = (row) =>
  Object.values(row).some((v) => typeof v === 'string' && v.includes(PREFIX));

let removed = 0;
for (const [name, rows] of Object.entries(tables)) {
  if (!Array.isArray(rows) || rows.length === 0) continue;
  const kept = rows.filter((row) => !matches(row));
  const diff = rows.length - kept.length;
  if (diff > 0) {
    tables[name] = kept;
    removed += diff;
    console.log(`  ${name} : -${diff} ligne(s)`);
  }
}

console.log(`\nTotal : ${removed} ligne(s) contenant « ${PREFIX} »`);

if (removed === 0) {
  console.log('Rien à nettoyer.');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('\n--dry-run : aucune modification.');
  process.exit(0);
}

const restore = await admin('POST', '/api/admin/import', { tables });
if (!restore.ok) {
  console.error('Restauration refusée :', await restore.text());
  process.exit(1);
}

const check = await (await admin('GET', '/api/admin/users')).json();
const left = check.filter((u) => JSON.stringify(u).includes(PREFIX));
console.log(`\nUtilisateurs restants avec le préfixe : ${left.length}`);
console.log('Nettoyage terminé.');
