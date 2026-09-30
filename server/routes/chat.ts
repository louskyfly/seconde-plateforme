import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { logAdminAction } from '../lib/maintenance.js';
import { cleanText, toDataUri, validateDataUri } from '../lib/files.js';
import { cleanFirstName, isValidFirstName } from '../lib/name.js';

const router = Router();

const MAX_CONTENT_LENGTH = 2000;
const MAX_MESSAGES_IN_PAGE = 50;
const SEND_WINDOW_MS = 30_000;
const SEND_WINDOW_MAX = 8;
const PUSH_THROTTLE_MS = 15_000;

const sendWindows = new Map<number, number[]>();
let lastPushAt = 0;

interface ChatUser {
  id: number;
  display_name: string;
  kind: string;
  fingerprint: string | null;
}

interface Conversation {
  id: number;
  title: string | null;
  is_group: number;
}

function getDelegateUser(): ChatUser {
  let user = db.prepare(`SELECT id, display_name, kind, fingerprint FROM chat_users WHERE kind = 'delegate'`).get() as
    | ChatUser
    | undefined;
  if (!user) {
    const settings = db.prepare('SELECT delegate_name FROM settings WHERE id = 1').get() as
      | { delegate_name: string }
      | undefined;
    const inserted = db
      .prepare(`INSERT INTO chat_users (display_name, kind, fingerprint) VALUES (?, 'delegate', NULL)`)
      .run(settings?.delegate_name || 'Délégué');
    user = { id: Number(inserted.lastInsertRowid), display_name: settings?.delegate_name || 'Délégué', kind: 'delegate', fingerprint: null };
  }
  return user;
}

function getDefaultGroup(): Conversation | undefined {
  return db
    .prepare('SELECT id, title, is_group FROM chat_conversations WHERE is_group = 1 ORDER BY id LIMIT 1')
    .get() as Conversation | undefined;
}

