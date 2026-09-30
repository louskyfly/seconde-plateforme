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
import Database from 'better-sqlite3';
import { initDatabase } from '../../dist/server/db/schema.js';

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

  test('le chat refuse un nom complet, pas seulement un prénom', async () => {
    // Sans cela, un appel direct à l'API autorisait d'écrire « Jean Dupont » dans
    // le chat, alors que la règle du site est prénom seul.
    const res = await other('POST', '/api/chat/join', {
      fingerprint: 'nouvel-appareil-xyz',
      display_name: 'Jean Dupont',
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /prénom/i);

    // Un prénom composé d'un trait d'union reste accepté.
    const valide = await other('POST', '/api/chat/join', {
      fingerprint: 'nouvel-appareil-xyz',
      display_name: 'Jean-Pierre',
    });
    assert.equal(valide.status, 200);
    assert.equal(valide.data.user.display_name, 'Jean-Pierre');
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

  test('purge automatique au redémarrage', async () => {
    // Sur Render, l'instance redémarre souvent : c'est là que la purge doit avoir
    // lieu. On écrit donc directement dans la base, avec une date vieille de cinq
    // jours, puis on relance le serveur et on vérifie que le message a disparu,
    // sans rien ajouter ni retirer d'autre : les tests suivants comptent les
    // messages de cette conversation.
    const avant = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1`);
    assert.equal(avant.status, 200);
    const idsAvant = avant.data.messages.map((m) => m.id).sort((a, b) => a - b);

    const base = new Database(path.join(tmpDir, 'test.db'));
    base.pragma('busy_timeout = 5000');
    const alice = base.prepare('SELECT id FROM chat_users WHERE fingerprint = ?').get(ALICE);
    const veille = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    const insere = base
      .prepare(
        'INSERT INTO chat_messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(1, alice.id, 'Message vieux, à purger', veille);
    assert.equal(insere.changes, 1);
    base.close();

    await restartServer();

    const apres = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1`);
    assert.equal(apres.status, 200);

    const contenu = apres.data.messages.map((m) => m.content);
    assert.ok(!contenu.includes('Message vieux, à purger'), 'le message de plus de deux jours a été purgé');
    assert.deepEqual(
      apres.data.messages.map((m) => m.id).sort((a, b) => a - b),
      idsAvant,
      'seul le message vieux a disparu'
    );

    // La purge est inscrite au journal : c'est une suppression automatique, elle
    // doit rester traçable même si personne n'a cliqué.
    const journal = await admin('GET', '/api/admin/log');
    assert.ok(
      journal.data.some((e) => e.action === 'chat_purge'),
      'la purge automatique est journalisée'
    );
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

  test('les élèves réagissent aux messages, le délégué non', async () => {
    const sent = await other('POST', '/api/chat/messages', {
      fingerprint: BOB,
      conversation_id: 1,
      content: 'Message à réagir',
    });
    const messageId = sent.data.message.id;

    // Réaction inconnue : refusée, la liste est fermée.
    const inconnue = await student('POST', `/api/chat/messages/${messageId}/reactions`, {
      fingerprint: ALICE,
      reaction: 'fusée',
    });
    assert.equal(inconnue.status, 400);

    // Le délégué ne réagit pas, il répond.
    const parDelegate = await admin('POST', `/api/chat/messages/${messageId}/reactions`, {
      reaction: 'pouce',
    });
    assert.equal(parDelegate.status, 403);

    // Un élève réagit, la réaction est comptée.
    const ajout = await student('POST', `/api/chat/messages/${messageId}/reactions`, {
      fingerprint: ALICE,
      reaction: 'pouce',
    });
    assert.equal(ajout.status, 200);
    assert.equal(ajout.data.active, 1);
    assert.equal(ajout.data.counts.pouce.total, 1);
    assert.equal(ajout.data.counts.pouce.mine, true);

    // Re-cliquer retire la réaction (une seule fois par élève et par type).
    const retrait = await student('POST', `/api/chat/messages/${messageId}/reactions`, {
      fingerprint: ALICE,
      reaction: 'pouce',
    });
    assert.equal(retrait.data.active, 0);
    assert.equal(retrait.data.counts.pouce, undefined, 'le compteur doit repasser à zéro');

    // Deux élèves différents, deux Votes distincts.
    await student('POST', `/api/chat/messages/${messageId}/reactions`, { fingerprint: ALICE, reaction: 'coeur' });
    await other('POST', `/api/chat/messages/${messageId}/reactions`, { fingerprint: BOB, reaction: 'coeur' });
    const fil = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1&after=0`);
    const message = fil.data.messages.find((m) => m.id === messageId);
    assert.equal(message.reactions.coeur.total, 2);
    assert.equal(message.reactions.coeur.mine, true, 'Alice voit sa propre réaction');
  });

  test('les réactions des messages déjà chargés reviennent à chaque rafraîchissement', async () => {
    // 1. Alice envoie un message.
    const msg = await student('POST', '/api/chat/messages', { fingerprint: ALICE, conversation_id: 1, content: 'sync' });
    const messageId = msg.data.message.id;

    // 2. Bob réagit.
    await other('POST', `/api/chat/messages/${messageId}/reactions`, { fingerprint: BOB, reaction: 'pouce' });

    // 3. Alice rafraîchit le fil AVANT le message (after = 0 pour charger tout).
    let fil = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1&after=0`);
    let message = fil.data.messages.find((m) => m.id === messageId);
    assert.equal(message.reactions.pouce.total, 1, 'réaction de Bob visible dès le chargement initial');
    assert.equal(message.reactions.pouce.mine, false, 'Alice ne l\'a pas posée');

    // 4. Alice rafraîchit avec after = messageId (simule le polling normal).
    //    Le message n'est pas renvoyé (son id n'est pas > after), mais reaction_updates doit l'être.
    fil = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1&after=${messageId}`);
    assert.equal(fil.data.messages.length, 0, 'aucun nouveau message');
    assert.ok(fil.data.reaction_updates, 'reaction_updates présent dans la réponse');
    assert.ok(fil.data.reaction_updates[messageId], 'mise à jour pour notre message');
    assert.equal(fil.data.reaction_updates[messageId].pouce.total, 1);
    assert.equal(fil.data.reaction_updates[messageId].pouce.mine, false);
  });

  test('le délégué supprime une journée entière de discussion', async () => {
    await student('POST', '/api/chat/messages', { fingerprint: ALICE, conversation_id: 1, content: 'Jour 1 A' });
    await student('POST', '/api/chat/messages', { fingerprint: ALICE, conversation_id: 1, content: 'Jour 1 B' });

    const today = new Date().toISOString().slice(0, 10);

    // Un élève ne peut pas le faire.
    const parEleve = await student('DELETE', `/api/chat/day/${today}?fingerprint=${ALICE}`);
    assert.equal(parEleve.status, 401);

    const res = await admin('DELETE', `/api/chat/day/${today}`);
    assert.equal(res.status, 200);
    assert.ok(res.data.deleted >= 2, 'les deux messages du jour doivent partir');

    const fil = await student('GET', `/api/chat/messages?fingerprint=${ALICE}&conversation_id=1&after=0`);
    assert.equal(
      fil.data.messages.filter((m) => m.content.startsWith('Jour 1')).length,
      0,
      'plus aucun message du jour ne doit subsister'
    );

    // Une date mal formée est refusée.
    assert.equal((await admin('DELETE', '/api/chat/day/pas-une-date')).status, 400);

    const log = await admin('GET', '/api/admin/log');
    assert.ok(log.data.some((entry) => entry.action === 'chat_day_delete'));
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

    // Le flag « mine » est bien retourné pour son auteur, pas pour les autres.
    const filAlice = await student('GET', `/api/ideas/${id}/replies?fingerprint=${ALICE}`);
    assert.equal(filAlice.data[0].mine, true);
    const filOther = await other('GET', `/api/ideas/${id}/replies?fingerprint=${BOB}`);
    assert.equal(filOther.data[0].mine, false);
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

describe('Évolution du schéma', () => {
  // Une base déjà en production ne rejoue pas les CREATE TABLE : ils portent
  // tous « IF NOT EXISTS ». Les colonnes ajoutées après doivent donc être
  // rattrapées au démarrage, sinon les routes qui les lisent échouent avec une
  // erreur SQLite « no such column » alors que la base est par ailleurs saine.
  function colonnes(db, table) {
    return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  }

  function baseAncienne() {
    // Forme d'avant les colonnes d'arbitrage des idées, avec une ligne réelle
    // pour vérifier que la remise à niveau ne perd rien.
    const memoire = new Database(':memory:');
    memoire.exec(`
      CREATE TABLE ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'classe',
        anonymous INTEGER DEFAULT 0,
        author_name TEXT,
        status TEXT DEFAULT 'a_etudier',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO ideas (title, description) VALUES ('Idée existante', 'déjà en base');
    `);
    return memoire;
  }

  test('les colonnes ajoutées après la création de la table sont ajoutées', () => {
    const db = baseAncienne();
    assert.ok(!colonnes(db, 'ideas').includes('delegate_replied_at'));

    initDatabase(db);

    const ideas = colonnes(db, 'ideas');
    assert.ok(ideas.includes('delegate_response'), 'delegate_response ajoutée');
    assert.ok(ideas.includes('delegate_replied_at'), 'delegate_replied_at ajoutée');
  });

  test('les idées déjà enregistrées survivent à la remise à niveau', () => {
    const db = baseAncienne();
    initDatabase(db);

    const idee = db.prepare('SELECT title FROM ideas WHERE id = 1').get();
    assert.equal(idee.title, 'Idée existante');
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM ideas').get().n,
      1,
      'aucune ligne perdue ni dupliquée'
    );
  });

  test('la remise à niveau est idempotente', () => {
    const db = baseAncienne();
    initDatabase(db);
    // Relancer l'initialisation ne doit pas échouer sur une colonne existante,
    // ce qui arriverait à chaque redémarrage du serveur.
    initDatabase(db);
    initDatabase(db);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ideas').get().n, 1);
  });

  test('la table des membres de groupe accepte un nom sans fiche élève', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    // `student_id` est facultatif : c'est ce qui permet à un élève d'écrire un
    // nom qui ne figure dans aucune fiche.
    const membre = colonnes(db, 'student_group_members');
    assert.ok(membre.includes('member_name'), 'le nom tapé est conservé');
    assert.ok(membre.includes('member_key'), 'le nom normalisé est conservé');

    const notnull = db.prepare('PRAGMA table_info(student_group_members)').all();
    const studentId = notnull.find((c) => c.name === 'student_id');
    assert.equal(studentId.notnull, 0, 'student_id n’est plus obligatoire');
  });

  test('une base ancienne est convertie sans perdre ses membres', () => {
    // Base d'avant le passage aux noms libres : student_id était obligatoire.
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birthday TEXT
      );
      INSERT INTO students (first_name, last_name) VALUES ('Camille', 'Roussel');

      CREATE TABLE student_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_private INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'en_attente',
        created_by_fingerprint TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        validated_at DATETIME,
        validated_by TEXT
      );
      INSERT INTO student_groups (name) VALUES ('Ancien groupe');

      CREATE TABLE student_group_members (
        group_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        added_by_fingerprint TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, student_id)
      );
      INSERT INTO student_group_members (group_id, student_id) VALUES (1, 1);
    `);

    assert.ok(!colonnes(db, 'student_group_members').includes('member_key'), 'base au format ancien');

    initDatabase(db);

    const membre = db.prepare('SELECT * FROM student_group_members WHERE group_id = 1').get();
    assert.equal(membre.student_id, 1, 'le membre garde sa fiche élève');
    assert.equal(membre.member_name, 'Camille Roussel', 'son nom est reconstitué');
    assert.equal(membre.member_key, 'camille roussel');

    // Et la table est bien devenue assouplie.
    const studentId = db
      .prepare('PRAGMA table_info(student_group_members)')
      .all()
      .find((c) => c.name === 'student_id');
    assert.equal(studentId.notnull, 0);
  });

  test('la conversion des membres de groupe est idempotente', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birthday TEXT
      );
      CREATE TABLE student_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_private INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'en_attente',
        created_by_fingerprint TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        validated_at DATETIME,
        validated_by TEXT
      );
      CREATE TABLE student_group_members (
        group_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        added_by_fingerprint TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, student_id)
      );
      INSERT INTO students (first_name, last_name) VALUES ('Camille', 'Roussel');
      INSERT INTO student_groups (name) VALUES ('Ancien groupe');
      INSERT INTO student_group_members (group_id, student_id) VALUES (1, 1);
    `);

    initDatabase(db);
    // Relancer l'initialisation ne doit pas reconvertir la table, ce qui
    // arriverait à chaque redémarrage du serveur.
    initDatabase(db);
    initDatabase(db);

    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM student_group_members').get().n,
      1,
      'le membre n’est ni perdu ni dupliqué'
    );
  });

  test('la purge du chat ne dépend d\'aucune colonne marquée', () => {
    // La purge supprime physiquement les messages de plus de deux jours : aucune
    // colonne « purgée » n'est nécessaire, et le schéma ne doit pas en garder
    // une qui ferait croire à un second mécanisme.
    const db = new Database(':memory:');
    initDatabase(db);
    assert.ok(!colonnes(db, 'chat_messages').includes('purged_at'));
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

describe('Élèves et groupes', () => {
  let alice;
  let bob;
  let clara;
  let dan;

  /** Clé normalisée d'un membre, celle que la route de retrait attend. */
  const memberKey = (s) =>
    encodeURIComponent(
      `${s.first_name} ${s.last_name}`
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    );

  test('inscription du délégué', async () => {
    const res = await admin('POST', '/api/auth/login', { password: ADMIN_PASSWORD });
    assert.equal(res.status, 200);
  });

  test('un élève peut être ajouté et lu par tout le monde', async () => {
    const refuse = await student('POST', '/api/students', { first_name: 'Marie', last_name: 'Dupont' });
    assert.equal(refuse.status, 401, 'un élève ne peut pas créer de fiche');

    const res = await admin('POST', '/api/students', {
      first_name: 'Marie',
      last_name: 'Dupont',
      birthday: '03-14',
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.birthday, '03-14');

    // Prénom et nom trop courts, ou nom composé, sont refusés.
    assert.equal((await admin('POST', '/api/students', { first_name: 'M', last_name: 'Dupont' })).status, 400);
    assert.equal((await admin('POST', '/api/students', { first_name: 'Jean Paul', last_name: 'Dupont' })).status, 201);

    const liste = await student('GET', '/api/students');
    assert.equal(liste.status, 200, 'le tableau de classe est visible de tous');
    assert.ok(Array.isArray(liste.data) && liste.data.length >= 2);
    assert.equal(liste.data[0].last_name, 'Dupont', 'trié par nom');
  });

  test('une date d’anniversaire invalide est normalisée', async () => {
    // Le 31 février n'existe pas : on ne doit pas le laisser passer.
    const faux = await admin('POST', '/api/students', { first_name: 'Zoé', last_name: 'Petit', birthday: '02-31' });
    assert.equal(faux.status, 201);
    assert.equal(faux.data.birthday, null);

    const vide = await admin('POST', '/api/students', { first_name: 'Paul', last_name: 'Petit' });
    assert.equal(vide.data.birthday, null);
  });

  test('un groupe doit faire 3 ou 4 élèves pour être validé', async () => {
    alice = (await admin('POST', '/api/students', { first_name: 'Alice', last_name: 'Aubry' })).data;
    bob = (await admin('POST', '/api/students', { first_name: 'Bob', last_name: 'Bernard' })).data;
    clara = (await admin('POST', '/api/students', { first_name: 'Clara', last_name: 'Caron' })).data;
    dan = (await admin('POST', '/api/students', { first_name: 'Dan', last_name: 'Durand' })).data;

    const tropPetit = await admin('POST', '/api/groups', {
      name: 'Petits',
      student_ids: [alice.id, bob.id],
    });
    assert.equal(tropPetit.status, 400, '2 élèves ne suffisent pas');
    assert.match(tropPetit.data.error, /au moins 3/);

    // Cinq élèves bien distincts : le refus ne doit pas venir d'un doublon.
    const cinq = [];
    for (const [prenom, nom] of [
      ['Sol', 'Soleil'],
      ['Tao', 'Tasse'],
      ['Ulysse', 'Urbain'],
    ]) {
      cinq.push((await admin('POST', '/api/students', { first_name: prenom, last_name: nom })).data);
    }

    const tropGrand = await admin('POST', '/api/groups', {
      name: 'Trop grands',
      student_ids: [alice.id, bob.id, clara.id, dan.id, ...cinq.map((s) => s.id)],
    });
    assert.equal(tropGrand.status, 400, 'au-delà de 4 élèves, c’est refusé');
    assert.match(tropGrand.data.error, /d[ée]passer 4/);

    // Le groupe refusé ne doit pas rester en base.
    const apresEchec = (await admin('GET', '/api/groups')).data;
    assert.equal(apresEchec.filter((g) => g.name === 'Trop grands').length, 0);

    const bon = await admin('POST', '/api/groups', {
      name: 'Groupe 1',
      student_ids: [alice.id, bob.id, clara.id],
    });
    assert.equal(bon.status, 201);
    assert.equal(bon.data.status, 'valide');
  });

  test('un groupe validé est figé : plus personne ne peut le modifier', async () => {
    const groupes = (await admin('GET', '/api/groups')).data;
    const groupe = groupes.find((g) => g.name === 'Groupe 1');

    const ajout = await admin('POST', `/api/groups/${groupe.id}/propose-member`, {
      student_id: dan.id,
      fingerprint: 'fingerprint-de-test-1234',
    });
    assert.equal(ajout.status, 409, 'un groupe validé ne se complète plus');

    // Le membre est désigné par sa clé normalisée, pas par son identifiant de
    // fiche : c'est ce qui permet de retirer aussi un nom tapé.
    const retrait = await admin('DELETE', `/api/groups/${groupe.id}/members/${memberKey(alice)}`);
    assert.equal(retrait.status, 409);
  });

  test('un élève déjà validé ne peut pas rejoindre un second groupe validé', async () => {
    const deuxieme = await admin('POST', '/api/groups', {
      name: 'Groupe 2',
      student_ids: [bob.id, clara.id, dan.id],
    });
    assert.equal(deuxieme.status, 409, 'Bob et Clara sont déjà pris');
    assert.match(deuxieme.data.error, /déjà dans un groupe validé/i);
  });

  test('un groupe privé se propose puis se valide', async () => {
    const eleve1 = (await admin('POST', '/api/students', { first_name: 'Emma', last_name: 'Elsa' })).data;
    const eleve2 = (await admin('POST', '/api/students', { first_name: 'Fanny', last_name: 'Fabre' })).data;
    const eleve3 = (await admin('POST', '/api/students', { first_name: 'Gaspard', last_name: 'Guerin' })).data;
    const auteur = 'fingerprint-de-test-5678';

    // Né en attente : son auteur le complète, le délégué valide ensuite.
    const cree = await student('POST', '/api/groups', {
      name: 'Groupe privé',
      is_private: true,
      student_ids: [eleve1.id],
      fingerprint: auteur,
    });
    assert.equal(cree.status, 201);
    assert.equal(cree.data.status, 'en_attente');

    // Un élève peut proposer son camarade, mais pas s'ajouter lui-même sans
    // identifiant appareil.
    const sansEmpreinte = await student('POST', `/api/groups/${cree.data.id}/propose-member`, {
      student_id: eleve2.id,
    });
    assert.equal(sansEmpreinte.status, 401);

    // Un groupe privé n'appartient pas à tout le monde : un autre élève ne peut
    // pas s'y glisser, même en connaissant son identifiant.
    const intrus = await other('POST', `/api/groups/${cree.data.id}/propose-member`, {
      student_id: eleve2.id,
      fingerprint: 'fingerprint-de-test-9012',
    });
    assert.equal(intrus.status, 403, 'un tiers ne complete pas un groupe privé');

    const proposition = await student('POST', `/api/groups/${cree.data.id}/propose-member`, {
      student_id: eleve2.id,
      fingerprint: auteur,
    });
    assert.equal(proposition.status, 200);
    assert.equal(proposition.data.members.length, 2);

    // Tant que le groupe est en attente, l'auteur et le délégué peuvent encore
    // retirer un élève.
    const retrait = await student(
      'DELETE',
      `/api/groups/${cree.data.id}/members/${memberKey(eleve2)}?fingerprint=${auteur}`
    );
    assert.equal(retrait.status, 200);
    assert.equal(retrait.data.members.length, 1);

    // Le délégué n'est pas moins bien placé que l'auteur pour le faire.
    const retraitDelegue = await admin('DELETE', `/api/groups/${cree.data.id}/members/${memberKey(eleve1)}`);
    assert.equal(retraitDelegue.status, 200);
    assert.equal(retraitDelegue.data.members.length, 0, 'le groupe est vide après les deux retraits');

    // L'auteur reconstruit un groupe valide : 3 élèves, comme le demande la règle.
    let dernierAjout;
    for (const eleve of [eleve1, eleve2, eleve3]) {
      dernierAjout = await student('POST', `/api/groups/${cree.data.id}/propose-member`, {
        student_id: eleve.id,
        fingerprint: auteur,
      });
      assert.equal(dernierAjout.status, 200);
    }
    assert.equal(dernierAjout.data.members.length, 3);

    const validation = await admin('PUT', `/api/groups/${cree.data.id}/status`, { status: 'valide' });
    assert.equal(validation.status, 200);
    assert.equal(validation.data.status, 'valide');
  });

  test('un groupe privé ne fuite pas vers les élèves', async () => {
    const eleve1 = (await admin('POST', '/api/students', { first_name: 'Yanis', last_name: 'Yilmaz' })).data;
    const eleve2 = (await admin('POST', '/api/students', { first_name: 'Zoé', last_name: 'Ziani' })).data;
    const eleve3 = (await admin('POST', '/api/students', { first_name: 'Aya', last_name: 'Amrani' })).data;

    const prive = (await admin('POST', '/api/groups', {
      name: 'Groupe confidentiel',
      is_private: true,
      student_ids: [eleve1.id, eleve2.id, eleve3.id],
    })).data;

    const public_ = (await admin('POST', '/api/groups', {
      name: 'Groupe ouvert',
      student_ids: [],
      validate_now: false,
    })).data;

    // Le délégué voit tout, y compris le groupe privé.
    const vueDelegue = (await admin('GET', '/api/groups')).data;
    assert.ok(
      vueDelegue.some((g) => g.id === prive.id && g.is_private === 1),
      'le délégué voit ses groupes privés'
    );

    // Un élève, lui, ne doit rien voir du groupe privé : ni son nom, ni ses
    // membres. Avant, la route était publique et renvoyait tout.
    const vueEleve = (await student('GET', '/api/groups')).data;
    assert.ok(
      !vueEleve.some((g) => g.id === prive.id),
      'le groupe privé est invisible pour un élève'
    );
    assert.ok(
      !JSON.stringify(vueEleve).includes('Groupe confidentiel'),
      'le nom du groupe privé ne fuite pas'
    );
    assert.ok(
      vueEleve.some((g) => g.id === public_.id),
      'les groupes non privés restent visibles'
    );
  });

  test('un groupe validé ne peut pas être rouvert', async () => {
    const e1 = (await admin('POST', '/api/students', { first_name: 'Nina', last_name: 'Nguyen' })).data;
    const e2 = (await admin('POST', '/api/students', { first_name: 'Oscar', last_name: 'Olivier' })).data;
    const e3 = (await admin('POST', '/api/students', { first_name: 'Sara', last_name: 'Sauvage' })).data;

    const groupe = (await admin('POST', '/api/groups', {
      name: 'Figé',
      student_ids: [e1.id, e2.id, e3.id],
    })).data;
    assert.equal(groupe.status, 'valide');

    const rouvrir = await admin('PUT', `/api/groups/${groupe.id}/status`, { status: 'en_attente' });
    assert.equal(rouvrir.status, 409, 'un groupe validé ne se rouvre pas');
    assert.match(rouvrir.data.error, /rouvert/i);

    // Il reste bien validé, et sa composition est intouchable.
    const apres = (await admin('GET', '/api/groups')).data.find((g) => g.id === groupe.id);
    assert.equal(apres.status, 'valide');
    assert.equal(apres.members.length, 3);
    assert.equal((await admin('DELETE', `/api/groups/${groupe.id}/members/${e1.id}`)).status, 409);
  });

﻿  /**
   * Trois élèves neufs, libres de tout groupe validé par un test précédent.
   *
   * Les prénoms ne contiennent que des lettres : le serveur retire les chiffres
   * des noms, un prénom comme « A0 » se retrouverait à une lettre et serait
   * refusé. C'est le comportement attendu de cleanName, pas un bug.
   */
  async function troisElevesLibres(prefixe, combien = 3) {
    const liste = [];
    for (let i = 0; i < combien; i += 1) {
      const initiale = String.fromCharCode(97 + i); // a, b, c, d
      liste.push(
        (await admin('POST', '/api/students', { first_name: `${prefixe}${initiale}`, last_name: `Libre${prefixe}` }))
          .data
      );
    }
    return liste;
  }

  test('un élève crée son groupe mais ne peut pas le valider', async () => {
    const [e1, e2, e3] = await troisElevesLibres('A');
    const empreinte = 'fingerprint-eleve-groupe-0001';

    const cree = await student('POST', '/api/groups', {
      name: 'Groupe des élèves',
      student_ids: [e1.id, e2.id, e3.id],
      fingerprint: empreinte,
    });
    assert.equal(cree.status, 201, 'un élève peut créer son groupe');
    assert.equal(cree.data.status, 'en_attente', 'il naît en attente, jamais validé');
    assert.equal(cree.data.members.length, 3);

    // Même en demandant explicitement la validation, le serveur l'ignore : la
    // validation est une décision du délégué, pas une option du formulaire.
    const [f1, f2, f3] = await troisElevesLibres('B');
    const avecValidation = await student('POST', '/api/groups', {
      name: 'Tentative',
      student_ids: [f1.id, f2.id, f3.id],
      validate_now: true,
      validated_by: 'Moi-même',
      fingerprint: 'fingerprint-eleve-groupe-0002',
    });
    assert.equal(avecValidation.status, 201);
    assert.equal(avecValidation.data.status, 'en_attente', 'l’auto-validation est ignorée');

    // Le groupe existe bien du côté du délégué, qui peut le valider.
    const vueDelegue = (await admin('GET', '/api/groups')).data.find((g) => g.id === cree.data.id);
    assert.equal(vueDelegue.status, 'en_attente');

    const validation = await admin('PUT', `/api/groups/${cree.data.id}/status`, { status: 'valide' });
    assert.equal(validation.status, 200);
    assert.equal(validation.data.status, 'valide');
  });

  test('un élève ne peut pas empiler des groupes en attente', async () => {
    const empreinte = 'fingerprint-eleve-pile-0001';
    const [a, b, c] = await troisElevesLibres('C');
    const noms = [a.id, b.id, c.id];

    const premier = await student('POST', '/api/groups', {
      name: 'Premier',
      student_ids: noms,
      fingerprint: empreinte,
    });
    assert.equal(premier.status, 201);

    const second = await student('POST', '/api/groups', {
      name: 'Second',
      student_ids: noms,
      fingerprint: empreinte,
    });
    assert.equal(second.status, 409, 'un seul groupe en attente à la fois');
  });

  test('un élève ne voit pas le groupe privé d’un camarade, mais voit le sien', async () => {
    const empreinte = 'fingerprint-eleve-prive-0001';
    const [a, b, c] = await troisElevesLibres('D');
    const noms = [a.id, b.id, c.id];

    const prive = await student('POST', '/api/groups', {
      name: 'Le groupe secret',
      is_private: true,
      student_ids: noms,
      fingerprint: empreinte,
    });
    assert.equal(prive.status, 201);
    assert.equal(prive.data.is_private, 1);

    // L'auteur voit son groupe privé, marqué comme le sien.
    const chezMoi = (await student('GET', `/api/groups?fingerprint=${empreinte}`)).data;
    const mien = chezMoi.find((g) => g.id === prive.data.id);
    assert.ok(mien, 'le créateur voit son groupe privé');
    assert.equal(mien.mine, true);
    assert.equal(mien.peut_modifier, true);

    // Un autre appareil ne voit ni le groupe, ni son nom.
    const chezAutre = (await other('GET', '/api/groups?fingerprint=fingerprint-autre-appareil-9')).data;
    assert.ok(!chezAutre.some((g) => g.id === prive.data.id), 'invisible pour les autres');
    assert.ok(!JSON.stringify(chezAutre).includes('Le groupe secret'), 'le nom ne fuit pas');

    // L'empreinte du signataire n'est jamais renvoyée.
    assert.ok(
      !JSON.stringify(chezMoi).includes('fingerprint-eleve-prive-0001'),
      'l’empreinte de l’appareil ne sort pas'
    );
  });

  test('un élève ne modifie que son propre groupe', async () => {
    const empreinte = 'fingerprint-eleve-modif-0001';
    const autre = 'fingerprint-eleve-modif-0002';
    const [a, b, c, d] = await troisElevesLibres('E', 4);
    const dehors = (await admin('POST', '/api/students', { first_name: 'Tintin', last_name: 'Tournesol' }))
      .data;

    const groupe = (await student('POST', '/api/groups', {
      name: 'Groupe à protéger',
      student_ids: [a.id, b.id, c.id, d.id],
      fingerprint: empreinte,
    })).data;

    // Retirer un camarade : autorisé pour l'auteur.
    const retrait = await student('DELETE', `/api/groups/${groupe.id}/members/${memberKey(a)}?fingerprint=${empreinte}`);
    assert.equal(retrait.status, 200, 'l’auteur peut corriger son groupe');
    assert.equal(retrait.data.members.length, 3);

    // Le même retrait par un autre appareil : refusé.
    const intrus = await other('DELETE', `/api/groups/${groupe.id}/members/${memberKey(b)}?fingerprint=${autre}`);
    assert.equal(intrus.status, 403, 'un autre élève ne retire pas un camarade');

    const ajoutIntrus = await other('POST', `/api/groups/${groupe.id}/propose-member`, {
      student_id: dehors.id,
      fingerprint: autre,
    });
    assert.equal(ajoutIntrus.status, 200, 'un groupe ouvert accepte la proposition');

    const suppressionIntruse = await other('DELETE', `/api/groups/${groupe.id}?fingerprint=${autre}`);
    assert.equal(suppressionIntruse.status, 403, 'un élève ne supprime pas le groupe d’un autre');

    // La suppression par l'auteur, elle, passe.
    assert.equal((await student('DELETE', `/api/groups/${groupe.id}?fingerprint=${empreinte}`)).status, 200);
    assert.equal((await admin('GET', '/api/groups')).data.some((g) => g.id === groupe.id), false);
  });

  test('un élève écrit les noms de son groupe sans passer par le tableau', async () => {
    const empreinte = 'fingerprint-noms-libres-001';
    // Aucun de ces noms n'est dans le tableau des élèves : c'est tout l'intérêt,
    // un élève doit pouvoir former son groupe même si le délégué n'a pas
    // enregistré tout le monde.
    const cree = await student('POST', '/api/groups', {
      name: 'Noms libres',
      member_names: ['Lucas Rey', 'Emma Zola', 'Noé Vidal'],
      fingerprint: empreinte,
    });

    assert.equal(cree.status, 201);
    assert.equal(cree.data.status, 'en_attente', 'un élève ne valide pas lui-même');
    assert.equal(cree.data.members.length, 3);
    assert.equal(cree.data.members.map((m) => m.name).join(', '), 'Lucas Rey, Emma Zola, Noé Vidal');
    assert.ok(
      cree.data.members.every((m) => m.student_id === null),
      'aucun nom ne correspond à une fiche du tableau'
    );

    // Le délégué peut quand même valider : c'est bien 3 élèves.
    const validation = await admin('PUT', `/api/groups/${cree.data.id}/status`, { status: 'valide' });
    assert.equal(validation.status, 200);
  });

  test('un nom tapé qui existe dans le tableau y est rattaché', async () => {
    const empreinte = 'fingerprint-noms-lies-0001';
    // Alice Aubry est dans le tableau depuis plus haut. Lucas Rey n'y est pas.
    const cree = await student('POST', '/api/groups', {
      name: 'Mélange',
      member_names: ['Alice Aubry', 'Lucas Rey', 'Emma Zola'],
      fingerprint: empreinte,
    });
    assert.equal(cree.status, 201);

    const aliceMembre = cree.data.members.find((m) => m.name === 'Alice Aubry');
    const lucasMembre = cree.data.members.find((m) => m.name === 'Lucas Rey');

    assert.equal(aliceMembre.student_id, alice.id, 'Alice est rattachée à sa fiche');
    assert.equal(lucasMembre.student_id, null, 'Lucas n’a pas de fiche');

    // Conséquence : la règle « un élève dans un seul groupe validé » vaut pour
    // Alice, et Alice est déjà dans un groupe validé plus haut.
    const validation = await admin('PUT', `/api/groups/${cree.data.id}/status`, { status: 'valide' });
    assert.equal(validation.status, 409, 'Alice est déjà dans un groupe validé');
    assert.match(validation.data.error, /déjà dans un groupe validé/i);
  });

  test('les doublons tapés sont écartés, quelle que soit la casse et les accents', async () => {
    const cree = await student('POST', '/api/groups', {
      name: 'Doublons',
      member_names: ['Zoé Petit', 'zoé petit', '  Zoe   Petit  ', 'Paul Arns'],
      fingerprint: 'fingerprint-doublons-0001',
    });

    assert.equal(cree.status, 201);
    assert.equal(cree.data.members.length, 2, 'Zoé n’apparaît qu’une fois, Paul une fois');
    assert.deepEqual(
      cree.data.members.map((m) => m.name).sort(),
      ['Paul Arns', 'Zoé Petit']
    );
  });

  test('un nom hors tableau se retire avec sa clé, pas avec un identifiant', async () => {
    const empreinte = 'fingerprint-retrait-nom-01';
    const cree = await student('POST', '/api/groups', {
      name: 'Retrait par nom',
      member_names: ['Hector Malot', 'Iris Vandel', 'Karim Nez'],
      fingerprint: empreinte,
    });
    assert.equal(cree.status, 201);

    const cle = encodeURIComponent('iris vandel');
    const retrait = await student('DELETE', `/api/groups/${cree.data.id}/members/${cle}?fingerprint=${empreinte}`);
    assert.equal(retrait.status, 200);
    assert.equal(retrait.data.members.length, 2);
    assert.ok(!retrait.data.members.some((m) => m.name === 'Iris Vandel'), 'Iris est retirée');

    // Et on peut la remettre par son nom, pas par un identifiant.
    const ajout = await student('POST', `/api/groups/${cree.data.id}/propose-member`, {
      member_name: 'Iris Vandel',
      fingerprint: empreinte,
    });
    assert.equal(ajout.status, 200);
    assert.equal(ajout.data.members.length, 3);
  });

  test('un groupe composé de noms hors tableau se valide normalement', async () => {
    const groupe = (await student('POST', '/api/groups', {
      name: 'Tous hors tableau',
      member_names: ['Sarah Kalfon', 'Yanis Berrebi', 'Lou Marceau'],
      fingerprint: 'fingerprint-hors-tableau-01',
    })).data;

    // La règle « un élève dans un seul groupe » ne peut pas s'appliquer : ces
    // trois élèves n'ont pas de fiche. Le groupe est donc valide normalement.
    const validation = await admin('PUT', `/api/groups/${groupe.id}/status`, { status: 'valide' });
    assert.equal(validation.status, 200, 'des élèves absents du tableau n’empêchent pas la validation');
  });

  test('un nom tapé est nettoyé comme un nom de fiche', async () => {
    const cree = await student('POST', '/api/groups', {
      name: 'Nettoyage',
      member_names: ['Jean@Paul#Dupont', 'A', '   ', 'Marie Curie'],
      fingerprint: 'fingerprint-nettoyage-0001',
    });

    assert.equal(cree.status, 201);
    assert.deepEqual(
      cree.data.members.map((m) => m.name),
      ['Jean Paul Dupont', 'Marie Curie'],
      'les caractères interdits tombent, les noms trop courts sont ignorés'
    );
  });

  test('un groupe validé n’est plus modifiable par son auteur', async () => {
    const empreinte = 'fingerprint-eleve-fige-0001';
    const [a, b, c] = await troisElevesLibres('F');
    const dehors = (await admin('POST', '/api/students', { first_name: 'Milou', last_name: 'Mornet' })).data;

    const groupe = (await student('POST', '/api/groups', {
      name: 'Groupe figé',
      student_ids: [a.id, b.id, c.id],
      fingerprint: empreinte,
    })).data;

    const validation = await admin('PUT', `/api/groups/${groupe.id}/status`, { status: 'valide' });
    assert.equal(validation.status, 200, 'le délégué valide bien le groupe');
    assert.equal(validation.data.status, 'valide');

    // L'auteur ne peut plus rien changer, même avec la bonne empreinte.
    const retrait = await student('DELETE', `/api/groups/${groupe.id}/members/${memberKey(a)}?fingerprint=${empreinte}`);
    assert.equal(retrait.status, 409, 'la composition est figée');

    const ajout = await student('POST', `/api/groups/${groupe.id}/propose-member`, {
      student_id: dehors.id,
      fingerprint: empreinte,
    });
    assert.equal(ajout.status, 409, 'pas d’ajout après validation');

    const suppression = await student('DELETE', `/api/groups/${groupe.id}?fingerprint=${empreinte}`);
    assert.equal(suppression.status, 409, 'un groupe validé ne se supprime que par le délégué');

    // Et l'interface ne propose plus rien à modifier.
    const vue = (await student('GET', `/api/groups?fingerprint=${empreinte}`)).data.find(
      (g) => g.id === groupe.id
    );
    assert.equal(vue.peut_modifier, false, 'l’interface n’offrira plus rien à modifier');
  });

  test('un groupe privé ne se modifie que par son auteur ou le délégué', async () => {
    const auteur = 'fingerprint-auteur-prive-01';
    const [a, b, c] = await troisElevesLibres('G');
    const dehors = (await admin('POST', '/api/students', { first_name: 'Nix', last_name: 'Nolan' })).data;

    const prive = (await student('POST', '/api/groups', {
      name: 'Prive',
      is_private: true,
      student_ids: [a.id, b.id, c.id],
      fingerprint: auteur,
    })).data;

    const [d, e, f] = await troisElevesLibres('H');
    const ouvert = (await student('POST', '/api/groups', {
      name: 'Ouvert',
      student_ids: [d.id, e.id, f.id],
      fingerprint: 'fingerprint-auteur-ouvert-1',
    })).data;

    const hors = await other('POST', `/api/groups/${prive.id}/propose-member`, {
      student_id: dehors.id,
      fingerprint: 'fingerprint-intrus-prive-01',
    });
    assert.equal(hors.status, 403, 'le groupe privé se protège');

    const surOuvert = await other('POST', `/api/groups/${ouvert.id}/propose-member`, {
      student_id: dehors.id,
      fingerprint: 'fingerprint-camarade-ouvert1',
    });
    assert.equal(surOuvert.status, 200, 'un groupe ouvert accepte les propositions');

    // Le délégué garde la main partout, y compris sur un groupe privé d'élève.
    const parDelegue = await admin('POST', `/api/groups/${prive.id}/propose-member`, {
      student_id: dehors.id,
    });
    assert.equal(parDelegue.status, 200, 'le délégué complète un groupe privé');
  });

  test('un groupe refusé libère ses élèves', async () => {
    const libere1 = (await admin('POST', '/api/students', { first_name: 'Hana', last_name: 'Hamon' })).data;
    const libere2 = (await admin('POST', '/api/students', { first_name: 'Ivan', last_name: 'Imbert' })).data;
    const libere3 = (await admin('POST', '/api/students', { first_name: 'Jade', last_name: 'Jacquin' })).data;

    const groupe = (await admin('POST', '/api/groups', {
      name: 'Temporaire',
      student_ids: [libere1.id, libere2.id, libere3.id],
    })).data;
    assert.equal(groupe.status, 'valide');

    // Tant que le groupe est validé, ils sont pris.
    const autre = await admin('POST', '/api/groups', {
      name: 'Reprise',
      student_ids: [libere1.id, libere2.id, libere3.id],
    });
    assert.equal(autre.status, 409);

    const refus = await admin('PUT', `/api/groups/${groupe.id}/status`, { status: 'refuse' });
    assert.equal(refus.status, 200);

    // Le refus libère les trois élèves : ils peuvent être revalidés ailleurs.
    const reprise = await admin('POST', '/api/groups', {
      name: 'Reprise',
      student_ids: [libere1.id, libere2.id, libere3.id],
    });
    assert.equal(reprise.status, 201);
  });

  test('supprimer un élève le retire de son groupe', async () => {
    const cible = (await admin('POST', '/api/students', { first_name: 'Léo', last_name: 'Leroy' })).data;
    const compa1 = (await admin('POST', '/api/students', { first_name: 'Mia', last_name: 'Moret' })).data;
    const compa2 = (await admin('POST', '/api/students', { first_name: 'Noé', last_name: 'Noel' })).data;

    const groupe = (await admin('POST', '/api/groups', {
      name: 'AvecLeo',
      student_ids: [cible.id, compa1.id, compa2.id],
    })).data;

    const res = await admin('DELETE', `/api/students/${cible.id}`);
    assert.equal(res.status, 200);

    const apres = (await admin('GET', '/api/groups')).data.find((g) => g.id === groupe.id);
    assert.equal(apres.members.length, 2, 'les deux autres restent dans le groupe');
  });

  test('un statut de groupe inconnu est refusé', async () => {
    const eleve = (await admin('POST', '/api/students', { first_name: 'Iris', last_name: 'Issor' })).data;
    const g = (await admin('POST', '/api/groups', { name: 'Statut', student_ids: [eleve.id], validate_now: false })).data;
    assert.equal((await admin('PUT', `/api/groups/${g.id}/status`, { status: 'peut-etre' })).status, 400);
  });
});

describe('Visites', () => {
  test('le délégué est déjà connecté', async () => {
    assert.equal((await admin('GET', '/api/stats')).status, 200);
  });

  test('une visite se compte sans authentification', async () => {
    const sansId = await student('POST', '/api/stats/visit', {});
    assert.equal(sansId.status, 400, 'il faut une empreinte appareil');

    const res = await student('POST', '/api/stats/visit', {
      fingerprint: 'visiteur-alpha-0001',
      page: '/',
    });
    assert.equal(res.status, 200);
  });

  test('recharger la page ne crée pas un second visiteur', async () => {
    // Trois ouvertures du même appareil le même jour.
    for (let i = 0; i < 3; i++) {
      await student('POST', '/api/stats/visit', {
        fingerprint: 'visiteur-beta-0002',
        page: '/calendrier',
      });
    }

    const stats = await admin('GET', '/api/stats/visits');
    assert.equal(stats.status, 200);

    assert.ok(stats.data.days[0], 'le jour courant doit être présent');

    const visiteur = stats.data.identites.find((v) => v.page === '/calendrier');
    assert.ok(visiteur, 'l’appareil beta doit apparaître');
    assert.equal(visiteur.hits, 3, 'trois ouvertures, un seul visiteur');

    // Le libellé reste court et anonyme : jamais l'empreinte complète.
    assert.match(visiteur.label, /^Appareil [a-z0-9]{6}$/);
  });

  test('les statistiques de visites sont réservées au délégué', async () => {
    assert.equal((await other('GET', '/api/stats/visits')).status, 401);
  });

  test('l’empreinte n’est jamais stockée en clair', async () => {
    const empreinte = 'fingerprint-visite-a-hacher-01';
    await student('POST', '/api/stats/visit', { fingerprint: empreinte, page: '/idees' });

    // La route masque bien la valeur dans sa réponse.
    const stats = await admin('GET', '/api/stats/visits');
    assert.ok(
      !JSON.stringify(stats.data).includes(empreinte),
      'l’empreinte ne sort pas dans les statistiques'
    );

    // Et elle n'est pas stockée telle quelle non plus : c'est ce qui empêche de
    // relier une ligne de visite à un message ou à un vote du même élève.
    const base = new Database(path.join(tmpDir, 'test.db'));
    base.pragma('busy_timeout = 5000');
    const stocke = base.prepare('SELECT fingerprint FROM visits').all().map((r) => r.fingerprint);
    base.close();

    assert.ok(stocke.length > 0, 'des visites ont bien été enregistrées');
    assert.ok(
      stocke.every((f) => f !== empreinte),
      'aucune empreinte en clair dans la table'
    );
    assert.ok(
      stocke.every((f) => /^[0-9a-f]{32}$/.test(f)),
      'chaque empreinte est un condensat de longueur fixe'
    );
    assert.equal(new Set(stocke).size, stocke.length, 'deux élèves différents ne fusionnent pas');
  });

  test('le total d’ouvertures est plafonné, le nombre d’élèves ne l’est pas', async () => {
    const empreinte = 'fingerprint-visite-plafond-01';
    for (let i = 0; i < 220; i += 1) {
      await student('POST', '/api/stats/visit', { fingerprint: empreinte, page: '/' });
    }

    const stats = await admin('GET', '/api/stats/visits');
    const aujourdhui = stats.data.days.find((d) => d.day === new Date().toISOString().slice(0, 10));
    assert.ok(aujourdhui, 'le jour courant est présent');

    // 220 ouvertures envoyées pour le même appareil : le compteur de cet appareil
    // est plafonné. C'est ce qu'un appel en boucle gonflait avant.
    const appareil = stats.data.identites.filter((i) => i.hits > 1);
    assert.ok(appareil.length > 0, 'les 220 ouvertures ont bien été comptées');
    assert.ok(
      stats.data.identites.every((i) => i.hits <= 200),
      `chaque appareil reste sous le plafond (max ${Math.max(...stats.data.identites.map((i) => i.hits))})`
    );

    // Et l'élève reste compté une seule fois, malgré les rechargements.
    assert.ok(aujourdhui.visitors >= 1, 'l’appareil reste compté comme visiteur');
  });

  test('les visites de plus de 90 jours sont supprimées', async () => {
    const base = new Database(path.join(tmpDir, 'test.db'));
    base.pragma('busy_timeout = 5000');
    const ancien = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    base
      .prepare('INSERT INTO visits (fingerprint, day, page) VALUES (?, ?, ?)')
      .run('abcd1234abcd1234abcd1234abcd1234', ancien, '/');
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM visits WHERE day = ?').get(ancien).n, 1);

    // Une nouvelle visite déclenche la purge.
    await student('POST', '/api/stats/visit', { fingerprint: 'fingerprint-purge-000001', page: '/' });
    base.close();

    const apres = new Database(path.join(tmpDir, 'test.db'));
    apres.pragma('busy_timeout = 5000');
    assert.equal(apres.prepare('SELECT COUNT(*) AS n FROM visits WHERE day = ?').get(ancien).n, 0);
    apres.close();
  });
});

describe('Membres du chat', () => {
  test('le délégué voit tous les membres, pas les élèves', async () => {
    assert.equal((await student('GET', '/api/chat/members')).status, 401);

    const res = await admin('GET', '/api/chat/members');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.some((m) => m.display_name === 'Alice'), 'Alice s’est inscrite plus haut');

    // Le délégué n'est pas listé comme membre : il répond, il ne participe pas.
    assert.ok(res.data.every((m) => m.kind === 'student'));

    // Les champs attendus par l'interface sont tous présents.
    const alice = res.data.find((m) => m.display_name === 'Alice');
    assert.equal(typeof alice.message_count, 'number');
    assert.ok('joined_at' in alice);
  });
});

describe('Sessions de révision', () => {
  test('le délégué est connecté', async () => {
    assert.equal((await admin('GET', '/api/stats')).status, 200);
  });

  test('une session se crée, se lit et se modifie', async () => {
    // Sans session de délégué ni empreinte, la création reste fermée.
    assert.equal((await student('POST', '/api/revisions', { title: ' maths', date: '2030-01-10' })).status, 401);

    const cree = await admin('POST', '/api/revisions', {
      title: 'Révisions fractions',
      subject: 'maths',
      date: '2030-01-10',
      time: '14:00',
      duration: 90,
      location: 'Salle B',
      description: 'Fiches 3 et 4',
    });
    assert.equal(cree.status, 201);
    assert.equal(cree.data.duration, 90);
    assert.equal(cree.data.location, 'Salle B');

    const modifie = await admin('PUT', `/api/revisions/${cree.data.id}`, { location: 'Salle C' });
    assert.equal(modifie.status, 200);
    assert.equal(modifie.data.location, 'Salle C');
    assert.equal(modifie.data.title, 'Révisions fractions', 'les champs non transmis sont conservés');
  });

  test('les entrées invalides sont refusées ou corrigées', async () => {
    // Titre manquant, date absente, date impossible : refusés.
    assert.equal((await admin('POST', '/api/revisions', { date: '2030-01-10' })).status, 400);
    assert.equal((await admin('POST', '/api/revisions', { title: 'Sans date' })).status, 400);
    assert.equal((await admin('POST', '/api/revisions', { title: 'Jour faux', date: '2030-02-31' })).status, 400);

    // Une heure impossible n'est pas fatale : la session est « toute la journée ».
    const sansHeure = await admin('POST', '/api/revisions', {
      title: 'Journée entière',
      date: '2030-01-10',
      time: '25:00',
    });
    assert.equal(sansHeure.status, 201);
    assert.equal(sansHeure.data.time, null);
  });

  test('une durée hors bornes est ramenée dans les limites', async () => {
    const tropCourte = await admin('POST', '/api/revisions', {
      title: 'Éclair',
      date: '2030-01-11',
      duration: 2,
    });
    assert.equal(tropCourte.data.duration, 15);

    const tropLongue = await admin('POST', '/api/revisions', {
      title: 'Marathon',
      date: '2030-01-12',
      duration: 99999,
    });
    assert.equal(tropLongue.data.duration, 480);
  });

  test('les élèves voient les sessions à venir, pas celles passées', async () => {
    // Une session d'hier, invisible pour l'élève.
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await admin('POST', '/api/revisions', { title: 'Passée', date: hier });

    const aVenir = await student('GET', '/api/revisions');
    assert.equal(aVenir.status, 200);
    assert.ok(aVenir.data.length >= 1);
    assert.ok(
      aVenir.data.every((s) => s.date >= new Date().toISOString().slice(0, 10)),
      'aucune session passée dans la liste élève'
    );

    // Le délégué demande explicitement l'historique.
    const tout = await admin('GET', '/api/revisions?upcoming=false');
    assert.ok(tout.data.some((s) => s.title === 'Passée'));
  });

  test('une session se supprime', async () => {
    const session = (await admin('POST', '/api/revisions', { title: 'Annulée', date: '2030-02-01' })).data;

    assert.equal((await student('DELETE', `/api/revisions/${session.id}`)).status, 401);

    const res = await admin('DELETE', `/api/revisions/${session.id}`);
    assert.equal(res.status, 200);

    // Supprimer deux fois n'est pas une erreur fatale, la session n'existe plus.
    assert.equal((await admin('PUT', `/api/revisions/${session.id}`, { title: 'X' })).status, 404);
  });
});

describe('Sessions de révision proposées par les élèves', () => {
  const ALICE = 'empreinte-eleve-alice-01';
  const BOB = 'empreinte-eleve-bob-001';

  test('un élève propose sa propre session', async () => {
    const res = await student('POST', '/api/revisions', {
      title: 'Fractions entre nous',
      subject: 'maths',
      date: '2030-03-04',
      time: '17:00',
      duration: 60,
      location: 'Salle B',
      description: 'Fiches 3 et 4',
      fingerprint: ALICE,
    });

    assert.equal(res.status, 201, 'un élève peut créer une session');
    assert.equal(res.data.title, 'Fractions entre nous');
    assert.equal(res.data.mine, true);
    assert.equal(res.data.peut_modifier, true);

    // L'empreinte est ce qui identifie l'auteur : elle ne doit jamais sortir,
    // sinon n'importe qui pourrait s'approprier une session qu'il n'a pas créée.
    assert.ok(
      !('created_by_fingerprint' in res.data),
      'l’empreinte du signataire n’est pas renvoyée'
    );
  });

  test('les autres élèves voient la session mais ne peuvent pas la gérer', async () => {
    const vue = await student('GET', `/api/revisions?fingerprint=${BOB}`);
    assert.equal(vue.status, 200);

    const session = vue.data.find((s) => s.title === 'Fractions entre nous');
    assert.ok(session, 'la session d’un autre élève reste visible');
    assert.equal(session.mine, false, 'elle n’est pas la sienne');
    assert.equal(session.peut_modifier, false, 'il ne peut donc pas la modifier');
    assert.ok(!('created_by_fingerprint' in session), 'l’empreinte ne sort pas dans la liste');

    // Et le serveur refuse, même en appelant l'API directement.
    const modif = await student('PUT', `/api/revisions/${session.id}`, {
      location: 'Salle A',
      fingerprint: BOB,
    });
    assert.equal(modif.status, 403);

    const suppr = await student('DELETE', `/api/revisions/${session.id}?fingerprint=${BOB}`);
    assert.equal(suppr.status, 403);

    // Sans empreinte non plus : personne n'est identifiable, donc 401 et non 403.
    assert.equal((await student('PUT', `/api/revisions/${session.id}`, { location: 'Salle A' })).status, 401);
    assert.equal((await student('DELETE', `/api/revisions/${session.id}`)).status, 401);

    // La session est intacte.
    const apres = await admin('GET', '/api/revisions?upcoming=false');
    assert.equal(apres.data.find((s) => s.id === session.id).location, 'Salle B');
  });

  test('l’auteur peut corriger et supprimer sa session', async () => {
    const liste = await student('GET', `/api/revisions?fingerprint=${ALICE}`);
    const session = liste.data.find((s) => s.title === 'Fractions entre nous');
    assert.ok(session, 'l’élève retrouve la session qu’il a proposée');
    assert.equal(session.mine, true);

    const modif = await student('PUT', `/api/revisions/${session.id}`, {
      duration: 120,
      fingerprint: ALICE,
    });
    assert.equal(modif.status, 200);
    assert.equal(modif.data.duration, 120);

    const suppr = await student('DELETE', `/api/revisions/${session.id}?fingerprint=${ALICE}`);
    assert.equal(suppr.status, 200);
    assert.equal(
      (await student('GET', `/api/revisions?fingerprint=${ALICE}`)).data.some((s) => s.id === session.id),
      false
    );
  });

  test('le délégué garde la main sur toutes les sessions', async () => {
    const res = await student('POST', '/api/revisions', {
      title: 'Session élève',
      date: '2030-03-05',
      fingerprint: BOB,
    });
    assert.equal(res.status, 201);

    const vue = await admin('GET', '/api/revisions?upcoming=false');
    assert.equal(vue.data.find((s) => s.id === res.data.id).peut_modifier, true);

    // Même proposée par un élève, il peut la corriger et l'annuler.
    assert.equal((await admin('PUT', `/api/revisions/${res.data.id}`, { title: 'Session annulée' })).status, 200);
    assert.equal((await admin('DELETE', `/api/revisions/${res.data.id}`)).status, 200);
  });

  test('une session d’élève reste lisible sans empreinte', async () => {
    const res = await student('POST', '/api/revisions', {
      title: 'Session ouverte',
      date: '2030-03-06',
      fingerprint: ALICE,
    });
    assert.equal(res.status, 201);

    // Lecture anonyme : c'est le principe de la page, tout le monde voit le planning.
    const anonyme = await student('GET', '/api/revisions');
    const session = anonyme.data.find((s) => s.id === res.data.id);
    assert.ok(session, 'visible sans s’identifier');
    assert.equal(session.mine, false);
    assert.equal(session.peut_modifier, false);
  });
});
