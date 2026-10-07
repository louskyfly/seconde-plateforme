import { Router } from 'express';
import { query, execute, queryOne, transaction } from '../db/index.js';
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

async function getDelegateUser(): Promise<ChatUser> {
  let user = await queryOne<ChatUser>(`SELECT id, display_name, kind, fingerprint FROM chat_users WHERE kind = 'delegate'`);
  if (!user) {
    const settings = await queryOne<{ delegate_name: string }>('SELECT delegate_name FROM settings WHERE id = 1');
    const inserted = await execute(
      `INSERT INTO chat_users (display_name, kind, fingerprint) VALUES ($1, 'delegate', NULL) RETURNING id`,
      [settings?.delegate_name || 'Délégué']
    );
    user = { id: inserted.lastInsertId as number, display_name: settings?.delegate_name || 'Délégué', kind: 'delegate', fingerprint: null };
  }
  return user;
}

async function getDefaultGroup(): Promise<Conversation | undefined> {
  return queryOne<Conversation>('SELECT id, title, is_group FROM chat_conversations WHERE is_group = TRUE ORDER BY id LIMIT 1');
}

async function isMember(conversationId: number, userId: number): Promise<boolean> {
  const row = await queryOne<{ ok: number }>('SELECT 1 AS ok FROM chat_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
  return !!row;
}

function cleanFingerprint(value: unknown): string {
  return cleanText(value, 64);
}

async function findUser(req: any): Promise<ChatUser | null> {
  if (req.session?.authenticated === true) return getDelegateUser();
  const fingerprint = cleanFingerprint(req.body?.fingerprint ?? req.query?.fingerprint);
  if (fingerprint.length < 8) return null;
  const user = await queryOne<ChatUser>(
    'SELECT id, display_name, kind, fingerprint FROM chat_users WHERE fingerprint = $1',
    [fingerprint]
  );
  if (user) {
    await execute('UPDATE chat_users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
  }
  return user || null;
}

function readBody(req: any): { fingerprint: string; display_name: string } {
  return {
    fingerprint: cleanFingerprint(req.body?.fingerprint),
    display_name: cleanText(req.body?.display_name, 30),
  };
}

async function conversationFor(user: ChatUser, requestedId: unknown): Promise<Conversation | null> {
  const group = await getDefaultGroup();
  if (!group) return null;
  const id = Number(requestedId) || group.id;
  if (id !== group.id) return null;
  if (!(await isMember(group.id, user.id))) return null;
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
    reactions: {} as Record<string, { total: number; mine: boolean }>,
  };
}

async function reactionCounts(messageId: number, userId: number) {
  const rows = await query<{ reaction: string; total: number; mine: boolean }>(
    `SELECT reaction, COUNT(*) AS total,
            BOOL_OR(user_id = $2) AS mine
     FROM chat_reactions
     WHERE message_id = $1
     GROUP BY reaction`,
    [messageId, userId]
  );
  const counts: Record<string, { total: number; mine: boolean }> = {};
  for (const row of rows) {
    counts[row.reaction] = { total: Number(row.total), mine: row.mine };
  }
  return counts;
}

const REACTION_SYNC_MESSAGES = 50;

const REACTIONS = ['pouce', 'rire', 'coeur'] as const;
type Reaction = typeof REACTIONS[number];

function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value);
}