function isMember(conversationId: number, userId: number): boolean {
  const row = db
    .prepare('SELECT 1 AS ok FROM chat_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
  return !!row;
}

function cleanFingerprint(value: unknown): string {
  return cleanText(value, 64);
}

/** Utilisateur de la requête : délégué via session, élève via empreinte appareil. */
function findUser(req: any): ChatUser | null {
  if (req.session?.authenticated === true) return getDelegateUser();
  const fingerprint = cleanFingerprint(req.body?.fingerprint ?? req.query?.fingerprint);
  if (fingerprint.length < 8) return null;
  const user = db
    .prepare('SELECT id, display_name, kind, fingerprint FROM chat_users WHERE fingerprint = ?')
    .get(fingerprint) as ChatUser | undefined;
  if (user) {
    db.prepare('UPDATE chat_users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  }
  return user || null;
}

function readBody(req: any): { fingerprint: string; display_name: string } {
  return {
    fingerprint: cleanFingerprint(req.body?.fingerprint),
    display_name: cleanText(req.body?.display_name, 30),
  };
}

function conversationFor(user: ChatUser, requestedId: unknown): Conversation | null {
  const group = getDefaultGroup();
  if (!group) return null;
  const id = Number(requestedId) || group.id;
  if (id !== group.id) return null;
  if (!isMember(group.id, user.id)) return null;
  return group;
}

function shapeMessage(row: any) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_kind: row.sender_kind,
    content: row.content,
    has_image: row.image ? 1 : 0,
    created_at: row.created_at,
    // Remplacé plus loin par reactionCounts() : évite une requête par message.
    reactions: {} as Record<string, { total: number; mine: boolean }>,
  };
}

/** Inscription / mise à jour du pseudo de l'élève + ajout au groupe de classe. */
router.post('/join', (req, res) => {
  try {
    const group = getDefaultGroup();
    if (!group) {
      res.status(500).json({ error: 'Conversation indisponible' });
      return;
    }

    if (req.session?.authenticated === true) {
      const delegate = getDelegateUser();
      db.prepare('INSERT OR IGNORE INTO chat_members (conversation_id, user_id) VALUES (?, ?)').run(
        group.id,
        delegate.id
      );
      res.json({ user: { id: delegate.id, display_name: delegate.display_name, kind: delegate.kind }, conversation: group });
      return;
    }

    const { fingerprint, display_name: rawName } = readBody(req);
    let display_name = rawName;
    if (fingerprint.length < 8) {
      res.status(400).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const existing = db
      .prepare('SELECT id, display_name, kind, fingerprint FROM chat_users WHERE fingerprint = ?')
      .get(fingerprint) as ChatUser | undefined;

    // Même règle que pour les idées et la messagerie : un prénom seul, sans
    // espace. Le contrôle reste côté serveur, sinon un appel direct à l'API
    // contournerait le formulaire. Un élève déjà inscrit peut choisir un autre
    // prénom, mais pas un nom complet.
    if (display_name) {
      const firstName = cleanFirstName(display_name);
      if (!isValidFirstName(firstName)) {
        res.status(400).json({ error: 'Écris uniquement ton prénom, sans espace' });
        return;
      }
      display_name = firstName;
    } else if (!existing) {
      res.status(400).json({ error: 'Choisis ton prénom' });
      return;
    }

    let user: ChatUser;
    if (existing) {
      db.prepare(
        `UPDATE chat_users SET display_name = COALESCE(NULLIF(?, ''), display_name), last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(display_name, existing.id);
      user = { ...existing, display_name: display_name || existing.display_name };
    } else {
      const inserted = db
        .prepare(
          `INSERT INTO chat_users (display_name, kind, fingerprint) VALUES (?, 'student', ?)`
        )
        .run(display_name, fingerprint);
      user = { id: Number(inserted.lastInsertRowid), display_name, kind: 'student', fingerprint };
    }

    db.prepare('INSERT OR IGNORE INTO chat_members (conversation_id, user_id) VALUES (?, ?)').run(
      group.id,
      user.id
    );

    res.json({
      user: { id: user.id, display_name: user.display_name, kind: user.kind },
      conversation: group,
    });
  } catch (err) {
    console.error('Chat join error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/conversation', (req, res) => {
  try {
    const group = getDefaultGroup();
    if (!group) {
      res.status(500).json({ error: 'Conversation indisponible' });
      return;
    }
    const user = findUser(req);
    const unread = user && isMember(group.id, user.id) ? countUnread(group.id, user.id) : 0;
    res.json({ conversation: group, user: user ? { id: user.id, display_name: user.display_name, kind: user.kind } : null, unread });
  } catch (err) {
    console.error('Chat conversation error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Liste de tous les membres du chat, réservée au délégué.
 *
 * C'est la page « voir tous les membres » : chaque élève inscrit avec son nom,
 * sa date d'arrivée et son nombre de messages. Le délégué n'est pas compté
 * comme membre, il répond.
 */
router.get('/members', requireAuth, (req, res) => {
  try {
    const group = getDefaultGroup();
    if (!group) {
      res.status(500).json({ error: 'Conversation indisponible' });
      return;
    }

    const members = db
      .prepare(
        `SELECT u.id, u.display_name, u.kind,
                cm.joined_at AS joined_at,
                u.last_seen_at,
                (SELECT COUNT(*) FROM chat_messages m WHERE m.sender_id = u.id) AS message_count,
                (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.sender_id = u.id) AS last_message_at
         FROM chat_users u
         JOIN chat_members cm ON cm.user_id = u.id AND cm.conversation_id = ?
         WHERE u.kind = 'student'
         ORDER BY u.display_name COLLATE NOCASE`
      )
      .all(group.id);

    res.json(members);
  } catch (err) {
    console.error('Chat members error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function countUnread(conversationId: number, userId: number): number {
  const member = db
    .prepare('SELECT last_read_message_id FROM chat_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId) as { last_read_message_id: number | null } | undefined;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM chat_messages
       WHERE conversation_id = ? AND sender_id != ? AND id > COALESCE(?, 0)`
    )
    .get(conversationId, userId, member?.last_read_message_id ?? 0) as { count: number };
  return row.count;
}

router.get('/unread', (req, res) => {
  try {
    const user = findUser(req);
    const group = getDefaultGroup();
    if (!user || !group || !isMember(group.id, user.id)) {
      res.json({ unread: 0 });
      return;
    }
    res.json({ unread: countUnread(group.id, user.id) });
  } catch (err) {
    console.error('Chat unread error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Réactions autorisées : la liste est fermée, aucune valeur libre. */
export const REACTIONS = ['pouce', 'rire', 'coeur'] as const;

/**
 * Nombre de messages dont les réactions sont renvoyées à chaque rafraîchissement.
 *
 * Assez pour que les puces de l'écran restent justes, assez peu pour que le
 * rafraîchissement toutes les trois secondes ne fasse pas une requête par
 * message affiché.
 */
const REACTION_SYNC_MESSAGES = 50;
export type Reaction = (typeof REACTIONS)[number];

function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value);
}

/**
 * Réactions d'un message.
 *
 * Réservées aux élèves : le délégué ne réagit pas, il répond, donc l'API
 * refuse sa requête. Une réaction est un ajout/retrait : re-cliquer sur la
 * même réaction l'enlève.
 */
router.post('/messages/:id/reactions', (req, res) => {
  try {
    const user = findUser(req);
    if (!user) {
      res.status(401).json({ error: 'Identifiant appareil manquant' });
      return;
    }
    if (user.kind === 'delegate') {
      res.status(403).json({ error: 'Les réactions sont réservées aux élèves' });
      return;
    }

    const { reaction } = req.body || {};
    if (!isReaction(reaction)) {
      res.status(400).json({ error: 'Réaction inconnue' });
      return;
    }

    const messageId = Number(req.params.id);
    const group = getDefaultGroup();
    if (!group || !isMember(group.id, user.id)) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }

    // Le message doit appartenir à la conversation dont l'appelant a le droit
    // de parler. Vérifier seulement qu'il existe laisserait réagir sur un
    // message d'une autre conversation dès qu'il y en aura une.
    const message = db
      .prepare('SELECT id FROM chat_messages WHERE id = ? AND conversation_id = ?')
      .get(messageId, group.id) as { id: number } | undefined;
    if (!message) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    // Insertion ignorée si la réaction existe déjà : sert d'idempotence, puis on
    // bascule pour retirer. L'ordre INSERT puis DELETE compte, sinon retirer
    // une réaction absente ne ferait rien.
    const insert = db
      .prepare(
        'INSERT OR IGNORE INTO chat_reactions (message_id, reaction, user_id) VALUES (?, ?, ?)'
      )
      .run(messageId, reaction, user.id);

    let active = 1;
    if (insert.changes === 0) {
      db.prepare('DELETE FROM chat_reactions WHERE message_id = ? AND reaction = ? AND user_id = ?').run(
        messageId,
        reaction,
        user.id
      );
      active = 0;
    }

    res.json({
      reaction,
      active,
      // `user.id` est indispensable, sans quoi le `mine` renvoyé serait toujours
      // faux et la réactionposant clignoterait après chaque clic.
      counts: reactionCounts(messageId, user.id),
      mine: active === 1,
    });
  } catch (err) {
    console.error('Chat reaction error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Comptage des réactions d'un message, avec la liste de celles de l'élève. */
function reactionCounts(messageId: number, userId?: number) {
  const rows = db
    .prepare(
      'SELECT reaction, COUNT(*) AS total FROM chat_reactions WHERE message_id = ? GROUP BY reaction'
    )
    .all(messageId) as { reaction: string; total: number }[];

  const mineRows = userId
    ? (db
        .prepare('SELECT reaction FROM chat_reactions WHERE message_id = ? AND user_id = ?')
        .all(messageId, userId) as { reaction: string }[])
    : [];

  const mine = new Set(mineRows.map((r) => r.reaction));
  const counts: Record<string, { total: number; mine: boolean }> = {};
  for (const row of rows) {
    counts[row.reaction] = { total: row.total, mine: mine.has(row.reaction) };
  }
  return counts;
}

router.get('/messages', (req, res) => {
  try {
    const user = findUser(req);
    if (!user) {
      res.status(403).json({ error: 'Profil inconnu', needs_profile: true });
      return;
    }
    const conversation = conversationFor(user, req.query.conversation_id);
    if (!conversation) {
      res.status(403).json({ error: 'Accès refusé à cette conversation' });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || MAX_MESSAGES_IN_PAGE, MAX_MESSAGES_IN_PAGE);
    const after = Number(req.query.after) || 0;

    const rows = db
      .prepare(
        `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.image, m.created_at,
                u.display_name AS sender_name, u.kind AS sender_kind
         FROM chat_messages m
         JOIN chat_users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? AND m.id > ?
         ORDER BY m.id DESC
         LIMIT ?`
      )
      .all(conversation.id, after, limit) as any[];

    // Les réactions voyagent avec les messages : un aller-retour suffit à
    // afficher les compteurs et de savoir lesquelles l'élève a déjà posées.
    const messages = rows.reverse().map(shapeMessage);
    for (const message of messages) {
      message.reactions = reactionCounts(message.id, user.id);
    }

    // Les réactions des messages DÉJÀ chargés voyagent à part.
    //
    // Le fil se rafraîchit toutes les trois secondes, mais en ne demandant que
    // les messages plus récents que le dernier connu. Les réactions des autres
    // élèves sur un message ancien ne seraient donc jamais reçues : la puce
    // restait figée jusqu'au rechargement complet de la page. On renvoie donc,
    // à chaque rafraîchissement, les compteurs des derniers messages, même
    // quand leur texte n'est pas renvoyé.
    const recent = after
      ? (db
          .prepare(
            `SELECT m.id FROM chat_messages m
             WHERE m.conversation_id = ?
             ORDER BY m.id DESC
             LIMIT ?`
          )
          .all(conversation.id, REACTION_SYNC_MESSAGES) as { id: number }[])
      : [];

    const reactionUpdates: Record<number, Record<string, { total: number; mine: boolean }>> = {};
    for (const { id } of recent) {
      reactionUpdates[id] = reactionCounts(id, user.id);
    }

    res.json({ messages, conversation_id: conversation.id, reaction_updates: reactionUpdates });
  } catch (err) {
    console.error('Get chat messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/messages', (req, res) => {
  try {
    const user = findUser(req);
    if (!user) {
      res.status(403).json({ error: 'Profil inconnu', needs_profile: true });
      return;
    }
    const conversation = conversationFor(user, req.body?.conversation_id);
    if (!conversation) {
      res.status(403).json({ error: 'Accès refusé à cette conversation' });
      return;
    }

    const content = cleanText(req.body?.content, MAX_CONTENT_LENGTH);
    let imageData: string | null = null;
    if (req.body?.image) {
      const check = validateDataUri(req.body.image, ['image']);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
      imageData = toDataUri(check.file);
    }
    if (!content && !imageData) {
      res.status(400).json({ error: 'Message vide' });
      return;
    }

    const now = Date.now();
    const window = (sendWindows.get(user.id) || []).filter((t) => now - t < SEND_WINDOW_MS);
    if (window.length >= SEND_WINDOW_MAX) {
      res.status(429).json({ error: 'Trop de messages d’affilée, ralentis un peu' });
      return;
    }
    window.push(now);
    sendWindows.set(user.id, window);

    const inserted = db
      .prepare(
        `INSERT INTO chat_messages (conversation_id, sender_id, content, image) VALUES (?, ?, ?, ?)`
      )
      .run(conversation.id, user.id, content, imageData);
    db.prepare('UPDATE chat_conversations SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      conversation.id
    );

    const message = {
      id: Number(inserted.lastInsertRowid),
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: user.display_name,
      sender_kind: user.kind,
      content,
      has_image: imageData ? 1 : 0,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      // Un message neuf n'a aucune réaction. Le champ est renvoyé vide pour que
      // la réponse ait la même forme que celle de la lecture du fil : sans lui,
      // le message de l'élève qui vient d'envoyer s'affiche sans ses réactions,
      // alors que le fil le relit ensuite avec un objet vide.
      reactions: {} as Record<string, { total: number; mine: boolean }>,
    };

    if (user.kind !== 'delegate' && now - lastPushAt > PUSH_THROTTLE_MS) {
      lastPushAt = now;
      sendPushToAll({
        title: '💬 Nouveau message',
        body: `${user.display_name} : ${(content || '📷 Photo').slice(0, 90)}`,
        url: '/chat',
        tag: 'chat',
      });
    }

    res.status(201).json({ message });
  } catch (err) {
    console.error('Send chat message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/read', (req, res) => {
  try {
    const user = findUser(req);
    const group = getDefaultGroup();
    if (!user || !group || !isMember(group.id, user.id)) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    const last = db
      .prepare('SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE conversation_id = ?')
      .get(group.id) as { id: number };
    db.prepare(
      `UPDATE chat_members SET last_read_at = CURRENT_TIMESTAMP, last_read_message_id = ?
       WHERE conversation_id = ? AND user_id = ?`
    ).run(last.id, group.id, user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark chat read error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Image d'un message : servie par l'API (jamais un fichier public), avec en-têtes durcis. */
router.get('/messages/:id/image', (req, res) => {
  try {
    const user = findUser(req);
    if (!user) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    const row = db
      .prepare(
        `SELECT m.image, m.conversation_id FROM chat_messages m WHERE m.id = ?`
      )
      .get(req.params.id) as { image: string | null; conversation_id: number } | undefined;
    if (!row || !row.image) {
      res.status(404).json({ error: 'Image introuvable' });
      return;
    }
    if (!isMember(row.conversation_id, user.id)) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }

    const check = validateDataUri(row.image, ['image']);
    if (!check.ok) {
      res.status(415).json({ error: 'Image invalide' });
      return;
    }
    res.setHeader('Content-Type', check.file.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(check.file.buffer);
  } catch (err) {
    console.error('Get chat image error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Suppression d'un message : par son auteur, ou par le délégué (modération).
 * Dans les deux cas l'action est inscrite au journal d'administration.
 */
/**
 * Suppression d'une journée entière de discussion.
 *
 * Réservée au délégué. Le jour est interprété en heure locale du serveur, ce qui
 * correspond aux dates UTC stockées par SQLite : `date(m.created_at) = ?`.
 */
router.delete('/day/:date', requireAuth, (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Date invalide' });
      return;
    }

    const group = getDefaultGroup();
    if (!group) {
      res.status(404).json({ error: 'Conversation introuvable' });
      return;
    }

    const count = (
      db
        .prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = ? AND date(created_at) = ?')
        .get(group.id, date) as { n: number }
    ).n;

    if (count === 0) {
      res.status(404).json({ error: 'Aucun message à cette date' });
      return;
    }

    db.prepare('DELETE FROM chat_messages WHERE conversation_id = ? AND date(created_at) = ?').run(
      group.id,
      date
    );
    logAdminAction(db, 'chat_day_delete', 'chat_conversation', group.id, `Journée du ${date} supprimée (${count} message(s))`);

    res.json({ success: true, deleted: count, date });
  } catch (err) {
    console.error('Delete chat day error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/messages/:id', (req, res) => {
  try {
    const isAdmin = req.session?.authenticated === true;
    const messageId = Number(req.params.id);

    const row = db
      .prepare(
        `SELECT m.id, m.conversation_id, m.sender_id, u.display_name AS sender_name
         FROM chat_messages m JOIN chat_users u ON u.id = m.sender_id WHERE m.id = ?`
      )
      .get(messageId) as
      | { id: number; conversation_id: number; sender_id: number; sender_name: string }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    if (isAdmin) {
      db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
      logAdminAction(db, 'chat_message_delete', 'chat_message', messageId, `Message de ${row.sender_name} supprimé`);
      res.json({ success: true });
      return;
    }

    const user = findUser(req);
    if (!user || user.id !== row.sender_id) {
      res.status(403).json({ error: 'Suppression autorisée' });
      return;
    }
    db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
