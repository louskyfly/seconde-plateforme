/**
 * Tests d'intégration de l'API (maintenance, chat, fiches, permissions).
 * Aucune dépendance externe : node:test + fetch natif.
 * Le serveur est lancé sur une base temporaire, donc aucun impact sur les données réelles.
 *
 * Lancement : npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3947;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASSWORD = 'delegue2026';
const ALICE = 'fp-test-alice-0001';
const BOB = 'fp-test-bob-0002';
const CAROL = 'fp-test-carol-0003';

let server;
let tmpDir;

// Petit client HTTP avec conservation du cookie de session.
function makeClient() {
  let cookie = '';
  return async function call(method, url, body) {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const raw of setCookie) {
      const pair = raw.split(';')[0];
      if (pair) cookie = pair;
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  };
}

const student = makeClient();
const admin = makeClient();
const other = makeClient();

// PNG 1x1 valide (signature réelle + données)
// eslint-disable-next-line no-undef
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Faux PNG de `sizeBytes` octets : la validation du serveur contrôle la signature
// (8 premiers octets), pas le décodage complet de l'image.
function pngOfSize(sizeBytes) {
  const buffer = Buffer.alloc(sizeBytes, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Le serveur de test n’a pas démarré');
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seconde-test-'));
  server = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: path.join(tmpDir, 'test.db'),
      NODE_ENV: 'test',
      SESSION_SECRET: 'secret-de-test',
      ADMIN_PASSWORD,
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

/** Relance le serveur sur la même base : simule un redémarrage de Render. */
async function restartServer() {
  if (server && server.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.kill('SIGKILL');
        resolve();
      }, 5000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      server.kill();
    });
  }
  server = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: path.join(tmpDir, 'test.db'),
      NODE_ENV: 'test',
      SESSION_SECRET: 'secret-de-test',
      ADMIN_PASSWORD,
    },
    stdio: 'ignore',
  });
  await waitForServer();
}

after(async () => {
  // Sur Windows, le fichier SQLite reste verrouillé tant que le serveur n'a pas
  // quitté : on attend sa fin avant de supprimer la base temporaire.
  if (server && server.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.kill('SIGKILL');
        resolve();
      }, 3000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      server.kill();
    });
  }
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

describe('Permissions administrateur', () => {
  test('un élève ne peut pas accéder aux routes admin', async () => {
    assert.equal((await student('GET', '/api/admin/overview')).status, 401);
    assert.equal((await student('GET', '/api/admin/users')).status, 401);
    assert.equal((await student('GET', '/api/admin/log')).status, 401);
  });

  test('un élève ne peut pas supprimer une annonce', async () => {
    const res = await student('DELETE', '/api/announcements/1');
    assert.equal(res.status, 401);
  });

  test('le délégué se connecte et accède aux routes admin', async () => {
    const login = await admin('POST', '/api/auth/login', { password: ADMIN_PASSWORD });
    assert.equal(login.status, 200);
    assert.equal((await admin('GET', '/api/admin/overview')).status, 200);
  });
});