router.post('/join', async (req, res) => {
  try {
    const group = await getDefaultGroup();
    if (!group) {
      res.status(500).json({ error: 'Conversation indisponible' });
      return;
    }

    if (req.session?.authenticated === true) {
      const delegate = await getDelegateUser();
      await execute('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [group.id, delegate.id]);
      res.json({ user: { id: delegate.id, display_name: delegate.display_name, kind: delegate.kind }, conversation: group });
      return;
    }

    const { fingerprint, display_name: rawName } = readBody(req);
    let display_name = rawName;
    if (fingerprint.length < 8) {
      res.status(400).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    const existing = await queryOne<ChatUser>(
      'SELECT id, display_name, kind, fingerprint FROM chat_users WHERE fingerprint = $1',
      [fingerprint]
    );

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
      await execute(
        `UPDATE chat_users SET display_name = COALESCE(NULLIF($1, ''), display_name), last_seen_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [display_name, existing.id]
      );
      user = { ...existing, display_name: display_name || existing.display_name };
    } else {
      const result = await execute(
        `INSERT INTO chat_users (display_name, kind, fingerprint) VALUES ($1, 'student', $2) RETURNING id`,
        [display_name, fingerprint]
      );
      user = { id: result.lastInsertId as number, display_name, kind: 'student', fingerprint };
    }

    await execute('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [group.id, user.id]);

    res.json({
      user: { id: user.id, display_name: user.display_name, kind: user.kind },
      conversation: group,
    });
  } catch (err) {
    console.error('Chat join error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/conversation', async (req, res) => {
  try {
    const group = await getDefaultGroup();
    if (!group) {
      res.status(500).json({ error: 'Conversation indisponible' });
      return;
    }
    const user = await findUser(req);
    const unread = user && (await isMember(group.id, user.id)) ? await countUnread(group.id, user.id) : 0;
    res.json({ conversation: group, user: user ? { id: user.id, display_name: user.display_name, kind: user.kind } : null, unread });
  } catch (err) {
    console.error('Chat conversation error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function countUnread(conversationId: number, userId: number): Promise<number> {
  const member = await queryOne<{ last_read_message_id: number }>(
    'SELECT last_read_message_id FROM chat_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM chat_messages
     WHERE conversation_id = $1 AND sender_id != $1 AND id > COALESCE($2, 0)`,
    [conversationId, userId, member?.last_read_message_id ?? 0]
  );
  return Number(row?.count ?? 0);
}

router.get('/unread', async (req, res) => {
  try {
    const user = await findUser(req);
    const group = await getDefaultGroup();
    if (!user || !group || !(await isMember(group.id, user.id))) {
      res.json({ unread: 0 });
      return;
    }
    res.json({ unread: await countUnread(group.id, user.id) });
  } catch (err) {
    console.error('Chat unread error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/messages/:id/reactions', async (req, res) => {
  try {
    const user = await findUser(req);
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
    const group = await getDefaultGroup();
    if (!group || !(await isMember(group.id, user.id))) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }

    const message = await queryOne<{ id: number }>(
      'SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2',
      [messageId, group.id]
    );
    if (!message) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    const insert = await execute(
      'INSERT INTO chat_reactions (message_id, reaction, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [messageId, reaction, user.id]
    );

    let active = 1;
    if (insert.rowCount === 0) {
      await execute(
        'DELETE FROM chat_reactions WHERE message_id = $1 AND reaction = $2 AND user_id = $3',
        [messageId, reaction, user.id]
      );
      active = 0;
    }

    const counts = await reactionCounts(messageId, user.id);
    res.json({ reaction, active, counts, mine: active === 1 });
  } catch (err) {
    console.error('Chat reaction error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const user = await findUser(req);
    if (!user) {
      res.status(403).json({ error: 'Profil inconnu', needs_profile: true });
      return;
    }
    const conversation = await conversationFor(user, req.query.conversation_id);
    if (!conversation) {
      res.status(403).json({ error: 'Accès refusé à cette conversation' });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || MAX_MESSAGES_IN_PAGE, MAX_MESSAGES_IN_PAGE);
    const after = Number(req.query.after) || 0;

    const rows = await query<any>(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.image, m.created_at,
              u.display_name AS sender_name, u.kind AS sender_kind
       FROM chat_messages m
       JOIN chat_users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 AND m.id > $2
       ORDER BY m.id DESC
       LIMIT $3`,
      [conversation.id, after, limit]
    );

    const messages = rows.reverse().map(shapeMessage);
    for (const message of messages) {
      message.reactions = await reactionCounts(message.id, user.id);
    }

    const recent = after
      ? await query<{ id: number }>(
          `SELECT m.id FROM chat_messages m
           WHERE m.conversation_id = $1
           ORDER BY m.id DESC
           LIMIT $2`,
        [conversation.id, 50]
      )
      : [];

    const reactionUpdates: Record<number, Record<string, { total: number; mine: boolean }>> = {};
    for (const { id } of recent) {
      reactionUpdates[id] = await reactionCounts(id, user.id);
    }

    res.json({ messages, conversation_id: conversation.id, reaction_updates: reactionUpdates });
  } catch (err) {
    console.error('Get chat messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const user = await findUser(req);
    if (!user) {
      res.status(403).json({ error: 'Profil inconnu', needs_profile: true });
      return;
    }
    const conversation = await conversationFor(user, req.body?.conversation_id);
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
      res.status(429).json({ error: 'Trop de messages d\'affilée, ralentis un peu' });
      return;
    }
    window.push(now);
    sendWindows.set(user.id, window);

    const result = await execute(
      `INSERT INTO chat_messages (conversation_id, sender_id, content, image) VALUES ($1, $2, $3, $4) RETURNING id`,
      [conversation.id, user.id, content, imageData]
    );

    await execute('UPDATE chat_conversations SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1', [conversation.id]);

    const message = {
      id: result.lastInsertId as number,
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: user.display_name,
      sender_kind: user.kind,
      content,
      has_image: imageData ? 1 : 0,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
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

router.post('/read', async (req, res) => {
  try {
    const user = await findUser(req);
    const group = await getDefaultGroup();
    if (!user || !group || !(await isMember(group.id, user.id))) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    const last = await queryOne<{ id: number }>(
      'SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE conversation_id = $1',
      [group.id]
    );
    await execute(
      `INSERT INTO chat_members (conversation_id, user_id, last_read_message_id, last_read_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_message_id = $3, last_read_at = CURRENT_TIMESTAMP`,
      [group.id, user.id, last?.id ?? 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark chat read error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/messages/:id/image', async (req, res) => {
  try {
    const user = await findUser(req);
    if (!user) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    const row = await queryOne<{ image: string | null; conversation_id: number }>(
      `SELECT m.image, m.conversation_id FROM chat_messages m WHERE m.id = $1`,
      [req.params.id]
    );
    if (!row || !row.image) {
      res.status(404).json({ error: 'Image introuvable' });
      return;
    }
    if (!(await isMember(row.conversation_id, user.id))) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }

    const buffer = Buffer.from(row.image, 'base64');
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': String(buffer.length),
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  } catch (err) {
    console.error('Get chat image error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/day/:date', requireAuth, async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      res.status(400).json({ error: 'Date invalide' });
      return;
    }

    const group = await getDefaultGroup();
    if (!group) {
      res.status(404).json({ error: 'Conversation introuvable' });
      return;
    }

    const count = await queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = $1 AND date(created_at) = $2',
      [group.id, req.params.date]
    );

    if (!count || count.n === 0) {
      res.status(404).json({ error: 'Aucun message à cette date' });
      return;
    }

    await execute('DELETE FROM chat_messages WHERE conversation_id = $1 AND date(created_at) = $2', [
      group.id,
      req.params.date,
    ]);
    logAdminAction('chat_day_delete', 'chat_conversation', group.id, `Journée du ${req.params.date} supprimée (${count.n} message(s))`);

    res.json({ success: true, deleted: count.n, date: req.params.date });
  } catch (err) {
    console.error('Delete chat day error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    const isAdmin = req.session?.authenticated === true;
    const messageId = Number(req.params.id);

    const row = await queryOne<{ id: number; conversation_id: number; sender_id: number; sender_name: string }>(
      `SELECT m.id, m.conversation_id, m.sender_id, u.display_name AS sender_name
       FROM chat_messages m JOIN chat_users u ON u.id = m.sender_id WHERE m.id = $1`,
      [messageId]
    );

    if (!row) {
      res.status(404).json({ error: 'Message introuvable' });
      return;
    }

    if (isAdmin) {
      await execute('DELETE FROM chat_messages WHERE id = $1', [messageId]);
      logAdminAction('chat_message_delete', 'chat_message', messageId, `Message de ${row.sender_name} supprimé`);
      res.json({ success: true });
      return;
    }

    const user = await findUser(req);
    if (!user || user.id !== row.sender_id) {
      res.status(403).json({ error: 'Suppression non autorisée' });
      return;
    }
    await execute('DELETE FROM chat_messages WHERE id = $1', [messageId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;