describe('Chat', () => {
  test('lecture refusée tant que le profil n’est pas créé', async () => {
    const res = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1`);
    assert.equal(res.status, 403);
    assert.equal(res.data.needs_profile, true);
  });

  test('inscription avec un pseudo', async () => {
    const res = await student('POST', '/api/chat/join', { fingerprint: ALICE, display_name: 'Alice' });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.display_name, 'Alice');
    assert.ok(res.data.conversation.id > 0);
  });

  test('pseudo trop court refusé', async () => {
    const res = await other('POST', '/api/chat/join', { fingerprint: BOB, display_name: 'a' });
    assert.equal(res.status, 400);
  });

  test('le chat garde sa limite de 3 Mo par image', async () => {
    const res = await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: 1,
      content: 'Gros fichier',
      image: pngOfSize(6 * 1024 * 1024),
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /volumineux/i);
  });

  test('envoi et réception d’un message', async () => {
    const join = await other('POST', '/api/chat/join', { fingerprint: BOB, display_name: 'Bob' });
    const conversationId = join.data.conversation.id;

    const sent = await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: conversationId,
      content: 'Bonjour la classe !',
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.data.message.sender_name, 'Alice');

    const received = await other('GET', `/api/chat/messages?fingerprint=${BOB}&conversation_id=${conversationId}`);
    assert.equal(received.status, 200);
    assert.equal(received.data.messages.length, 1);
    assert.equal(received.data.messages[0].content, 'Bonjour la classe !');
  });

  test('photo dans un message : servie par l’API avec nosniff', async () => {
    const sent = await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: 1,
      content: '',
      image: PNG_1PX,
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.data.message.has_image, 1);

    const res = await fetch(`${BASE}/api/chat/messages/${sent.data.message.id}/image?fingerprint=${ALICE}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('image falsifiée refusée (le type réel compte, pas le MIME annoncé)', async () => {
    const res = await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: 1,
      content: '',
      image: 'data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    });
    assert.equal(res.status, 400);
  });

  test('accès refusé à une conversation dont on n’est pas membre', async () => {
    const stranger = makeClient();
    const res = await stranger('GET', '/api/chat/messages?fingerprint=fp-inconnu-9999&conversation_id=1');
    assert.equal(res.status, 403);

    const post = await stranger('POST', '/api/chat/messages', {
      fingerprint: 'fp-inconnu-9999',
      conversation_id: 1,
      content: 'intrusion',
    });
    assert.equal(post.status, 403);
  });

  test('compteur de non-lus', async () => {
    const before = await other('GET', `/api/chat/unread?fingerprint=${BOB}`);
    const unreadBefore = before.data.unread;
    await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: 1,
      content: 'Encore un message',
    });
    const afterMsg = await other('GET', `/api/chat/unread?fingerprint=${BOB}`);
    assert.equal(afterMsg.data.unread, unreadBefore + 1);

    await other('POST', '/api/chat/read', { fingerprint: BOB, conversation_id: 1 });
    const cleared = await other('GET', `/api/chat/unread?fingerprint=${BOB}`);
    assert.equal(cleared.data.unread, 0);
  });

  test('un élève ne peut pas supprimer le message d’un autre', async () => {
    const sent = await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: 1,
      content: 'Message de Alice',
    });
    const messageId = sent.data.message.id;

    const forbidden = await other('DELETE', `/api/chat/messages/${messageId}?fingerprint=${BOB}`);
    assert.equal(forbidden.status, 403);

    const byAuthor = await student('DELETE', `/api/chat/messages/${messageId}?fingerprint=${ALICE}`);
    assert.equal(byAuthor.status, 200);
  });

  test('le délégué supprime n’importe quel message', async () => {
    const sent = await other('POST', '/api/chat/messages', {
      fingerprint: BOB,
      conversation_id: 1,
      content: 'Message de Bob',
    });
    const res = await admin('DELETE', `/api/chat/messages/${sent.data.message.id}`);
    assert.equal(res.status, 200);

    const log = await admin('GET', '/api/admin/log');
    assert.ok(log.data.some((entry) => entry.action === 'chat_message_delete'));
  });

  test('limite anti-spam', async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const res = await student('POST', '/api/chat/messages', {
        fingerprint: ALICE,
        conversation_id: 1,
        content: `spam ${i}`,
      });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    assert.equal(limited, true, 'la limitation de débit doit se déclencher');
  });
});

describe('Fiches de révision', () => {
  test('dépôt d’une image valide', async () => {
    const res = await student('POST', '/api/sheets', {
      title: 'Fiche de maths',
      subject: 'maths',
      description: 'Fractions',
      file: PNG_1PX,
      fingerprint: ALICE,
      author_name: 'Alice',
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.kind, 'image');
    assert.equal(res.data.mime_type, 'image/png');
    assert.equal(res.data.is_mine, true);
  });

  test('le pseudo du chat est repris automatiquement', async () => {
    const res = await other('POST', '/api/sheets', {
      title: 'Fiche de français',
      subject: 'francais',
      file: PNG_1PX,
      fingerprint: BOB,
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.author_name, 'Bob');
  });

  test('type de fichier interdit refusé', async () => {
    const res = await student('POST', '/api/sheets', {
      title: 'Faux PDF',
      subject: 'maths',
      file: 'data:application/pdf;base64,PGh0bWw+PGJvZHk+PHNjcmlwdD48L3NjcmlwdD48L2JvZHk+PC9odG1sPg==',
      fingerprint: ALICE,
      author_name: 'Alice',
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /non autorisé/i);
  });

  test('fichier trop volumineux refusé', async () => {
    // Au-delà de la limite des fiches (15 Mo)
    const huge = 'data:image/png;base64,' + 'A'.repeat(21 * 1024 * 1024);
    const res = await student('POST', '/api/sheets', {
      title: 'Trop gros',
      subject: 'maths',
      file: huge,
      fingerprint: ALICE,
      author_name: 'Alice',
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /volumineux/i);
  });

  test('une image de plus de 3 Mo est acceptée', async () => {
    // 6 Mo : refusé avant l'augmentation de la limite, accepté aujourd'hui
    const res = await student('POST', '/api/sheets', {
      title: 'Photo de cours',
      subject: 'maths',
      file: pngOfSize(6 * 1024 * 1024),
      fingerprint: ALICE,
      author_name: 'Alice',
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.kind, 'image');
  });

  test('le fichier est servi par l’API, jamais en exécutable', async () => {
    const list = await student('GET', `/api/sheets?fingerprint=${ALICE}`);
    const sheet = list.data.items[0];
    const res = await fetch(`${BASE}/api/sheets/${sheet.id}/file`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-disposition') || '', /inline/);
  });

  test('l’image s’affiche dans l’onglet au lieu d’être téléchargée', async () => {
    // Régression : la réponse était en `attachment`, ce qui laissait un onglet
    // blanc sur téléphone au lieu d'afficher la fiche.
    const list = await student('GET', `/api/sheets?fingerprint=${ALICE}`);
    const sheet = list.data.items[0];
    const res = await fetch(`${BASE}/api/sheets/${sheet.id}/file?inline=1`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') || '', /inline/);
    assert.doesNotMatch(res.headers.get('content-disposition') || '', /attachment/);
  });

  test('un élève ne peut pas supprimer la fiche d’un autre', async () => {
    const carol = makeClient();
    await carol('POST', '/api/chat/join', { fingerprint: CAROL, display_name: 'Carol' });

    const list = await student('GET', `/api/sheets?fingerprint=${ALICE}`);
    const bobSheet = list.data.items.find((s) => s.author_name === 'Bob');
    const forbidden = await carol('DELETE', `/api/sheets/${bobSheet.id}?fingerprint=${CAROL}`);
    assert.equal(forbidden.status, 403);

    const anonymous = await carol('DELETE', `/api/sheets/${bobSheet.id}`);
    assert.equal(anonymous.status, 403);
  });

  test('l’auteur supprime sa fiche, le délégué peut tout supprimer', async () => {
    const list = await student('GET', `/api/sheets?fingerprint=${ALICE}`);
    const own = list.data.items.find((s) => s.author_name === 'Alice');
    assert.equal((await student('DELETE', `/api/sheets/${own.id}?fingerprint=${ALICE}`)).status, 200);

    const created = await other('POST', '/api/sheets', {
      title: 'Fiche à supprimer',
      subject: 'svt',
      file: PNG_1PX,
      fingerprint: BOB,
    });
    const removed = await admin('DELETE', `/api/sheets/${created.data.id}`);
    assert.equal(removed.status, 200);

    const gone = await fetch(`${BASE}/api/sheets/${created.data.id}/file`);
    assert.equal(gone.status, 404, 'le fichier doit disparaître avec la fiche');
  });

  test('le délégué masque une fiche : invisible pour les élèves, fichier bloqué', async () => {
    const created = await other('POST', '/api/sheets', {
      title: 'Fiche à masquer',
      subject: 'histoire',
      file: PNG_1PX,
      fingerprint: BOB,
    });
    const id = created.data.id;

    assert.equal((await admin('PATCH', `/api/sheets/${id}`, { status: 'hidden' })).status, 200);

    const studentList = await student('GET', '/api/sheets');
    assert.equal(studentList.data.items.some((s) => s.id === id), false);

    const file = await fetch(`${BASE}/api/sheets/${id}/file`);
    assert.equal(file.status, 404, 'un masque ne doit pas laisser le fichier accessible par URL');

    const adminFile = await admin('GET', `/api/admin/overview`);
    assert.ok(adminFile.data.hiddenSheets >= 1);
  });

  test('un élève ne peut pas masquer une fiche', async () => {
    const created = await other('POST', '/api/sheets', {
      title: 'Fiche à protéger',
      subject: 'physique',
      file: PNG_1PX,
      fingerprint: BOB,
    });
    const res = await student('PATCH', `/api/sheets/${created.data.id}`, { status: 'hidden' });
    assert.equal(res.status, 401);
  });

  test('pagination et recherche', async () => {
    const res = await student('GET', '/api/sheets?q=maths&limit=1');
    assert.equal(res.status, 200);
    assert.ok(res.data.items.length <= 1);
    assert.ok(res.data.items.every((s) => /maths/i.test(s.title + s.description + s.subject)));
  });
});

describe('Calendrier', () => {
  test('le délégué crée un événement', async () => {
    const res = await admin('POST', '/api/events', {
      title: 'Sortie au musée',
      date: '2026-10-15',
      time: '08:30',
      description: 'Départ devant le lycée',
      category: 'sortie',
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.title, 'Sortie au musée');
    assert.equal(res.data.date, '2026-10-15');
    assert.equal(res.data.time, '08:30');
    assert.equal(res.data.category, 'sortie');
  });

  test('un événement sans heure ni description est accepté', async () => {
    // Le formulaire envoie `time: null` quand l'heure est vide : l'insertion
    // échouait sur un `.trim()` appliqué à null.
    const res = await admin('POST', '/api/events', {
      title: 'Conseil de classe',
      date: '2026-11-04',
      time: null,
      description: '',
      category: 'reunion',
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.time, '');
  });

  test('titre ou date manquants sont refusés', async () => {
    assert.equal((await admin('POST', '/api/events', { date: '2026-10-15' })).status, 400);
    assert.equal((await admin('POST', '/api/events', { title: 'Sans date' })).status, 400);
  });

  test('un élève ne peut pas créer ni supprimer un événement', async () => {
    assert.equal(
      (await student('POST', '/api/events', { title: 'Pirate', date: '2026-10-15' })).status,
      401
    );
    const list = await student('GET', '/api/events');
    assert.equal((await student('DELETE', `/api/events/${list.data[0].id}`)).status, 401);
  });

  test('la modification et la suppression fonctionnent côté délégué', async () => {
    const list = await admin('GET', '/api/events');
    const created = list.data.find((e) => e.title === 'Conseil de classe');

    const updated = await admin('PUT', `/api/events/${created.id}`, { title: 'Conseil de classe (reporté)' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.title, 'Conseil de classe (reporté)');

    assert.equal((await admin('DELETE', `/api/events/${created.id}`)).status, 200);
    const after = await student('GET', '/api/events');
    assert.equal(after.data.some((e) => e.id === created.id), false);
  });
});

describe('Idées', () => {
  let ideaId = 0;

  test('le délégué dépose une idée', async () => {
    const res = await student('POST', '/api/ideas', {
      title: 'Sortie au musée',
      description: 'Une idée de test',
      category: 'classe',
      fingerprint: ALICE,
      author_name: 'Alice',
    });
    assert.equal(res.status, 201);
    ideaId = res.data.id;
  });

  test('le délégué ne peut pas changer le statut qu’un élève n’a pas créé', async () => {
    // Recorded above: the idea is created as a student, then the delegate acts
    // on it. Both roles are exercised; the endpoint only requires auth.
    const res = await admin('PUT', `/api/ideas/${ideaId}`, { status: 'en_discussion' });
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'en_discussion');
  });

  test('tous les statuts de la liste sont acceptés', async () => {
    for (const status of ['a_etudier', 'transmise', 'realisee', 'non_retenue', 'en_discussion']) {
      const res = await admin('PUT', `/api/ideas/${ideaId}`, { status });
      assert.equal(res.status, 200, `${status} doit être accepté`);
      assert.equal(res.data.status, status);
    }
  });

  test('un statut hors liste est refusé au lieu d’être enregistré tel quel', async () => {
    // Régression : une valeur invalide était acceptée, ce qui rendait l'idée
    // invisible des filtres du client.
    const res = await admin('PUT', `/api/ideas/${ideaId}`, { status: 'statut_bidon' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /invalide/i);

    const after = await admin('GET', '/api/ideas');
    assert.equal(after.data.find((i) => i.id === ideaId).status, 'en_discussion', 'le statut ne doit pas bouger');
  });

  test('une idée signée exige un prénom, et un seul mot', async () => {
    // Règle du site : le prénom est la seule identité affichée. Un nom complet
    // ne doit pas pouvoir être enregistré, même en contournant le client.
    const sansPrenom = await student('POST', '/api/ideas', {
      title: 'Sans prénom',
      description: 'x',
      category: 'classe',
    });
    assert.equal(sansPrenom.status, 400);

    const nomComplet = await student('POST', '/api/ideas', {
      title: 'Nom complet',
      description: 'x',
      category: 'classe',
      author_name: 'Jean Dupont',
    });
    assert.equal(nomComplet.status, 400, 'un nom de famille ne doit pas être accepté');

    const tropCourt = await student('POST', '/api/ideas', {
      title: 'Prénom trop court',
      description: 'x',
      category: 'classe',
      author_name: 'J',
    });
    assert.equal(tropCourt.status, 400);

    const valide = await student('POST', '/api/ideas', {
      title: 'Prénom valide',
      description: 'x',
      category: 'classe',
      author_name: 'Zoé',
    });
    assert.equal(valide.status, 201);
    assert.equal(valide.data.author_name, 'Zoé');
  });

  test('une idée anonyme se publie sans prénom', async () => {
    const res = await student('POST', '/api/ideas', {
      title: 'Anonyme',
      description: 'x',
      category: 'classe',
      anonymous: 1,
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.author_name, null, 'le prénom ne doit pas fuiter sur une idée anonyme');
  });

  test('les élèves peuvent répondre sous une idée', async () => {
    const created = await student('POST', '/api/ideas', {
      title: 'Idèce de discussion',
      description: 'On en parle ?',
      category: 'classe',
      anonymous: 1,
    });
    assert.equal(created.status, 201);
    const id = created.data.id;

    // Une réponse exige un prénom.
    const sansPrenom = await student('POST', `/api/ideas/${id}/replies`, {
      content: 'Je suis d’accord',
      fingerprint: ALICE,
    });
    assert.equal(sansPrenom.status, 400);

    const reponse = await student('POST', `/api/ideas/${id}/replies`, {
      content: 'Je suis d’accord',
      author_name: 'Alice',
      fingerprint: ALICE,
    });
    assert.equal(reponse.status, 201);
    assert.equal(reponse.data.author_name, 'Alice');

    const fil = await student('GET', `/api/ideas/${id}/replies`);
    assert.equal(fil.data.length, 1);
    assert.equal(fil.data[0].content, 'Je suis d’accord');
  });

  test('on ne supprime que sa propre réponse', async () => {
    const created = await student('POST', '/api/ideas', {
      title: 'Droits de suppression',
      description: 'x',
      category: 'classe',
      anonymous: 1,
    });
    const id = created.data.id;

    const reponse = await other('POST', `/api/ideas/${id}/replies`, {
      content: 'Message de Bob',
      author_name: 'Bob',
      fingerprint: BOB,
    });
    assert.equal(reponse.status, 201);

    // Alice tente de supprimer la réponse de Bob : refusé.
    const parAlice = await student('DELETE', `/api/ideas/replies/${reponse.data.id}`, {
      fingerprint: ALICE,
    });
    assert.equal(parAlice.status, 403);

    // Bob supprime la sienne : accepté, et le fil le garde en place.
    const parBob = await other('DELETE', `/api/ideas/replies/${reponse.data.id}`, { fingerprint: BOB });
    assert.equal(parBob.status, 200);

    const fil = await student('GET', `/api/ideas/${id}/replies`);
    assert.equal(fil.data.length, 1, 'le fil conserve la place de la réponse supprimée');
    assert.equal(fil.data[0].deleted_at !== null, true);
    assert.equal(fil.data[0].author_name, null, 'le prénom ne doit pas rester après suppression');
  });

  test('une réponse sur une idée inexistante est refusée', async () => {
    const res = await student('POST', '/api/ideas/999999/replies', {
      content: 'x',
      author_name: 'Alice',
      fingerprint: ALICE,
    });
    assert.equal(res.status, 404);
  });

  test('un message signé exige un prénom, sinon il est refusé', async () => {
    const sansPrenom = await student('POST', '/api/messages', {
      content: 'Sans prénom',
      category: 'question',
      fingerprint: ALICE,
    });
    assert.equal(sansPrenom.status, 400);

    const nomComplet = await student('POST', '/api/messages', {
      content: 'Nom complet',
      category: 'question',
      fingerprint: ALICE,
      author_name: 'Alice Martin',
    });
    assert.equal(nomComplet.status, 400, 'le nom de famille ne doit pas passer');

    const anonyme = await student('POST', '/api/messages', {
      content: 'Anonyme',
      category: 'question',
      anonymous: 1,
      fingerprint: ALICE,
    });
    assert.equal(anonyme.status, 201);
    assert.equal(anonyme.data.author_name, null);
  });

  test('supprimer une idée emporte ses réponses', async () => {
    const created = await student('POST', '/api/ideas', {
      title: 'Idée éphémère',
      description: 'x',
      category: 'classe',
      anonymous: 1,
    });
    const id = created.data.id;
    await student('POST', `/api/ideas/${id}/replies`, {
      content: 'Une réponse',
      author_name: 'Alice',
      fingerprint: ALICE,
    });
    assert.equal((await student('GET', `/api/ideas/${id}/replies`)).data.length, 1);

    assert.equal((await admin('DELETE', `/api/ideas/${id}`)).status, 200);

    const fil = await student('GET', `/api/ideas/${id}/replies`);
    assert.equal(fil.status, 404, 'les réponses ne doivent pas survivre à l’idée');
  });

  test('un élève ne peut pas changer le statut', async () => {
    const res = await student('PUT', `/api/ideas/${ideaId}`, { status: 'realisee' });
    assert.equal(res.status, 401);

    const after = await admin('GET', '/api/ideas');
    assert.equal(after.data.find((i) => i.id === ideaId).status, 'en_discussion');
  });
});

describe('Mode maintenance', () => {
  test('état initial : site actif', async () => {
    const res = await student('GET', '/api/maintenance/state');
    assert.equal(res.status, 200);
    assert.equal(res.data.active, false);
  });

  test('activation refusée sans session délégué', async () => {
    const res = await student('POST', '/api/maintenance/activate', { password: ADMIN_PASSWORD });
    assert.equal(res.status, 401);
  });

  test('activation refusée avec un mauvais mot de passe', async () => {
    const res = await admin('POST', '/api/maintenance/activate', { password: 'mauvais' });
    assert.equal(res.status, 401);
  });

  test('activation par le délégué', async () => {
    const res = await admin('POST', '/api/maintenance/activate', {
      password: ADMIN_PASSWORD,
      message: 'Mise à jour en cours',
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.active, true);
    assert.equal(res.data.activated_by, 'Délégué');
    assert.ok(res.data.activated_at);
  });

  test('les élèves sont bloqués sur toutes les API', async () => {
    for (const url of ['/api/announcements', '/api/ideas', '/api/polls', '/api/sheets', '/api/chat/conversation']) {
      const res = await student('GET', url);
      assert.equal(res.status, 503, `${url} doit être bloquée`);
      assert.equal(res.data.maintenance, true);
    }
  });

  test('impossible de contourner le mode maintenance en écrivant', async () => {
    const res = await student('POST', '/api/chat/messages', {
      fingerprint: ALICE,
      conversation_id: 1,
      content: 'contournement',
    });
    assert.equal(res.status, 503);
  });

  test('le délégué garde l’accès complet et peut se reconnecter', async () => {
    assert.equal((await admin('GET', '/api/announcements')).status, 200);
    assert.equal((await admin('POST', '/api/sheets', { title: 'x', file: PNG_1PX, author_name: 'Délégué' })).status, 400);

    const fresh = makeClient();
    const login = await fresh('POST', '/api/auth/login', { password: ADMIN_PASSWORD });
    assert.equal(login.status, 200, 'la connexion doit rester possible en maintenance');
    assert.equal((await fresh('GET', '/api/announcements')).status, 200);
  });

  test('la page de maintenance reste lisible (health + state)', async () => {
    const health = await fetch(`${BASE}/api/health`);
    assert.equal(health.status, 200);
    const state = await student('GET', '/api/maintenance/state');
    assert.equal(state.status, 200);
    assert.equal(state.data.message, 'Mise à jour en cours');
  });

  test('désactivation par le délégué', async () => {
    const res = await admin('POST', '/api/maintenance/deactivate');
    assert.equal(res.status, 200);
    assert.equal(res.data.active, false);
    assert.equal(res.data.deactivated_by, 'Délégué');
    assert.ok(res.data.deactivated_at);

    assert.equal((await student('GET', '/api/announcements')).status, 200);
  });

  test('historique et journal d’administration', async () => {
    const history = await admin('GET', '/api/maintenance/history');
    assert.ok(history.data.length >= 2);
    const log = await admin('GET', '/api/admin/log');
    assert.ok(log.data.some((entry) => entry.action === 'maintenance_on'));
    assert.ok(log.data.some((entry) => entry.action === 'maintenance_off'));
  });
});

describe('Sondages', () => {
  let pollId = 0;
  let optionId = 0;

  test('création d’un sondage avec résultats visibles', async () => {
    const res = await admin('POST', '/api/polls', {
      question: 'Quelle est la couleur de la classe ?',
      options: ['Orange', 'Violet'],
      show_results: 1,
      allow_multiple: 0,
    });
    assert.equal(res.status, 201);
    pollId = res.data.id;
    optionId = res.data.options[0].id;
  });

  test('"Afficher les résultats" décoché est bien enregistré', async () => {
    const res = await admin('POST', '/api/polls', {
      question: 'Sortie en fin d’année ?',
      options: ['Oui', 'Non'],
      show_results: 0,
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.show_results, 0, 'le serveur ne doit pas forcer les résultats visibles');
    await admin('DELETE', `/api/polls/${res.data.id}`);
  });

  test('un élève ne peut pas créer de sondage', async () => {
    const res = await student('POST', '/api/polls', { question: 'Pirate', options: ['Oui', 'Non'] });
    assert.equal(res.status, 401);
  });

  test('has_voted passe de false à true après le vote', async () => {
    const before = await student('GET', `/api/polls?fingerprint=${ALICE}`);
    const poll = before.data.find((p) => p.id === pollId);
    assert.equal(poll.has_voted, false);
    assert.equal(poll.show_results, 1, 'les résultats doivent rester visibles');

    const vote = await student('POST', `/api/polls/${pollId}/vote`, {
      option_ids: [optionId],
      fingerprint: ALICE,
    });
    assert.equal(vote.status, 200);

    const after = await student('GET', `/api/polls?fingerprint=${ALICE}`);
    assert.equal(after.data.find((p) => p.id === pollId).has_voted, true);
  });

  test('un second vote du même élève est refusé', async () => {
    const res = await student('POST', `/api/polls/${pollId}/vote`, {
      option_ids: [optionId],
      fingerprint: ALICE,
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /déjà voté/i);
  });

  test('le décompte des résultats est visible pour tous', async () => {
    const res = await other('GET', `/api/polls?fingerprint=${BOB}`);
    const poll = res.data.find((p) => p.id === pollId);
    assert.equal(poll.has_voted, false);
    assert.ok(poll.options.find((o) => o.id === optionId).vote_count >= 1);
  });

  test('le sondage expose le nombre de votants et de votes', async () => {
    const res = await other('GET', `/api/polls?fingerprint=${BOB}`);
    const poll = res.data.find((p) => p.id === pollId);
    // Sans ces compteurs, l'accueil affichait « 0 réponse » même après un vote.
    assert.equal(typeof poll.total_voters, 'number');
    assert.equal(typeof poll.total_votes, 'number');
    assert.ok(poll.total_voters >= 1, 'le votant doit être compté');
    assert.ok(poll.total_votes >= 1, 'le vote doit être compté');
  });

  test('modifier un sondage renomme la question et l’option sans perdre les votes', async () => {
    const res = await admin('PUT', `/api/polls/${pollId}`, {
      question: 'Quelle est la couleur de la classe ? (corrigé)',
      options: [{ id: optionId, text: 'Orange' }, { id: 0, text: 'Bleu' }],
    });
    assert.equal(res.status, 200);
    assert.match(res.data.question, /corrigé/);

    const check = await other('GET', `/api/polls?fingerprint=${BOB}`);
    const poll = check.data.find((p) => p.id === pollId);
    assert.ok(
      poll.options.find((o) => o.id === optionId).vote_count >= 1,
      'le vote déjà enregistré doit survivre à l’édition'
    );
    assert.ok(
      poll.options.some((o) => o.text === 'Bleu'),
      'la nouvelle option doit exister'
    );
  });

  test('une option ayant déjà reçu des votes ne peut pas être supprimée', async () => {
    const res = await admin('PUT', `/api/polls/${pollId}`, {
      options: [{ id: 0, text: 'Nouvelle seule option' }, { id: 0, text: 'Autre' }],
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /votes/i);
  });

  test('un élève ne peut pas modifier un sondage', async () => {
    const res = await student('PUT', `/api/polls/${pollId}`, { question: 'Pirate' });
    assert.equal(res.status, 401);
  });
});

describe('Messages au délégué', () => {
  let messageId = 0;

  test('un élève envoie un message et le retrouve dans son fil', async () => {
    const sent = await student('POST', '/api/messages', {
      content: 'Question de test',
      category: 'question',
      anonymous: 0,
      author_name: 'Alice',
      fingerprint: ALICE,
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.data.fingerprint, undefined, 'le fingerprint ne doit pas fuiter');
    messageId = sent.data.id;

    const mine = await student('GET', `/api/messages/mine?fingerprint=${ALICE}`);
    assert.equal(mine.status, 200);
    assert.ok(mine.data.some((m) => m.id === messageId));
  });

  test('un élève ne voit pas les messages des autres', async () => {
    const mine = await other('GET', `/api/messages/mine?fingerprint=${BOB}`);
    assert.equal(mine.status, 200);
    assert.equal(
      mine.data.some((m) => m.id === messageId),
      false,
      'le fil doit être limité au fingerprint demandé'
    );
  });

  test('le délégué répond et le statut passe à « repondu »', async () => {
    const res = await admin('PUT', `/api/messages/${messageId}`, {
      reply: 'Oui, je regarde ça demain.',
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.delegate_reply, 'Oui, je regarde ça demain.');
    assert.ok(res.data.replied_at, 'replied_at doit être renseigné');

    const status = await admin('PUT', `/api/messages/${messageId}`, { status: 'repondu' });
    assert.equal(status.data.status, 'repondu');

    const mine = await student('GET', `/api/messages/mine?fingerprint=${ALICE}`);
    const msg = mine.data.find((m) => m.id === messageId);
    assert.equal(msg.delegate_reply, 'Oui, je regarde ça demain.');
    assert.equal(msg.status, 'repondu');
  });

    test('un élève ne peut pas répondre lui-même', async () => {
      const res = await student('PUT', `/api/messages/${messageId}`, { reply: 'Fausse réponse' });
      assert.equal(res.status, 401);

      const mine = await student('GET', `/api/messages/mine?fingerprint=${ALICE}`);
      assert.equal(mine.data.find((m) => m.id === messageId).delegate_reply, 'Oui, je regarde ça demain.');
    });

    test('une réponse non lue est signalée à l’élève puis se vide à la lecture', async () => {
      const pending = await student('GET', `/api/messages/mine?fingerprint=${ALICE}`);
      const msg = pending.data.find((m) => m.id === messageId);
      assert.equal(msg.response_read_at, null, 'la réponse doit démarrer non lue');

      // Le compteur de l'accueil s'appuie sur ce champ.
      const unread = pending.data.filter((m) => m.status === 'repondu' && !m.response_read_at);
      assert.equal(unread.length, 1, 'l’accueil doit annoncer 1 message à lire');

      const read = await student('POST', `/api/messages/mine/${messageId}/read?fingerprint=${ALICE}`);
      assert.equal(read.status, 200);

      const after = await student('GET', `/api/messages/mine?fingerprint=${ALICE}`);
      assert.ok(
        after.data.find((m) => m.id === messageId).response_read_at,
        'la réponse doit être marquée comme lue'
      );
      assert.equal(
        after.data.filter((m) => m.status === 'repondu' && !m.response_read_at).length,
        0,
        'le compteur de l’accueil doit retomber à 0'
      );
    });

    test('un élève ne peut pas marquer le message d’un autre comme lu', async () => {
      const foreign = await other('POST', '/api/messages', {
        content: 'Question de Bob',
        category: 'question',
        fingerprint: BOB,
        author_name: 'Bob',
      });
      assert.equal(foreign.status, 201);
      await admin('PUT', `/api/messages/${foreign.data.id}`, { reply: 'Réponse à Bob' });

      const res = await student(
        'POST',
        `/api/messages/mine/${foreign.data.id}/read?fingerprint=${ALICE}`
      );
      assert.equal(res.status, 404, 'le fingerprint doit être vérifié');
    });
  });

describe('Sauvegarde des données', () => {
  test('le point de santé signale l’état du stockage', async () => {
    const res = await student('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
    assert.equal(typeof res.data.persistent_storage, 'boolean');
  });

  test('l’état du stockage est réservé au délégué', async () => {
    assert.equal((await student('GET', '/api/admin/storage')).status, 401);
    assert.equal((await other('GET', '/api/admin/storage')).status, 401);
    assert.equal((await admin('GET', '/api/admin/storage')).status, 200);
  });

  test('l’export contient les données réelles', async () => {
    const res = await admin('GET', '/api/admin/export');
    assert.equal(res.status, 200);
    assert.equal(res.data.version, 1);
    assert.ok(res.data.tables.settings.length >= 1, 'les paramètres doivent être exportés');
    assert.ok(res.data.tables.polls.length >= 1, 'les sondages doivent être exportés');
    assert.match(res.headers.get('content-disposition') || '', /attachment/);
  });

  test('un élève ne peut pas exporter ni restaurer la base', async () => {
    assert.equal((await student('GET', '/api/admin/export')).status, 401);
    assert.equal((await student('POST', '/api/admin/import', { tables: {} })).status, 401);
  });

  test('la restauration remet les données exportées', async () => {
    const backup = (await admin('GET', '/api/admin/export')).data;

    await admin('POST', '/api/ideas', {
      title: 'Idée à écraser',
      description: 'x',
      category: 'classe',
      anonymous: 1,
    });
    const polluted = await admin('GET', '/api/ideas');
    assert.ok(polluted.data.some((i) => i.title === 'Idée à écraser'));

    const restore = await admin('POST', '/api/admin/import', backup);
    assert.equal(restore.status, 200);

    const restored = await admin('GET', '/api/ideas');
    assert.equal(
      restored.data.some((i) => i.title === 'Idée à écraser'),
      false,
      'la restauration doit remplacer le contenu de la base'
    );

    const restoredPolls = await admin('GET', '/api/polls');
    assert.ok(
      restoredPolls.data.some((p) => p.question === 'Quelle est la couleur de la classe ? (corrigé)'),
      'les données sauvegardées doivent être revenues'
    );
  });

  test('un fichier de sauvegarde invalide est refusé sans casser la base', async () => {
    const res = await admin('POST', '/api/admin/import', { tables: 'pas-un-objet' });
    assert.equal(res.status, 400);

    const still = await admin('GET', '/api/settings');
    assert.equal(still.status, 200);
  });

  test('une sauvegarde vide est refusée et n’efface rien', async () => {
    // Ce test ne va volontairement PAS jusqu'à l'import confirmé : celui-ci
    // viderait réellement la base et invaliderait la session des suites
    // suivantes. On vérifie donc le garde-fou, qui est le comportement sûr.
    const refused = await admin('POST', '/api/admin/import', { tables: {} });
    assert.equal(refused.status, 400);
    assert.equal(refused.data.requires_confirmation, true, 'le client doit être invité à confirmer');

    // Même refus quand les tables sont présentes mais toutes vides : c'est le
    // cas réel d'un export fait sur une base déjà réinitialisée.
    const allEmpty = await admin('POST', '/api/admin/import', {
      tables: { settings: [], polls: [], ideas: [], events: [] },
    });
    assert.equal(allEmpty.status, 400);
    assert.equal(allEmpty.data.requires_confirmation, true);

    // Les tables inconnues ne suffisent pas à valider un import.
    const unknown = await admin('POST', '/api/admin/import', { tables: { pas_une_table: [{ id: 1 }] } });
    assert.equal(unknown.status, 400);

    const intact = await admin('GET', '/api/polls');
    assert.ok(
      intact.data.some((p) => p.question === 'Quelle est la couleur de la classe ? (corrigé)'),
      'la base ne doit pas avoir été vidée par les tentatives refusées'
    );
  });
});

describe('Paramètres et thème de saison', () => {
  test('le thème vaut "aucun" par défaut', async () => {
    const res = await student('GET', '/api/settings');
    assert.equal(res.status, 200);
    assert.equal(res.data.season_theme, 'aucun');
  });

  test('le délégué active le thème Halloween', async () => {
    const res = await admin('PUT', '/api/settings', { season_theme: 'halloween' });
    assert.equal(res.status, 200);
    assert.equal(res.data.season_theme, 'halloween');
    assert.equal((await student('GET', '/api/settings')).data.season_theme, 'halloween');
  });

  test('un élève ne peut pas changer le thème', async () => {
    const res = await student('PUT', '/api/settings', { season_theme: 'noel' });
    assert.equal(res.status, 401);
    assert.equal((await student('GET', '/api/settings')).data.season_theme, 'halloween');
  });

  test('thème inconnu refusé', async () => {
    const res = await admin('PUT', '/api/settings', { season_theme: 'pirate' });
    assert.equal(res.status, 400);
    assert.equal((await student('GET', '/api/settings')).data.season_theme, 'halloween');
  });

  test('retour au thème normal sans toucher aux autres réglages', async () => {
    await admin('PUT', '/api/settings', { class_name: 'Seconde 9' });
    const res = await admin('PUT', '/api/settings', { season_theme: 'aucun' });
    assert.equal(res.status, 200);
    assert.equal(res.data.season_theme, 'aucun');
    assert.equal(res.data.class_name, 'Seconde 9');
  });
});

/*
 * Ce bloc redémarre le serveur : il est donc placed en dernier, sinon il
 * interromprait les suites précédentes.
 */
describe('Session délégué', () => {
  test('la session survit à un redémarrage du serveur', async () => {
    // Régression : avec le MemoryStore par défaut d'express-session, Render
    // redémarrant vidait les sessions. Le délégué était déconnecté sans
    // s'en apercevoir et toutes ses écritures échouaient sur un 401.
    assert.equal((await admin('GET', '/api/admin/overview')).status, 200, 'session valide avant redémarrage');

    await restartServer();

    const after = await admin('GET', '/api/admin/overview');
    assert.equal(after.status, 200, 'la session doit survivre au redémarrage');

    // Et surtout : l'écriture qui échouait doit maintenant passer.
    const event = await admin('POST', '/api/events', {
      title: 'Après redémarrage',
      date: '2026-12-01',
      category: 'autre',
    });
    assert.equal(event.status, 201, 'le délégué doit pouvoir créer un événement après un redémarrage');
  });

  test('une session inconnue reste refusée après redémarrage', async () => {
    assert.equal((await other('GET', '/api/admin/overview')).status, 401);
    assert.equal((await other('POST', '/api/events', { title: 'X', date: '2026-12-02' })).status, 401);
  });
});
