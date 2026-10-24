/**
 * Couche de données de l'application : Firebase Realtime Database.
 *
 * Ce module expose EXACTEMENT la même API que l'ancien client HTTP (qui
 * appelait le serveur Express /api/*), pour que les pages n'aient presque
 * rien à changer. Les règles que le serveur appliquait (un vote par appareil,
 * droits de l'auteur, réservé au délégué…) sont reproduites ici, et les
 * garde-fous essentiels sont doublés dans database.rules.json.
 *
 * Temps réel : chaque collection lue est suivie avec `onValue`. Les lectures
 * suivantes sont servies depuis ce cache, toujours à jour, et l'événement
 * `fb:change` prévient les pages (voir useAutoRefresh) qu'il faut se
 * rafraîchir : une nouvelle idée, un vote ou un message apparaît tout seul.
 */
import { ref, onValue, set, update, push, runTransaction } from 'firebase/database';
import { db, clean } from './firebase';
import { hashPassword, verifyPassword } from '@/utils/password';
import { cleanFirstName, generateFingerprint, getFirstName, isValidFirstName } from './utils';
import type {
  Settings,
  Announcement,
  Idea,
  IdeaReply,
  Message,
  Poll,
  PollOption,
  Event,
  Resource,
  Project,
  RevisionSession,
  Student,
  GroupMember,
  StudentGroup,
  StudentGroupStatus,
  Stats,
  VisitStats,
  MaintenanceState,
  MaintenanceLogEntry,
  ChatUser,
  ChatConversation,
  ChatMemberInfo,
  ChatMessage,
  ChatReaction,
  ChatReactionCounts,
  BirthdayEntry,
  GroupChatConversation,
  Sheet,
  SheetListResponse,
  AdminLogEntry,
  AdminOverview,
  Homework,
  HomeworkItem,
} from '../types';

/* ------------------------------------------------------------------------ */
/* Erreurs et session délégué                                               */
/* ------------------------------------------------------------------------ */

/** Émis quand une action réservée au délégué est tentée sans session. */
export const SESSION_EXPIRED_EVENT = 'api:session-expired';

/** Émis (regroupé) quand une donnée suivie change dans Firebase. */
export const DATA_CHANGED_EVENT = 'fb:change';

export class ApiError extends Error {
  readonly status: number;
  readonly sessionExpired: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.sessionExpired = status === 401;
  }
}

const AUTH_KEY = 'delegate_session';
const LOGIN_ATTEMPTS_KEY = 'delegate_login_attempts';

function isDelegate(): boolean {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

function requireDelegate(): void {
  if (!isDelegate()) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    throw new ApiError('Session expirée : reconnecte-toi pour continuer.', 401);
  }
}

function fail(message: string, status = 400): never {
  throw new ApiError(message, status);
}

/** Traduit une erreur Firebase en message compréhensible. */
function explain(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const code = (err as any)?.code || (err as any)?.message || '';
  if (String(code).toLowerCase().includes('permission')) {
    throw new ApiError('Action refusée par la base de données.', 403);
  }
  throw new ApiError('Connexion impossible : vérifie ton réseau et réessaie.', 0);
}

async function write<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    explain(err);
  }
}

/* ------------------------------------------------------------------------ */
/* Cache temps réel                                                         */
/* ------------------------------------------------------------------------ */

interface Watched {
  value: any;
  loaded: boolean;
  ready: Promise<any>;
}

const watched = new Map<string, Watched>();
const pendingChanges = new Set<string>();
let changeTimer: number | null = null;

function notifyChange(path: string) {
  pendingChanges.add(path);
  if (changeTimer != null) return;
  changeTimer = window.setTimeout(() => {
    changeTimer = null;
    const paths = [...pendingChanges];
    pendingChanges.clear();
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { paths } }));
  }, 80);
}

/**
 * Valeur courante d'un chemin, suivie en temps réel.
 * Le premier appel ouvre l'écoute ; les suivants répondent depuis le cache.
 */
function watch(path: string): Promise<any> {
  const existing = watched.get(path);
  if (existing) return existing.loaded ? Promise.resolve(existing.value) : existing.ready;

  let resolveFn!: (v: any) => void;
  let rejectFn!: (e: unknown) => void;
  const entry: Watched = {
    value: null,
    loaded: false,
    ready: new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    }),
  };
  watched.set(path, entry);

  const timeout = window.setTimeout(() => {
    if (!entry.loaded) {
      watched.delete(path);
      rejectFn(new ApiError('Connexion impossible : vérifie ton réseau et réessaie.', 0));
    }
  }, 20000);

  onValue(
    ref(db, path),
    (snap) => {
      entry.value = snap.val();
      if (!entry.loaded) {
        entry.loaded = true;
        window.clearTimeout(timeout);
        resolveFn(entry.value);
      } else {
        notifyChange(path);
      }
    },
    (err) => {
      window.clearTimeout(timeout);
      watched.delete(path);
      if (!entry.loaded) rejectFn(new ApiError('Lecture refusée par la base de données.', 403));
      // eslint-disable-next-line no-console
      console.warn('Firebase', path, err);
    }
  );

  return entry.ready;
}

/** Lecture ponctuelle (fichiers lourds : images, fiches). */
const blobCache = new Map<string, Promise<any>>();

/** Lecture unique d'un chemin (écoute fermée dès la première valeur). */
function fetchOnce(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    onValue(ref(db, path), (snap) => resolve(snap.val()), (err) => reject(err), { onlyOnce: true });
  });
}

function readOnce(path: string): Promise<any> {
  let p = blobCache.get(path);
  if (!p) {
    p = fetchOnce(path)
      .catch((err) => {
        blobCache.delete(path);
        throw err;
      });
    blobCache.set(path, p);
  }
  return p;
}

/**
 * Un élément d'une collection suivie. Si le cache ne l'a pas encore reçu
 * (créé à l'instant sur un autre appareil), on le relit directement.
 */
async function findItem(collection: string, id: string): Promise<any> {
  const all = (await watch(collection)) || {};
  if (all[id]) return all[id];
  return fetchOnce(`${collection}/${id}`);
}

/* ------------------------------------------------------------------------ */
/* Utilitaires                                                              */
/* ------------------------------------------------------------------------ */

type Row = Record<string, any> & { id: string };

function rows(value: any): Row[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([k, v]) => ({ ...(v as any), id: k }));
}

function iso(ms: unknown): string {
  const n = typeof ms === 'number' ? ms : Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date(n).toISOString();
}

function newId(path: string): string {
  return push(ref(db, path)).key as string;
}

/** Une clé Firebase ne peut contenir ni . # $ [ ] / */
function safeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/[.#$[\]/]/g, '_')
    .slice(0, 64);
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

function flag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const t = String(value).toLowerCase();
  return !(t === 'false' || t === '0' || t === 'non' || t === 'off');
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanPersonName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function cleanBirthday(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value.trim())) return null;
  const [m, d] = value.trim().split('-').map(Number);
  const probe = new Date(2024, m - 1, d);
  if (probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d ? v : null;
}

function cleanTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value.trim())) return null;
  const [h, m] = value.trim().split(':').map(Number);
  return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
}

/** Date du jour (heure locale de l'appareil), au format AAAA-MM-JJ. */
function localDay(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Contexte non sécurisé (http local) : simple hachage de repli.
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).padStart(8, '0').repeat(4);
  }
}

async function logAdmin(action: string, targetType?: string | null, targetId?: string | null, detail?: string | null) {
  try {
    await set(
      ref(db, `adminLog/${newId('adminLog')}`),
      clean({
        action: action.slice(0, 60),
        targetType: targetType ? targetType.slice(0, 60) : undefined,
        targetId: targetId ? String(targetId).slice(0, 64) : undefined,
        detail: detail ? detail.slice(0, 500) : undefined,
        createdAt: Date.now(),
      })
    );
  } catch {
    /* le journal ne doit jamais bloquer une action */
  }
}

/* ------------------------------------------------------------------------ */
/* Paramètres                                                               */
/* ------------------------------------------------------------------------ */

const DEFAULT_LINK_TOKEN = 'cb29d732629c';
const DEFAULT_PASSWORD_HASH = '$2a$10$dev';
const DEFAULT_MAINTENANCE_MESSAGE =
  'Le site est temporairement indisponible pour maintenance. Merci de revenir plus tard.';
const SEASON_THEMES = ['aucun', 'halloween', 'noel'];

async function rawSettings(): Promise<Record<string, any>> {
  return (await watch('settings')) || {};
}

function shapeSettings(s: Record<string, any>): Settings {
  return {
    class_name: s.className || 'Seconde 9',
    delegate_name: s.delegateName || 'Délégué',
    accent_color: s.accentColor || '#3b5ba6',
    home_info: s.homeInfo || '',
    home_image: s.homeImage || null,
    season_theme: SEASON_THEMES.includes(s.seasonTheme) ? s.seasonTheme : 'aucun',
  };
}

/* ------------------------------------------------------------------------ */
/* Annonces                                                                 */
/* ------------------------------------------------------------------------ */

const ANNOUNCEMENT_REACTIONS = ['vu', 'jaime', 'question', 'important'];

function shapeAnnouncement(a: Row, reactions: any, fp?: string): Announcement {
  const counts: Record<string, number> = {};
  const mine: string[] = [];
  const bucket = (reactions && reactions[a.id]) || {};
  for (const r of Object.keys(bucket)) {
    const voters = bucket[r] || {};
    const n = Object.keys(voters).length;
    if (n > 0) counts[r] = n;
    if (fp && voters[fp]) mine.push(r);
  }
  return {
    id: a.id,
    title: a.title || '',
    description: a.description || '',
    category: a.category || 'general',
    importance: a.importance || 'normal',
    author: a.author || 'Délégué',
    attachment_url: a.attachmentUrl || null,
    image: a.image || null,
    published: a.published === false ? 0 : 1,
    created_at: iso(a.createdAt),
    updated_at: iso(a.updatedAt || a.createdAt),
    reactions: counts,
    my_reactions: mine,
  };
}

/* ------------------------------------------------------------------------ */
/* Idées                                                                    */
/* ------------------------------------------------------------------------ */

const IDEA_STATUSES = ['a_etudier', 'en_discussion', 'transmise', 'realisee', 'non_retenue'];
const replyToIdea = new Map<string, string>();

function shapeIdea(i: Row): Idea {
  const anonymous = i.anonymous === true || i.anonymous === 1;
  return {
    id: i.id,
    title: i.title || '',
    description: i.description || '',
    category: i.category || 'classe',
    anonymous: anonymous ? 1 : 0,
    author_name: anonymous ? null : i.authorName || null,
    status: i.status || 'a_etudier',
    delegate_response: i.delegateResponse || null,
    created_at: iso(i.createdAt),
    updated_at: iso(i.updatedAt || i.createdAt),
  };
}

/* ------------------------------------------------------------------------ */
/* Messages au délégué                                                      */
/* ------------------------------------------------------------------------ */

function shapeMessage(m: Row, delegateName?: string): Message {
  const anonymous = m.anonymous === true || m.anonymous === 1;
  return {
    id: m.id,
    content: m.content || '',
    category: m.category || 'autre',
    anonymous: anonymous ? 1 : 0,
    author_name: anonymous ? null : m.authorName || null,
    status: m.status || 'nouveau',
    created_at: iso(m.createdAt),
    updated_at: iso(m.updatedAt || m.createdAt),
    delegate_reply: m.delegateReply || null,
    replied_at: m.repliedAt ? iso(m.repliedAt) : null,
    delegate_name: delegateName ?? null,
    response_read_at: m.responseReadAt ? iso(m.responseReadAt) : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Sondages                                                                 */
/* ------------------------------------------------------------------------ */

function shapePoll(p: Row, votesByPoll: any, fp?: string): Poll {
  const votes: Record<string, any> = (votesByPoll && votesByPoll[p.id]) || {};
  const optionCounts: Record<string, number> = {};
  let totalVotes = 0;
  for (const v of Object.values(votes)) {
    for (const optId of Object.keys((v as any)?.options || {})) {
      optionCounts[optId] = (optionCounts[optId] || 0) + 1;
      totalVotes++;
    }
  }
  const options: PollOption[] = Object.entries(p.options || {})
    .map(([optId, o]: [string, any]) => ({ optId, text: o?.text || '', position: Number(o?.position ?? 0) }))
    .sort((a, b) => a.position - b.position || a.optId.localeCompare(b.optId, undefined, { numeric: true }))
    .map((o) => ({ id: o.optId, poll_id: p.id, text: o.text, vote_count: optionCounts[o.optId] || 0 }));
  return {
    id: p.id,
    question: p.question || '',
    allow_multiple: p.allowMultiple ? 1 : 0,
    show_results: p.showResults === false ? 0 : 1,
    anonymous: p.anonymous === false ? 0 : 1,
    active: p.active === false ? 0 : 1,
    created_at: iso(p.createdAt),
    closed_at: p.closedAt ? iso(p.closedAt) : null,
    options,
    total_votes: totalVotes,
    total_voters: Object.keys(votes).length,
    has_voted: !!(fp && votes[safeKey(fp)]),
  };
}

/* ------------------------------------------------------------------------ */
/* Élèves et groupes                                                        */
/* ------------------------------------------------------------------------ */

const MIN_GROUP = 3;
const MAX_GROUP = 4;

function shapeStudent(s: Row): Student {
  return {
    id: s.id,
    first_name: s.firstName || '',
    last_name: s.lastName || '',
    birthday: s.birthday || null,
    created_at: iso(s.createdAt),
  };
}

function shapeGroup(g: Row, studentsById: Record<string, any>, fp?: string): StudentGroup {
  const members: GroupMember[] = rows(g.members)
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
    .map((m) => ({
      id: m.id,
      student_id: m.studentId || null,
      name: m.memberName || '',
      member_key: m.memberKey || '',
      birthday: (m.studentId && studentsById[m.studentId]?.birthday) || null,
      added_at: iso(m.addedAt),
    }));
  const status: StudentGroupStatus = (['en_attente', 'valide', 'refuse'].includes(g.status) ? g.status : 'en_attente') as StudentGroupStatus;
  const mine = !!fp && !!g.createdByFingerprint && g.createdByFingerprint === safeKey(fp);
  return {
    id: g.id,
    name: g.name || '',
    is_private: g.isPrivate ? 1 : 0,
    status,
    members,
    validated_at: g.validatedAt ? iso(g.validatedAt) : null,
    validated_by: g.validatedBy || null,
    mine,
    peut_modifier: status === 'en_attente' && (isDelegate() || mine),
  };
}

async function loadGroups(fp?: string): Promise<StudentGroup[]> {
  const [groups, students] = await Promise.all([watch('studentGroups'), watch('students')]);
  return rows(groups)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((g) => shapeGroup(g, students || {}, fp));
}

/** Ajoute des membres (par fiche élève ou par nom tapé), sans doublon. */
async function addMembers(
  groupId: string,
  existing: Record<string, any>,
  studentIds: string[],
  memberNames: string[],
  by: string | null
): Promise<Record<string, any>> {
  const students = (await watch('students')) || {};
  const keys = new Set(Object.values(existing || {}).map((m: any) => m?.memberKey));
  const sids = new Set(Object.values(existing || {}).map((m: any) => m?.studentId).filter(Boolean));
  const updates: Record<string, any> = {};
  const add = (memberName: string, studentId: string | null) => {
    const key = normalizeName(memberName);
    if (!key || keys.has(key) || (studentId && sids.has(studentId))) return;
    keys.add(key);
    if (studentId) sids.add(studentId);
    updates[`studentGroups/${groupId}/members/${newId('studentGroups')}`] = clean({
      studentId: studentId || undefined,
      memberName,
      memberKey: key,
      addedByFingerprint: by || undefined,
      addedAt: Date.now(),
    });
  };
  for (const sid of studentIds) {
    const s = students[sid];
    if (s) add(`${s.firstName} ${s.lastName}`.trim(), sid);
  }
  for (const raw of memberNames) {
    const name = cleanPersonName(raw);
    if (!name) continue;
    const wanted = normalizeName(name);
    const match = Object.entries(students).find(
      ([, s]: [string, any]) => normalizeName(`${s?.firstName || ''} ${s?.lastName || ''}`) === wanted
    );
    add(name, match ? match[0] : null);
  }
  return updates;
}

/** Validation d'un groupe : 3 à 4 élèves, aucun déjà dans un autre groupe validé. */
async function claimGroup(groupId: string, members: Record<string, any>): Promise<Record<string, any>> {
  const list = Object.values(members || {}) as any[];
  if (list.length < MIN_GROUP) fail(`Un groupe doit contenir au moins ${MIN_GROUP} élèves`);
  if (list.length > MAX_GROUP) fail(`Un groupe ne peut pas dépasser ${MAX_GROUP} élèves`, 400);
  const [groups, students] = await Promise.all([watch('studentGroups'), watch('students')]);
  const ids = new Set(list.map((m) => m.studentId).filter(Boolean));
  const keys = new Set(list.map((m) => m.memberKey).filter(Boolean));
  const conflicts: string[] = [];
  for (const g of rows(groups)) {
    if (g.id === groupId || g.status !== 'valide') continue;
    for (const m of Object.values(g.members || {}) as any[]) {
      if ((m.studentId && ids.has(m.studentId)) || (m.memberKey && keys.has(m.memberKey))) {
        const s = m.studentId ? (students || {})[m.studentId] : null;
        conflicts.push(`${s ? `${s.firstName} ${s.lastName}` : m.memberName} (${g.name})`);
      }
    }
  }
  if (conflicts.length) fail(`Déjà dans un groupe validé : ${conflicts.join(', ')}`, 409);
  const settings = await rawSettings();
  return {
    [`studentGroups/${groupId}/status`]: 'valide',
    [`studentGroups/${groupId}/validatedAt`]: Date.now(),
    [`studentGroups/${groupId}/validatedBy`]: (settings.delegateName || 'Délégué').slice(0, 60),
    [`studentGroups/${groupId}/updatedAt`]: Date.now(),
  };
}

/* ------------------------------------------------------------------------ */
/* Révisions                                                                */
/* ------------------------------------------------------------------------ */

function shapeRevision(r: Row, fp?: string): RevisionSession {
  const delegate = isDelegate();
  const me = fp ? safeKey(fp) : '';
  const mine = !delegate && me.length >= 8 && r.createdByFingerprint === me;
  return {
    id: r.id,
    title: r.title || '',
    subject: r.subject || 'autre',
    date: r.date || '',
    time: r.time || null,
    duration: Number(r.duration) || 60,
    location: r.location || '',
    description: r.description || '',
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt || r.createdAt),
    mine,
    peut_modifier: delegate || mine,
  };
}

/* ------------------------------------------------------------------------ */
/* Chat                                                                     */
/* ------------------------------------------------------------------------ */

const CLASS_CONVERSATION: ChatConversation = { id: 'classe', title: 'Classe', is_group: 1 };
const DELEGATE_CHAT_KEY = 'delegate';
const CHAT_REACTIONS: ChatReaction[] = ['pouce', 'rire', 'coeur'];
const SEND_WINDOW_MS = 30_000;
const SEND_WINDOW_MAX = 8;
const sendTimes: number[] = [];
const MAX_CHAT_IMAGE_CHARS = 1_400_000;

/** Conversation d'un groupe : identifiant « g<id du groupe> ». */
function groupConversationId(groupId: string) {
  return `g${groupId}`;
}
function groupIdFromConversation(conversationId: string): string | null {
  return conversationId && conversationId !== 'classe' && conversationId.startsWith('g') ? conversationId.slice(1) : null;
}

/** Clé de l'utilisateur courant dans le chat (empreinte, ou « delegate »). */
function chatKey(fp?: string | null): string {
  if (isDelegate()) return DELEGATE_CHAT_KEY;
  return fp ? safeKey(fp) : '';
}

async function ensureDelegateChatUser(): Promise<ChatUser> {
  const settings = await rawSettings();
  const name = (settings.delegateName || 'Délégué').slice(0, 20);
  const users = (await watch('chatUsers')) || {};
  const existing = users[DELEGATE_CHAT_KEY];
  if (!existing || existing.displayName !== name) {
    await set(
      ref(db, `chatUsers/${DELEGATE_CHAT_KEY}`),
      clean({ ...(existing || {}), displayName: name, kind: 'delegate', lastSeenAt: Date.now(), createdAt: existing?.createdAt || Date.now() })
    ).catch(() => {});
  }
  return { id: DELEGATE_CHAT_KEY, display_name: name, kind: 'delegate' };
}

async function currentChatUser(fp?: string | null): Promise<ChatUser | null> {
  if (isDelegate()) return ensureDelegateChatUser();
  const key = chatKey(fp);
  if (key.length < 8) return null;
  const users = (await watch('chatUsers')) || {};
  const u = users[key];
  if (!u) return null;
  return { id: key, display_name: u.displayName, kind: u.kind || 'student' };
}

function reactionCounts(all: any, messageId: string, me: string): ChatReactionCounts {
  const counts: ChatReactionCounts = {};
  const bucket = (all && all[messageId]) || {};
  for (const r of Object.keys(bucket)) {
    const voters = bucket[r] || {};
    const total = Object.keys(voters).length;
    if (total > 0) counts[r] = { total, mine: !!(me && voters[me]) };
  }
  return counts;
}

function shapeChatMessage(m: Row, conversationId: string, reactions: any, me: string): ChatMessage {
  return {
    id: m.id,
    conversation_id: conversationId,
    sender_id: m.senderId || '',
    sender_name: m.senderName || '?',
    sender_kind: m.senderKind || 'student',
    content: m.content || '',
    has_image: m.hasImage || m.image ? 1 : 0,
    created_at: iso(m.createdAt),
    reactions: reactionCounts(reactions, m.id, me),
  };
}

function messagesPath(conversationId: string): string {
  const gid = groupIdFromConversation(conversationId);
  return gid ? `groupChatMessages/${gid}` : 'chatMessages';
}

function liveMessages(value: any): Row[] {
  return rows(value)
    .filter((m) => !m.deletedAt)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Le groupe validé dont l'élève fait partie (créateur, ajouté par lui, ou prénom). */
async function findMyGroup(fp: string): Promise<Row | null> {
  const groups = rows(await watch('studentGroups')).filter((g) => g.status === 'valide');
  const me = safeKey(fp);
  const users = (await watch('chatUsers')) || {};
  const first = normalizeName(cleanFirstName(users[me]?.displayName || getFirstName() || ''));
  const byFp = groups.find(
    (g) =>
      g.createdByFingerprint === me ||
      Object.values(g.members || {}).some((m: any) => m?.addedByFingerprint === me)
  );
  if (byFp) return byFp;
  if (!first) return null;
  const byName = groups.filter((g) =>
    Object.values(g.members || {}).some((m: any) => String(m?.memberKey || '').split(' ')[0] === first)
  );
  return byName.length === 1 ? byName[0] : null;
}

async function shapeGroupConversation(g: Row): Promise<GroupChatConversation> {
  const chats = (await watch('groupChats')) || {};
  const c = chats[g.id] || {};
  return {
    id: groupConversationId(g.id),
    title: g.name || 'Groupe',
    group_id: g.id,
    closed: c.closed ? 1 : 0,
    last_activity_at: iso(c.lastActivityAt || g.validatedAt || g.createdAt),
    group_name: g.name || 'Groupe',
    group_status: g.status || 'valide',
    member_count: Object.keys(g.members || {}).length,
  };
}

async function canUseGroup(groupId: string, fp?: string | null): Promise<Row> {
  const groups = (await watch('studentGroups')) || {};
  const g = groups[groupId];
  if (!g || g.status !== 'valide') fail('Groupe introuvable ou pas encore validé', 404);
  const row = { ...g, id: groupId } as Row;
  if (isDelegate()) return row;
  if (!fp) fail('Accès refusé', 403);
  const mine = await findMyGroup(fp);
  if (!mine || mine.id !== groupId) fail('Tu ne fais pas partie de ce groupe', 403);
  return row;
}

function checkSendRate() {
  const now = Date.now();
  while (sendTimes.length && now - sendTimes[0] > SEND_WINDOW_MS) sendTimes.shift();
  if (sendTimes.length >= SEND_WINDOW_MAX) fail("Trop de messages d'affilée, ralentis un peu", 429);
  sendTimes.push(now);
}

function checkImage(image: unknown): string | null {
  if (!image) return null;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(image)) {
    fail('Format d\u2019image non autorisé (JPG, PNG, WEBP ou GIF)');
  }
  if (image.length > MAX_CHAT_IMAGE_CHARS) fail('Image trop volumineuse');
  return image;
}

/* ------------------------------------------------------------------------ */
/* Fiches                                                                   */
/* ------------------------------------------------------------------------ */

const SHEETS_PER_PAGE = 24;
const MAX_SHEET_FILE_CHARS = 5_900_000;

function shapeSheet(s: Row, fp?: string | null): Sheet {
  return {
    id: s.id,
    title: s.title || '',
    subject: s.subject || 'autre',
    class_level: s.classLevel || null,
    description: s.description || '',
    author_name: s.authorName || null,
    kind: s.kind || 'image',
    mime_type: s.mimeType || null,
    file_size: Number(s.fileSize) || 0,
    has_file: s.hasFile || s.fileData || s.fileSize ? 1 : 0,
    status: s.status || 'active',
    created_at: iso(s.createdAt),
    is_mine: !isDelegate() && !!fp && !!s.authorFingerprint && s.authorFingerprint === safeKey(fp),
  };
}

/* ------------------------------------------------------------------------ */
/* Sauvegarde                                                               */
/* ------------------------------------------------------------------------ */

const BACKUP_PATHS = [
  'settings', 'announcements', 'announcementReactions', 'ideas', 'ideaReplies', 'messages',
  'polls', 'pollVotes', 'events', 'revisions', 'resources', 'projects', 'students', 'birthdays',
  'studentGroups', 'groupChats', 'groupChatMessages', 'groupChatImages', 'sheets', 'sheetFiles',
  'chatUsers', 'chatMessages', 'chatImages', 'chatReactions', 'visits', 'maintenanceLog', 'adminLog',
];

/* ------------------------------------------------------------------------ */
/* API publique (mêmes noms et formes que l'ancien client HTTP)             */
/* ------------------------------------------------------------------------ */


/* ------------------------------------------------------------------------ */
/* Cahier de textes                                                         */
/* ------------------------------------------------------------------------ */

const HOMEWORK_DATE = /^\d{4}-\d{2}-\d{2}$/;

function shapeHomework(raw: any): Homework {
  const value = raw && typeof raw === 'object' ? raw : {};
  const daysRaw = value.days && typeof value.days === 'object' ? value.days : {};
  const days = Object.keys(daysRaw)
    .filter((date) => HOMEWORK_DATE.test(date))
    .sort()
    .map((date) => {
      const itemsRaw = daysRaw[date] && typeof daysRaw[date] === 'object' ? daysRaw[date] : {};
      const items: HomeworkItem[] = Object.entries(itemsRaw)
        .filter(([, it]) => it && typeof it === 'object')
        .map(([id, it]: [string, any]) => ({
          id,
          date,
          subject: typeof it.subject === 'string' ? it.subject : '',
          teacher: typeof it.teacher === 'string' ? it.teacher : '',
          content: typeof it.content === 'string' ? it.content : '',
          given_on: typeof it.givenOn === 'string' && HOMEWORK_DATE.test(it.givenOn) ? it.givenOn : '',
          is_test: it.isTest === true,
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject, 'fr') || a.id.localeCompare(b.id));
      return { date, items };
    })
    .filter((d) => d.items.length > 0);
  return {
    updated_at: typeof value.updatedAt === 'number' ? value.updatedAt : null,
    source: typeof value.source === 'string' && value.source ? value.source : 'École Directe',
    days,
  };
}

export const api = {
  /* ---------------- Auth ---------------- */
  login: async (password: string, token?: string): Promise<{ success: boolean }> => {
    if (!password) fail('Mot de passe requis');
    let attempts: number[] = [];
    try {
      attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '[]').filter(
        (t: number) => Date.now() - t < 15 * 60_000
      );
    } catch {
      attempts = [];
    }
    if (attempts.length >= 8) fail('Trop de tentatives. Réessayez dans 15 minutes.', 429);
    const s = await rawSettings();
    if (token && token !== (s.delegateLinkToken || DEFAULT_LINK_TOKEN)) fail('Lien d\u2019accès invalide', 403);
    const ok = await verifyPassword(password, s.passwordHash || DEFAULT_PASSWORD_HASH);
    if (!ok) {
      attempts.push(Date.now());
      try {
        localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
      } catch {
        /* ignoré */
      }
      fail('Mot de passe incorrect', 401);
    }
    try {
      localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
      sessionStorage.setItem(AUTH_KEY, '1');
    } catch {
      /* ignoré */
    }
    void logAdmin('login', 'auth', null, 'Connexion du délégué');
    return { success: true };
  },
  logout: async (): Promise<{ success: boolean }> => {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignoré */
    }
    return { success: true };
  },
  checkAuth: async (): Promise<{ authenticated: boolean }> => ({ authenticated: isDelegate() }),
  validateToken: async (token: string): Promise<{ valid: boolean }> => {
    const s = await rawSettings();
    return { valid: !!token && token === (s.delegateLinkToken || DEFAULT_LINK_TOKEN) };
  },

  /* ---------------- Settings ---------------- */
  getSettings: async (): Promise<Settings> => shapeSettings(await rawSettings()),
  updateSettings: async (data: Partial<Settings>): Promise<Settings> => {
    requireDelegate();
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data.class_name !== undefined) patch.className = cleanText(data.class_name, 60) || 'Classe';
    if (data.delegate_name !== undefined) patch.delegateName = cleanText(data.delegate_name, 60) || 'Délégué';
    if (data.accent_color !== undefined) {
      if (!/^#[0-9a-fA-F]{3,8}$/.test(String(data.accent_color).trim())) fail('Couleur invalide');
      patch.accentColor = String(data.accent_color).trim();
    }
    if (data.home_info !== undefined) patch.homeInfo = cleanText(data.home_info, 5000);
    if (data.home_image !== undefined) {
      if (data.home_image && String(data.home_image).length > 1_500_000) fail('Image trop volumineuse');
      patch.homeImage = data.home_image || null;
    }
    if (data.season_theme !== undefined) {
      const theme = String(data.season_theme || '').toLowerCase().trim();
      if (!SEASON_THEMES.includes(theme)) fail('Thème de saison invalide');
      patch.seasonTheme = theme;
    }
    await write(() => update(ref(db, 'settings'), patch));
    return shapeSettings(await rawSettings());
  },
  regenerateToken: async (): Promise<{ token: string }> => {
    requireDelegate();
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const token = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await write(() => update(ref(db, 'settings'), { delegateLinkToken: token, updatedAt: Date.now() }));
    void logAdmin('token_regenerate', 'settings', null, 'Nouveau lien délégué');
    return { token };
  },
  changePassword: async (old_password: string, new_password: string): Promise<{ success: boolean }> => {
    requireDelegate();
    if (!old_password || !new_password) fail('Ancien et nouveau mot de passe requis');
    if (new_password.length < 6) fail('Le nouveau mot de passe doit faire au moins 6 caractères');
    const s = await rawSettings();
    if (!(await verifyPassword(old_password, s.passwordHash || DEFAULT_PASSWORD_HASH))) {
      fail('Ancien mot de passe incorrect', 401);
    }
    const passwordHash = await hashPassword(new_password);
    await write(() => update(ref(db, 'settings'), { passwordHash, updatedAt: Date.now() }));
    void logAdmin('password_change', 'settings', null, 'Mot de passe modifié');
    return { success: true };
  },

  /* ---------------- Announcements ---------------- */
  getAnnouncements: async (fingerprint?: string): Promise<Announcement[]> => {
    const [items, reactions] = await Promise.all([watch('announcements'), watch('announcementReactions')]);
    const delegate = isDelegate();
    const fp = fingerprint ? safeKey(fingerprint) : undefined;
    return rows(items)
      .filter((a) => delegate || a.published !== false)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((a) => shapeAnnouncement(a, reactions, fp));
  },
  createAnnouncement: async (data: any): Promise<Announcement> => {
    requireDelegate();
    const title = cleanText(data?.title, 200);
    const description = cleanText(data?.description, 5000);
    if (!title || !description) fail('Titre et description requis');
    if (data?.image && String(data.image).length > 1_500_000) fail('Image trop volumineuse');
    const id = newId('announcements');
    const now = Date.now();
    const value = clean({
      id,
      title,
      description,
      category: cleanText(data?.category, 30) || 'general',
      importance: cleanText(data?.importance, 30) || 'normal',
      author: cleanText(data?.author, 60) || 'Délégué',
      attachmentUrl: cleanText(data?.attachment_url, 1000) || undefined,
      image: data?.image || undefined,
      published: flag(data?.published, true),
      createdAt: now,
      updatedAt: now,
    });
    await write(() => set(ref(db, `announcements/${id}`), value));
    void logAdmin('announcement_create', 'announcement', id, title);
    return shapeAnnouncement({ ...value, id } as Row, {});
  },
  updateAnnouncement: async (id: string, data: any): Promise<Announcement> => {
    requireDelegate();
    const items = (await watch('announcements')) || {};
    if (!items[id]) fail('Annonce introuvable', 404);
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.title !== undefined) patch.title = cleanText(data.title, 200) || items[id].title;
    if (data?.description !== undefined) patch.description = cleanText(data.description, 5000) || items[id].description;
    if (data?.category !== undefined) patch.category = cleanText(data.category, 30) || 'general';
    if (data?.importance !== undefined) patch.importance = cleanText(data.importance, 30) || 'normal';
    if (data?.author !== undefined) patch.author = cleanText(data.author, 60) || 'Délégué';
    if (data?.attachment_url !== undefined) patch.attachmentUrl = cleanText(data.attachment_url, 1000) || null;
    if (data?.image !== undefined) {
      if (data.image && String(data.image).length > 1_500_000) fail('Image trop volumineuse');
      patch.image = data.image || null;
    }
    if (data?.published !== undefined) patch.published = flag(data.published, true);
    await write(() => update(ref(db, `announcements/${id}`), patch));
    const after = (await watch('announcements')) || {};
    return shapeAnnouncement({ ...(after[id] || {}), id } as Row, await watch('announcementReactions'));
  },
  deleteAnnouncement: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    await write(() => update(ref(db), { [`announcements/${id}`]: null, [`announcementReactions/${id}`]: null }));
    void logAdmin('announcement_delete', 'announcement', id, 'Annonce supprimée');
    return { success: true };
  },
  reactToAnnouncement: async (
    id: string,
    reaction: string,
    fingerprint: string
  ): Promise<{ reactions: Record<string, number>; my_reactions: string[] }> => {
    if (!ANNOUNCEMENT_REACTIONS.includes(reaction)) fail('Réaction invalide');
    const fp = safeKey(fingerprint);
    if (fp.length < 8) fail('Identifiant requis');
    const ann = await findItem('announcements', id);
    if (!ann) fail('Annonce introuvable', 404);
    const all = (await watch('announcementReactions')) || {};
    const active = !!all?.[id]?.[reaction]?.[fp];
    await write(() => set(ref(db, `announcementReactions/${id}/${reaction}/${fp}`), active ? null : true));
    const shaped = shapeAnnouncement({ ...ann, id } as Row, await watch('announcementReactions'), fp);
    return { reactions: shaped.reactions || {}, my_reactions: shaped.my_reactions || [] };
  },

  /* ---------------- Ideas ---------------- */
  getIdeas: async (): Promise<Idea[]> =>
    rows(await watch('ideas'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(shapeIdea),
  createIdea: async (data: any): Promise<Idea> => {
    const title = cleanText(data?.title ?? data?.content, 200);
    const description = cleanText(data?.description, 5000);
    if (!title) fail('Titre requis');
    const anonymous = flag(data?.anonymous, false);
    const author = anonymous ? '' : cleanFirstName(String(data?.author_name || ''));
    if (!anonymous && !isValidFirstName(author)) fail('Un prénom est requis pour une idée signée');
    const fp = anonymous ? '' : safeKey(data?.fingerprint || generateFingerprint());
    const id = newId('ideas');
    const now = Date.now();
    const value = clean({
      id,
      title,
      description,
      category: cleanText(data?.category, 30) || 'classe',
      anonymous,
      authorName: anonymous ? undefined : author,
      fingerprint: fp || undefined,
      status: 'a_etudier',
      createdAt: now,
      updatedAt: now,
    });
    await write(() => set(ref(db, `ideas/${id}`), value));
    void logAdmin('idea_create', 'idea', id, `Idée créée ${anonymous ? 'anonymement' : 'par ' + author}`);
    return shapeIdea({ ...value, id } as Row);
  },
  updateIdea: async (id: string, data: any): Promise<Idea> => {
    requireDelegate();
    const ideas = (await watch('ideas')) || {};
    if (!ideas[id]) fail('Idée introuvable', 404);
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.status !== undefined) {
      if (!IDEA_STATUSES.includes(data.status)) fail('Statut invalide');
      patch.status = data.status;
    }
    if (data?.delegate_response !== undefined) {
      const response = cleanText(data.delegate_response, 5000);
      patch.delegateResponse = response || null;
      patch.delegateRepliedAt = response ? Date.now() : null;
    }
    await write(() => update(ref(db, `ideas/${id}`), patch));
    if (patch.status === 'transmise' || patch.status === 'realisee') {
      void logAdmin('idea_status_change', 'idea', id, `Statut passé à ${patch.status}`);
    }
    const after = (await watch('ideas')) || {};
    return shapeIdea({ ...(after[id] || {}), id } as Row);
  },
  deleteIdea: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    const ideas = (await watch('ideas')) || {};
    if (!ideas[id]) fail('Idée introuvable', 404);
    await write(() => update(ref(db), { [`ideas/${id}`]: null, [`ideaReplies/${id}`]: null }));
    void logAdmin('idea_delete', 'idea', id, `Idée supprimée (était ${ideas[id].status})`);
    return { success: true };
  },

  getIdeaReplies: async (id: string, fingerprint?: string): Promise<IdeaReply[]> => {
    const value = await watch(`ideaReplies/${id}`);
    const fp = fingerprint ? safeKey(fingerprint) : '';
    const delegate = isDelegate();
    return rows(value)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((r) => {
        replyToIdea.set(r.id, id);
        const mine = !!fp && r.fingerprint === fp;
        return {
          id: r.id,
          content: r.content || '',
          author_name: r.authorName || null,
          deleted_at: null,
          created_at: iso(r.createdAt),
          mine,
          can_delete: delegate || mine,
        };
      });
  },
  createIdeaReply: async (id: string, data: any): Promise<IdeaReply> => {
    const content = cleanText(data?.content, 1000);
    if (!content) fail('Réponse vide');
    const ideas = (await watch('ideas')) || {};
    if (!ideas[id]) fail('Idée introuvable', 404);
    const author = cleanFirstName(String(data?.author_name || ''));
    if (!isValidFirstName(author)) fail('Un prénom est requis pour répondre');
    const fp = safeKey(data?.fingerprint);
    const replyId = newId(`ideaReplies/${id}`);
    const now = Date.now();
    await write(() =>
      set(ref(db, `ideaReplies/${id}/${replyId}`), clean({ content, authorName: author, fingerprint: fp || undefined, createdAt: now }))
    );
    replyToIdea.set(replyId, id);
    return { id: replyId, content, author_name: author, deleted_at: null, created_at: iso(now), mine: true, can_delete: true };
  },
  deleteIdeaReply: async (replyId: string, fingerprint: string): Promise<{ success: boolean }> => {
    let ideaId = replyToIdea.get(replyId);
    if (!ideaId) {
      const all = (await readOnce('ideaReplies')) || {};
      ideaId = Object.keys(all).find((k) => all[k] && all[k][replyId]);
    }
    if (!ideaId) fail('Réponse introuvable', 404);
    const replies = (await watch(`ideaReplies/${ideaId}`)) || {};
    const reply = replies[replyId];
    if (!reply) fail('Réponse introuvable', 404);
    const fp = safeKey(fingerprint);
    if (!isDelegate() && (!fp || reply.fingerprint !== fp)) {
      fail('Seul l\u2019auteur ou le délégué peut supprimer cette réponse', 403);
    }
    await write(() => set(ref(db, `ideaReplies/${ideaId}/${replyId}`), null));
    return { success: true };
  },

  /* ---------------- Messages ---------------- */
  getMessages: async (): Promise<Message[]> => {
    requireDelegate();
    return rows(await watch('messages'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((m) => shapeMessage(m));
  },
  sendMessage: async (data: any): Promise<Message> => {
    const content = cleanText(data?.content, 5000);
    if (!content) fail('Contenu requis');
    const anonymous = flag(data?.anonymous, false);
    const author = cleanFirstName(String(data?.author_name || ''));
    if (!anonymous && !isValidFirstName(author)) fail('Un prénom est requis pour envoyer un message signé');
    const fp = safeKey(data?.fingerprint);
    const id = newId('messages');
    const now = Date.now();
    const value = clean({
      id,
      content,
      category: cleanText(data?.category, 30) || 'autre',
      anonymous,
      authorName: anonymous ? undefined : author,
      fingerprint: fp || undefined,
      status: 'nouveau',
      createdAt: now,
      updatedAt: now,
    });
    await write(() => set(ref(db, `messages/${id}`), value));
    const s = await rawSettings();
    return shapeMessage({ ...value, id } as Row, s.delegateName || undefined);
  },
  getMyMessages: async (fingerprint: string): Promise<Message[]> => {
    const fp = safeKey(fingerprint);
    if (!fp) fail('Fingerprint requis');
    const [all, s] = await Promise.all([watch('messages'), rawSettings()]);
    return rows(all)
      .filter((m) => m.fingerprint === fp)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 50)
      .map((m) => shapeMessage(m, s.delegateName || undefined));
  },
  markMessageRead: async (id: string, fingerprint: string): Promise<{ success: boolean }> => {
    const fp = safeKey(fingerprint);
    const all = (await watch('messages')) || {};
    const m = all[id];
    if (!m || m.fingerprint !== fp) fail('Message introuvable', 404);
    if (!m.responseReadAt) await write(() => update(ref(db, `messages/${id}`), { responseReadAt: Date.now() }));
    return { success: true };
  },
  updateMessage: async (id: string, data: any): Promise<Message> => {
    requireDelegate();
    const all = (await watch('messages')) || {};
    if (!all[id]) fail('Message introuvable', 404);
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.status) patch.status = cleanText(data.status, 30);
    if (typeof data?.reply === 'string') {
      patch.delegateReply = cleanText(data.reply, 1000) || null;
      patch.repliedAt = Date.now();
      patch.responseReadAt = null;
      if (!data?.status && all[id].status === 'nouveau') patch.status = 'traite';
    }
    await write(() => update(ref(db, `messages/${id}`), patch));
    const after = (await watch('messages')) || {};
    return shapeMessage({ ...(after[id] || {}), id } as Row);
  },
  deleteMessage: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    await write(() => set(ref(db, `messages/${id}`), null));
    return { success: true };
  },

  /* ---------------- Polls ---------------- */
  getPolls: async (fingerprint?: string): Promise<Poll[]> => {
    const [polls, votes] = await Promise.all([watch('polls'), watch('pollVotes')]);
    const delegate = isDelegate();
    return rows(polls)
      .filter((p) => delegate || p.active !== false)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((p) => shapePoll(p, votes, fingerprint));
  },
  getPoll: async (id: string): Promise<Poll> => {
    const [polls, votes] = await Promise.all([watch('polls'), watch('pollVotes')]);
    if (!polls?.[id]) fail('Sondage introuvable', 404);
    return shapePoll({ ...polls[id], id } as Row, votes);
  },
  createPoll: async (data: any): Promise<Poll> => {
    requireDelegate();
    const question = cleanText(data?.question, 300);
    const options: string[] = (Array.isArray(data?.options) ? data.options : [])
      .map((o: unknown) => cleanText(o, 200))
      .filter(Boolean);
    if (!question || options.length < 2) fail('Question et au moins 2 options requises');
    if (options.length > 99) fail('Trop d\u2019options');
    const id = newId('polls');
    const now = Date.now();
    const value = {
      id,
      question,
      allowMultiple: flag(data?.allow_multiple, false),
      showResults: flag(data?.show_results, true),
      anonymous: flag(data?.anonymous, true),
      active: true,
      options: Object.fromEntries(options.map((text, i) => [`o${i}`, { text, position: i }])),
      createdAt: now,
      updatedAt: now,
    };
    await write(() => set(ref(db, `polls/${id}`), value));
    void logAdmin('poll_create', 'poll', id, question);
    return shapePoll({ ...value, id } as Row, {});
  },
  votePoll: async (id: string, option_ids: string[], fingerprint: string): Promise<any> => {
    if (!Array.isArray(option_ids) || option_ids.length === 0) fail('Au moins une option requise');
    const fp = safeKey(fingerprint);
    if (fp.length < 8) fail('Identifiant appareil manquant', 401);
    const [poll, votes] = await Promise.all([findItem('polls', id), watch('pollVotes')]);
    if (!poll) fail('Sondage introuvable', 404);
    if (poll.active === false) fail('Ce sondage est fermé');
    if (!poll.allowMultiple && option_ids.length > 1) fail('Ce sondage n\u2019autorise qu\u2019un seul choix');
    if (votes?.[id]?.[fp]) fail('Vous avez déjà voté');
    const valid = new Set(Object.keys(poll.options || {}));
    for (const o of option_ids) if (!valid.has(String(o))) fail('Option invalide');
    try {
      await set(ref(db, `pollVotes/${id}/${fp}`), {
        options: Object.fromEntries(option_ids.map((o) => [String(o), true])),
        createdAt: Date.now(),
      });
    } catch (err) {
      // La règle « un vote par appareil » refuse toute réécriture.
      if (String((err as any)?.code || (err as any)?.message || '').toLowerCase().includes('permission')) {
        fail('Vous avez déjà voté');
      }
      explain(err);
    }
    return shapePoll({ ...poll, id } as Row, await watch('pollVotes'), fp);
  },
  updatePoll: async (id: string, data: any): Promise<Poll> => {
    requireDelegate();
    const [polls, votes] = await Promise.all([watch('polls'), watch('pollVotes')]);
    const poll = polls?.[id];
    if (!poll) fail('Sondage introuvable', 404);
    const updates: Record<string, any> = { [`polls/${id}/updatedAt`]: Date.now() };
    if (data?.question !== undefined) {
      const q = cleanText(data.question, 300);
      if (q.length < 3) fail('Question trop courte (3 caractères minimum)');
      updates[`polls/${id}/question`] = q;
    }
    if (Array.isArray(data?.options)) {
      const current: Record<string, any> = poll.options || {};
      const incoming = (data.options as any[])
        .map((o, position) => ({ id: o?.id ? String(o.id) : '', text: cleanText(String(o?.text ?? ''), 200), position }))
        .filter((o) => o.text);
      if (incoming.length < 2) fail('Au moins 2 options sont nécessaires');
      const counts: Record<string, number> = {};
      for (const v of Object.values(votes?.[id] || {})) {
        for (const o of Object.keys((v as any)?.options || {})) counts[o] = (counts[o] || 0) + 1;
      }
      const kept = new Set(incoming.filter((o) => o.id && current[o.id]).map((o) => o.id));
      for (const optId of Object.keys(current)) {
        if (kept.has(optId)) continue;
        if (counts[optId]) {
          fail(`L'option « ${current[optId].text} » a déjà reçu des votes : elle ne peut pas être supprimée. Renomme-la si besoin.`);
        }
        updates[`polls/${id}/options/${optId}`] = null;
      }
      const used = new Set(Object.keys(current));
      let next = 0;
      for (const o of incoming) {
        let optId = o.id && current[o.id] ? o.id : '';
        if (!optId) {
          while (used.has(`o${next}`)) next++;
          if (next > 99) fail('Trop d\u2019options');
          optId = `o${next}`;
          used.add(optId);
        }
        updates[`polls/${id}/options/${optId}`] = { text: o.text, position: o.position };
      }
    }
    if (data?.allow_multiple !== undefined) updates[`polls/${id}/allowMultiple`] = flag(data.allow_multiple, false);
    if (data?.show_results !== undefined) updates[`polls/${id}/showResults`] = flag(data.show_results, true);
    if (data?.anonymous !== undefined) updates[`polls/${id}/anonymous`] = flag(data.anonymous, true);
    if (data?.active !== undefined) {
      const active = flag(data.active, true);
      updates[`polls/${id}/active`] = active;
      updates[`polls/${id}/closedAt`] = active ? null : poll.active === false ? poll.closedAt || Date.now() : Date.now();
    }
    await write(() => update(ref(db), updates));
    const after = (await watch('polls')) || {};
    return shapePoll({ ...(after[id] || {}), id } as Row, await watch('pollVotes'));
  },
  deletePoll: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    await write(() => update(ref(db), { [`polls/${id}`]: null, [`pollVotes/${id}`]: null }));
    void logAdmin('poll_delete', 'poll', id, 'Sondage supprimé');
    return { success: true };
  },

  /* ---------------- Events ---------------- */
  getEvents: async (): Promise<Event[]> =>
    rows(await watch('events'))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')))
      .map((e) => ({
        id: e.id,
        title: e.title || '',
        date: e.date || '',
        time: e.time || null,
        description: e.description || '',
        category: e.category || 'evenement',
        created_at: iso(e.createdAt),
        updated_at: iso(e.updatedAt || e.createdAt),
      })),
  createEvent: async (data: any): Promise<Event> => {
    requireDelegate();
    const title = cleanText(data?.title, 200);
    const date = cleanDate(data?.date);
    if (!title || !date) fail('Titre et date requis');
    const id = newId('events');
    const now = Date.now();
    const value = clean({
      id,
      title,
      date,
      time: cleanTime(data?.time) || undefined,
      description: cleanText(data?.description, 5000),
      category: cleanText(data?.category, 30) || 'evenement',
      createdAt: now,
      updatedAt: now,
    });
    await write(() => set(ref(db, `events/${id}`), value));
    return (await api.getEvents()).find((e) => e.id === id)!;
  },
  updateEvent: async (id: string, data: any): Promise<Event> => {
    requireDelegate();
    const all = (await watch('events')) || {};
    if (!all[id]) fail('Événement introuvable', 404);
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.title !== undefined) patch.title = cleanText(data.title, 200) || all[id].title;
    if (data?.date !== undefined) {
      const d = cleanDate(data.date);
      if (!d) fail('Date invalide');
      patch.date = d;
    }
    if (data?.time !== undefined) patch.time = cleanTime(data.time) || null;
    if (data?.description !== undefined) patch.description = cleanText(data.description, 5000);
    if (data?.category !== undefined) patch.category = cleanText(data.category, 30) || 'evenement';
    await write(() => update(ref(db, `events/${id}`), patch));
    return (await api.getEvents()).find((e) => e.id === id)!;
  },
  deleteEvent: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    await write(() => set(ref(db, `events/${id}`), null));
    return { success: true };
  },

  /* ---------------- Cahier de textes (lecture seule) ---------------- */
  /**
   * Devoirs synchronisés depuis École Directe par un script externe : le site
   * ne fait que lire `homework`. Jours triés par date, devoirs par matière.
   */
  getHomework: async (): Promise<Homework> => shapeHomework(await watch('homework')),

  /* ---------------- Resources ---------------- */
  getResources: async (): Promise<Resource[]> =>
    rows(await watch('resources'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((r) => ({
        id: r.id,
        title: r.title || '',
        description: r.description || '',
        subject: r.subject || 'autre',
        file_url: r.fileUrl || null,
        link_url: r.linkUrl || null,
        created_at: iso(r.createdAt),
        updated_at: iso(r.updatedAt || r.createdAt),
      })),
  createResource: async (data: any): Promise<Resource> => {
    requireDelegate();
    const title = cleanText(data?.title, 200);
    if (!title) fail('Titre requis');
    const id = newId('resources');
    const now = Date.now();
    await write(() =>
      set(
        ref(db, `resources/${id}`),
        clean({
          id,
          title,
          description: cleanText(data?.description, 5000),
          subject: cleanText(data?.subject, 40) || 'autre',
          fileUrl: cleanText(data?.file_url, 2000) || undefined,
          linkUrl: cleanText(data?.link_url, 2000) || undefined,
          createdAt: now,
          updatedAt: now,
        })
      )
    );
    return (await api.getResources()).find((r) => r.id === id)!;
  },
  updateResource: async (id: string, data: any): Promise<Resource> => {
    requireDelegate();
    const all = (await watch('resources')) || {};
    if (!all[id]) fail('Ressource introuvable', 404);
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.title !== undefined) patch.title = cleanText(data.title, 200) || all[id].title;
    if (data?.description !== undefined) patch.description = cleanText(data.description, 5000);
    if (data?.subject !== undefined) patch.subject = cleanText(data.subject, 40) || 'autre';
    if (data?.file_url !== undefined) patch.fileUrl = cleanText(data.file_url, 2000) || null;
    if (data?.link_url !== undefined) patch.linkUrl = cleanText(data.link_url, 2000) || null;
    await write(() => update(ref(db, `resources/${id}`), patch));
    return (await api.getResources()).find((r) => r.id === id)!;
  },
  deleteResource: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    await write(() => set(ref(db, `resources/${id}`), null));
    return { success: true };
  },

  /* ---------------- Projects ---------------- */
  getProjects: async (): Promise<Project[]> =>
    rows(await watch('projects'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((p) => ({
        id: p.id,
        name: p.name || '',
        description: p.description || '',
        status: p.status || 'en_preparation',
        date: p.date || null,
        image_url: p.imageUrl || null,
        created_at: iso(p.createdAt),
        updated_at: iso(p.updatedAt || p.createdAt),
      })),
  createProject: async (data: any): Promise<Project> => {
    requireDelegate();
    const name = cleanText(data?.name, 200);
    if (!name) fail('Nom requis');
    const id = newId('projects');
    const now = Date.now();
    await write(() =>
      set(
        ref(db, `projects/${id}`),
        clean({
          id,
          name,
          description: cleanText(data?.description, 5000),
          status: cleanText(data?.status, 30) || 'en_preparation',
          date: cleanText(data?.date, 30) || undefined,
          imageUrl: cleanText(data?.image_url, 1_500_000) || undefined,
          createdAt: now,
          updatedAt: now,
        })
      )
    );
    return (await api.getProjects()).find((p) => p.id === id)!;
  },
  updateProject: async (id: string, data: any): Promise<Project> => {
    requireDelegate();
    const all = (await watch('projects')) || {};
    if (!all[id]) fail('Projet introuvable', 404);
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.name !== undefined) patch.name = cleanText(data.name, 200) || all[id].name;
    if (data?.description !== undefined) patch.description = cleanText(data.description, 5000);
    if (data?.status !== undefined) patch.status = cleanText(data.status, 30) || 'en_preparation';
    if (data?.date !== undefined) patch.date = cleanText(data.date, 30) || null;
    if (data?.image_url !== undefined) patch.imageUrl = cleanText(data.image_url, 1_500_000) || null;
    await write(() => update(ref(db, `projects/${id}`), patch));
    return (await api.getProjects()).find((p) => p.id === id)!;
  },
  deleteProject: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    await write(() => set(ref(db, `projects/${id}`), null));
    return { success: true };
  },

  /* ---------------- Students & groups ---------------- */
  getStudents: async (): Promise<Student[]> =>
    rows(await watch('students'))
      .sort(
        (a, b) =>
          String(a.lastName || '').localeCompare(String(b.lastName || ''), 'fr') ||
          String(a.firstName || '').localeCompare(String(b.firstName || ''), 'fr')
      )
      .map(shapeStudent),
  createStudent: async (data: Partial<Student>): Promise<Student> => {
    requireDelegate();
    const first = cleanPersonName(data?.first_name);
    const last = cleanPersonName(data?.last_name);
    if (first.length < 2 || last.length < 2) fail('Prénom et nom requis');
    const id = newId('students');
    const now = Date.now();
    const value = clean({ id, firstName: first, lastName: last, birthday: cleanBirthday(data?.birthday) || undefined, createdAt: now, updatedAt: now });
    await write(() => set(ref(db, `students/${id}`), value));
    return shapeStudent({ ...value, id } as Row);
  },
  updateStudent: async (id: string, data: Partial<Student>): Promise<Student> => {
    requireDelegate();
    const all = (await watch('students')) || {};
    const s = all[id];
    if (!s) fail('Élève introuvable', 404);
    const patch: Record<string, any> = {
      firstName: cleanPersonName(data?.first_name) || s.firstName,
      lastName: cleanPersonName(data?.last_name) || s.lastName,
      updatedAt: Date.now(),
    };
    if (data?.birthday !== undefined) patch.birthday = cleanBirthday(data.birthday) || null;
    await write(() => update(ref(db, `students/${id}`), patch));
    const after = (await watch('students')) || {};
    return shapeStudent({ ...(after[id] || {}), id } as Row);
  },
  deleteStudent: async (id: string): Promise<{ success: boolean }> => {
    requireDelegate();
    const all = (await watch('students')) || {};
    if (!all[id]) fail('Élève introuvable', 404);
    // L'élève disparaît aussi des groupes où il figurait.
    const updates: Record<string, any> = { [`students/${id}`]: null };
    for (const g of rows(await watch('studentGroups'))) {
      for (const [mid, m] of Object.entries(g.members || {})) {
        if ((m as any)?.studentId === id) updates[`studentGroups/${g.id}/members/${mid}`] = null;
      }
    }
    await write(() => update(ref(db), updates));
    return { success: true };
  },
  getStudentGroups: async (fingerprint?: string): Promise<StudentGroup[]> => loadGroups(fingerprint),
  createStudentGroup: async (data: {
    name: string;
    is_private?: boolean;
    student_ids?: string[];
    member_names?: string[];
    validate_now?: boolean;
    fingerprint?: string;
  }): Promise<StudentGroup> => {
    const delegate = isDelegate();
    const name = cleanText(data?.name, 80);
    if (name.length < 2) fail('Nom du groupe requis');
    let by: string | null = null;
    const groups = (await watch('studentGroups')) || {};
    if (!delegate) {
      by = safeKey(data?.fingerprint);
      if (by.length < 8) fail('Identifiant appareil manquant', 401);
      const pending = rows(groups).some((g) => g.createdByFingerprint === by && g.status === 'en_attente');
      if (pending) {
        fail('Tu as déjà un groupe en attente : modifie-le ou supprime-le avant d\u2019en créer un autre', 409);
      }
    }
    const id = newId('studentGroups');
    const now = Date.now();
    const memberUpdates = await addMembers(id, {}, (data.student_ids || []).map(String), data.member_names || [], by);
    const updates: Record<string, any> = {
      [`studentGroups/${id}/id`]: id,
      [`studentGroups/${id}/name`]: name,
      [`studentGroups/${id}/isPrivate`]: !!data?.is_private,
      [`studentGroups/${id}/status`]: 'en_attente',
      [`studentGroups/${id}/createdAt`]: now,
      [`studentGroups/${id}/updatedAt`]: now,
      ...memberUpdates,
    };
    if (by) updates[`studentGroups/${id}/createdByFingerprint`] = by;
    if (delegate && data?.validate_now === true) {
      const members: Record<string, any> = {};
      for (const [k, v] of Object.entries(memberUpdates)) members[k] = v;
      Object.assign(updates, await claimGroup(id, members));
    }
    await write(() => update(ref(db), updates));
    return (await loadGroups(data?.fingerprint)).find((g) => g.id === id)!;
  },
  updateGroupStatus: async (id: string, status: StudentGroupStatus): Promise<StudentGroup> => {
    requireDelegate();
    if (!['en_attente', 'valide', 'refuse'].includes(status)) fail('Statut invalide');
    const groups = (await watch('studentGroups')) || {};
    const g = groups[id];
    if (!g) fail('Groupe introuvable', 404);
    let updates: Record<string, any>;
    if (status === 'valide') {
      updates = await claimGroup(id, g.members || {});
    } else {
      updates = {
        [`studentGroups/${id}/status`]: status,
        [`studentGroups/${id}/validatedAt`]: null,
        [`studentGroups/${id}/validatedBy`]: null,
        [`studentGroups/${id}/updatedAt`]: Date.now(),
      };
    }
    await write(() => update(ref(db), updates));
    void logAdmin('group_status', 'student_group', id, `Groupe « ${g.name} » : ${status}`);
    return (await loadGroups()).find((x) => x.id === id)!;
  },
  proposeGroupMember: async (
    id: string,
    member: { student_id?: string; member_name?: string },
    fingerprint?: string
  ): Promise<{ success: boolean; members: GroupMember[] }> => {
    const groups = (await watch('studentGroups')) || {};
    const g = groups[id];
    if (!g) fail('Groupe introuvable', 404);
    if (g.status !== 'en_attente') fail('Seuls les groupes en attente acceptent des propositions');
    const delegate = isDelegate();
    const by = delegate ? null : safeKey(fingerprint);
    if (!delegate) {
      if (!by || by.length < 8) fail('Identifiant appareil manquant', 401);
      if (g.isPrivate && g.createdByFingerprint !== by) {
        fail('Seul le signataire ou le délégué peut modifier un groupe privé', 403);
      }
    }
    if (Object.keys(g.members || {}).length >= MAX_GROUP) fail(`Un groupe ne peut pas dépasser ${MAX_GROUP} élèves`);
    const updates = await addMembers(
      id,
      g.members || {},
      member?.student_id ? [String(member.student_id)] : [],
      member?.member_name ? [member.member_name] : [],
      by
    );
    if (Object.keys(updates).length) await write(() => update(ref(db), updates));
    const after = (await loadGroups(fingerprint)).find((x) => x.id === id);
    return { success: true, members: after?.members || [] };
  },
  removeGroupMember: async (
    id: string,
    memberKey: string,
    fingerprint?: string
  ): Promise<{ success: boolean; members: GroupMember[] }> => {
    const groups = (await watch('studentGroups')) || {};
    const g = groups[id];
    if (!g) fail('Groupe introuvable', 404);
    const delegate = isDelegate();
    const by = safeKey(fingerprint);
    if (!delegate && (!by || g.createdByFingerprint !== by)) {
      fail(g.isPrivate ? 'Seul le signataire ou le délégué peut modifier un groupe privé' : 'Seul le signataire peut modifier ce groupe', 403);
    }
    if (!delegate && g.status !== 'en_attente') fail('Un groupe validé ne se modifie que par le délégué', 403);
    const updates: Record<string, any> = {};
    for (const [mid, m] of Object.entries(g.members || {})) {
      if ((m as any)?.memberKey === memberKey) updates[`studentGroups/${id}/members/${mid}`] = null;
    }
    if (Object.keys(updates).length) await write(() => update(ref(db), updates));
    const after = (await loadGroups(fingerprint)).find((x) => x.id === id);
    return { success: true, members: after?.members || [] };
  },
  deleteStudentGroup: async (id: string, fingerprint?: string): Promise<{ success: boolean }> => {
    const groups = (await watch('studentGroups')) || {};
    const g = groups[id];
    if (!g) fail('Groupe introuvable', 404);
    const delegate = isDelegate();
    if (!delegate) {
      if (g.status === 'valide') fail('Un groupe validé ne se supprime que par le délégué', 403);
      if (!g.createdByFingerprint || g.createdByFingerprint !== safeKey(fingerprint)) {
        fail('Seul le créateur peut supprimer son groupe en attente', 403);
      }
    }
    await write(() =>
      update(ref(db), {
        [`studentGroups/${id}`]: null,
        [`groupChats/${id}`]: null,
        [`groupChatMessages/${id}`]: null,
        [`groupChatImages/${id}`]: null,
      })
    );
    return { success: true };
  },

  /* ---------------- Revisions ---------------- */
  getRevisionSessions: async (upcoming = true, fingerprint?: string): Promise<RevisionSession[]> => {
    const today = localDay();
    return rows(await watch('revisions'))
      .filter((r) => !upcoming || String(r.date || '') >= today)
      .sort((a, b) => {
        const d = String(a.date || '').localeCompare(String(b.date || ''));
        if (d) return d;
        if (!a.time && b.time) return 1;
        if (a.time && !b.time) return -1;
        return String(a.time || '').localeCompare(String(b.time || ''));
      })
      .map((r) => shapeRevision(r, fingerprint));
  },
  createRevisionSession: async (data: Partial<RevisionSession> & { fingerprint?: string }): Promise<RevisionSession> => {
    const delegate = isDelegate();
    const fp = safeKey(data?.fingerprint);
    if (!delegate && fp.length < 8) fail('Non autorisé', 401);
    const title = cleanText(data?.title, 100);
    if (!title) fail('Titre requis');
    const date = cleanDate(data?.date);
    if (!date) fail('Date invalide');
    const id = newId('revisions');
    const now = Date.now();
    const value = clean({
      id,
      title,
      subject: cleanText(data?.subject, 30) || 'autre',
      date,
      time: cleanTime(data?.time) || undefined,
      duration: Math.min(480, Math.max(15, Math.round(Number(data?.duration) || 60))),
      location: cleanText(data?.location, 80),
      description: cleanText(data?.description, 1000),
      createdByFingerprint: delegate ? undefined : fp,
      createdAt: now,
      updatedAt: now,
    });
    await write(() => set(ref(db, `revisions/${id}`), value));
    return shapeRevision({ ...value, id } as Row, fp);
  },
  updateRevisionSession: async (id: string, data: Partial<RevisionSession> & { fingerprint?: string }): Promise<RevisionSession> => {
    const all = (await watch('revisions')) || {};
    const r = all[id];
    if (!r) fail('Session introuvable', 404);
    const delegate = isDelegate();
    const fp = safeKey(data?.fingerprint);
    if (!delegate && (fp.length < 8 || r.createdByFingerprint !== fp)) {
      fail('Tu ne peux modifier que les sessions que tu as créées', 403);
    }
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (data?.title) patch.title = cleanText(data.title, 100);
    if (data?.subject) patch.subject = cleanText(data.subject, 30);
    if (data?.date) {
      const d = cleanDate(data.date);
      if (!d) fail('Date invalide');
      patch.date = d;
    }
    if (data?.time !== undefined) patch.time = cleanTime(data.time) || null;
    if (data?.duration) patch.duration = Math.min(480, Math.max(15, Math.round(Number(data.duration) || 60)));
    if (data?.location !== undefined) patch.location = cleanText(data.location, 80);
    if (data?.description !== undefined) patch.description = cleanText(data.description, 1000);
    await write(() => update(ref(db, `revisions/${id}`), patch));
    const after = (await watch('revisions')) || {};
    return shapeRevision({ ...(after[id] || {}), id } as Row, fp);
  },
  deleteRevisionSession: async (id: string, fingerprint?: string): Promise<{ success: boolean }> => {
    const all = (await watch('revisions')) || {};
    const r = all[id];
    if (!r) fail('Session introuvable', 404);
    const fp = safeKey(fingerprint);
    if (!isDelegate() && (fp.length < 8 || r.createdByFingerprint !== fp)) {
      fail('Tu ne peux supprimer que les sessions que tu as créées', 403);
    }
    await write(() => set(ref(db, `revisions/${id}`), null));
    return { success: true };
  },

  /* ---------------- Stats & visits ---------------- */
  getStats: async (): Promise<Stats> => {
    requireDelegate();
    const [messages, ideas, polls, announcements, events] = await Promise.all([
      watch('messages'),
      watch('ideas'),
      watch('polls'),
      watch('announcements'),
      watch('events'),
    ]);
    const today = localDay();
    return {
      newMessages: rows(messages).filter((m) => (m.status || 'nouveau') === 'nouveau').length,
      newIdeas: rows(ideas).filter((i) => (i.status || 'a_etudier') === 'a_etudier').length,
      activePolls: rows(polls).filter((p) => p.active !== false).length,
      announcementsCount: rows(announcements).length,
      upcomingEvents: rows(events).filter((e) => String(e.date || '') >= today).length,
    };
  },
  recordVisit: async (fingerprint: string, page: string): Promise<{ success: boolean }> => {
    if (isDelegate()) return { success: true }; // le délégué ne fausse pas les statistiques
    const fp = safeKey(fingerprint);
    if (fp.length < 8) fail('Identifiant appareil manquant');
    const hash = (await sha256Hex(`seconde-plateforme:${fp}`)).slice(0, 24);
    const day = localDay();
    const cleanPage = cleanText(page, 60) || '/';
    await runTransaction(ref(db, `visits/${day}/${hash}`), (cur: any) => {
      const now = Date.now();
      if (!cur) return { hits: 1, firstSeenAt: now, lastSeenAt: now, page: cleanPage };
      return { ...cur, hits: Math.min((cur.hits || 0) + 1, 200), lastSeenAt: now, page: cleanPage };
    }).catch(() => {});
    return { success: true };
  },
  getVisits: async (days = 14): Promise<VisitStats> => {
    requireDelegate();
    const limit = Math.min(Math.max(Math.trunc(days) || 14, 1), 90);
    const all = (await watch('visits')) || {};
    const keys = Object.keys(all).sort().reverse();
    const latest = keys[0];
    const cutoff = localDay(Date.now() - (limit - 1) * 86_400_000);
    const out: VisitStats = {
      days: keys
        .filter((d) => d >= cutoff)
        .map((d) => {
          const entries = Object.values(all[d] || {}) as any[];
          return { day: d, visitors: entries.length, hits: entries.reduce((n, e) => n + (Number(e?.hits) || 0), 0) };
        }),
      identites: latest
        ? Object.entries(all[latest] || {})
            .map(([h, e]: [string, any]) => ({
              label: h.slice(0, 6).toUpperCase(),
              first_seen_at: iso(e?.firstSeenAt),
              last_seen_at: iso(e?.lastSeenAt),
              hits: Number(e?.hits) || 0,
              page: e?.page || null,
            }))
            .sort((a, b) => b.hits - a.hits)
        : [],
    };
    // Ménage : on ne garde que 90 jours de visites.
    const old = localDay(Date.now() - 90 * 86_400_000);
    const purge: Record<string, null> = {};
    for (const d of keys) if (d < old) purge[`visits/${d}`] = null;
    if (Object.keys(purge).length) update(ref(db), purge).catch(() => {});
    return out;
  },

  /* ---------------- Push notifications (désactivées : pas de serveur) ---------------- */
  getPushVapidKey: async (): Promise<{ publicKey: string }> => fail('Notifications indisponibles sur cette version du site', 501),
  subscribePush: async (_subscription: any): Promise<{ success: boolean }> => ({ success: false }),
  unsubscribePush: async (_endpoint: string): Promise<{ success: boolean }> => ({ success: true }),

  /* ---------------- Maintenance ---------------- */
  getMaintenanceState: async (): Promise<MaintenanceState & { is_admin: boolean }> => {
    const s = await rawSettings();
    const active = s.maintenanceMode === true;
    return {
      active,
      message: active ? s.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE : DEFAULT_MAINTENANCE_MESSAGE,
      activated_by: active ? s.maintenanceBy || 'Délégué' : null,
      activated_at: active && s.maintenanceAt ? iso(s.maintenanceAt) : null,
      is_admin: isDelegate(),
    };
  },
  activateMaintenance: async (password: string, message?: string): Promise<MaintenanceState> => {
    requireDelegate();
    if (!password) fail('Mot de passe requis pour confirmer');
    const s = await rawSettings();
    if (!(await verifyPassword(password, s.passwordHash || DEFAULT_PASSWORD_HASH))) fail('Mot de passe incorrect', 401);
    const now = Date.now();
    const msg = cleanText(message, 300) || DEFAULT_MAINTENANCE_MESSAGE;
    await write(() =>
      update(ref(db), {
        'settings/maintenanceMode': true,
        'settings/maintenanceMessage': msg,
        'settings/maintenanceBy': 'Délégué',
        'settings/maintenanceAt': now,
        [`maintenanceLog/${newId('maintenanceLog')}`]: { active: true, message: msg, by: 'Délégué', at: now },
      })
    );
    void logAdmin('maintenance_on', 'maintenance', null, 'Mode maintenance activé par Délégué');
    return { active: true, message: msg, activated_by: 'Délégué', activated_at: iso(now) };
  },
  deactivateMaintenance: async (): Promise<MaintenanceState> => {
    requireDelegate();
    const now = Date.now();
    await write(() =>
      update(ref(db), {
        'settings/maintenanceMode': false,
        'settings/maintenanceMessage': null,
        'settings/maintenanceBy': null,
        'settings/maintenanceAt': null,
        [`maintenanceLog/${newId('maintenanceLog')}`]: { active: false, by: 'Délégué', at: now },
      })
    );
    void logAdmin('maintenance_off', 'maintenance', null, 'Mode maintenance désactivé par Délégué');
    return { active: false, message: DEFAULT_MAINTENANCE_MESSAGE, deactivated_by: 'Délégué', deactivated_at: iso(now) };
  },
  getMaintenanceHistory: async (): Promise<MaintenanceLogEntry[]> => {
    requireDelegate();
    return rows(await watch('maintenanceLog'))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 50)
      .map((l) => ({
        id: l.id,
        active: l.active ? 1 : 0,
        message: l.message || '',
        activated_by: l.active ? l.by || null : null,
        activated_at: iso(l.at),
        deactivated_by: l.active ? null : l.by || null,
        deactivated_at: l.active ? null : iso(l.at),
      }));
  },

  /* ---------------- Chat ---------------- */
  joinChat: async (fingerprint: string, display_name: string): Promise<{ user: ChatUser; conversation: ChatConversation }> => {
    if (isDelegate()) return { user: await ensureDelegateChatUser(), conversation: CLASS_CONVERSATION };
    const fp = safeKey(fingerprint);
    if (fp.length < 8) fail('Identifiant appareil manquant');
    const users = (await watch('chatUsers')) || {};
    const existing = users[fp];
    let name = '';
    if (display_name) {
      name = cleanFirstName(display_name);
      if (!isValidFirstName(name)) fail('Écris uniquement ton prénom, sans espace');
    } else if (!existing) {
      fail('Choisis ton prénom');
    }
    name = (name || existing.displayName).slice(0, 20);
    const now = Date.now();
    await write(() =>
      set(
        ref(db, `chatUsers/${fp}`),
        clean({ ...(existing || {}), displayName: name, kind: 'student', lastSeenAt: now, createdAt: existing?.createdAt || now })
      )
    );
    return { user: { id: fp, display_name: name, kind: 'student' }, conversation: CLASS_CONVERSATION };
  },
  getChatConversation: async (
    fingerprint?: string
  ): Promise<{ conversation: ChatConversation; user: ChatUser | null; unread: number }> => {
    const user = await currentChatUser(fingerprint);
    const unread = user ? (await api.getChatUnread(fingerprint || '')).unread : 0;
    return { conversation: CLASS_CONVERSATION, user, unread };
  },
  getChatMessages: async (
    fingerprint: string | null,
    conversation_id: string,
    after: string = ''
  ): Promise<{ messages: ChatMessage[]; conversation_id: string; reaction_updates?: Record<string, ChatReactionCounts> }> => {
    const gid = groupIdFromConversation(conversation_id);
    if (gid) {
      await canUseGroup(gid, fingerprint);
    } else if (!(await currentChatUser(fingerprint))) {
      fail('Profil inconnu', 403);
    }
    const me = chatKey(fingerprint);
    const [value, reactions] = await Promise.all([watch(messagesPath(conversation_id)), watch('chatReactions')]);
    const all = liveMessages(value);
    const after_ = after ? String(after) : '';
    const fresh = (after_ ? all.filter((m) => m.id > after_) : all.slice(-100)).map((m) =>
      shapeChatMessage(m, conversation_id, reactions, me)
    );
    let reaction_updates: Record<string, ChatReactionCounts> | undefined;
    if (after_) {
      reaction_updates = {};
      for (const m of all.slice(-100)) reaction_updates[m.id] = reactionCounts(reactions, m.id, me);
    }
    return { messages: fresh, conversation_id, reaction_updates };
  },
  sendChatMessage: async (data: {
    content: string;
    image?: string | null;
    conversation_id: string;
    fingerprint?: string;
  }): Promise<{ message: ChatMessage }> => {
    const user = await currentChatUser(data.fingerprint);
    if (!user) fail('Profil inconnu', 403);
    if (groupIdFromConversation(data.conversation_id)) {
      const gid = groupIdFromConversation(data.conversation_id)!;
      return api.sendGroupChatMessage({ groupId: gid, content: data.content, image: data.image, fingerprint: data.fingerprint });
    }
    const content = cleanText(data.content, 2000);
    const image = checkImage(data.image);
    if (!content && !image) fail('Message vide');
    checkSendRate();
    const id = newId('chatMessages');
    const now = Date.now();
    const value = clean({
      senderId: user.id,
      senderName: user.display_name.slice(0, 20),
      senderKind: user.kind === 'delegate' ? 'delegate' : 'student',
      content,
      hasImage: image ? true : undefined,
      createdAt: now,
    });
    const updates: Record<string, any> = { [`chatMessages/${id}`]: value, [`chatUsers/${user.id}/lastReadAt`]: now };
    if (image) updates[`chatImages/${id}`] = image;
    await write(() => update(ref(db), updates));
    return { message: shapeChatMessage({ ...value, id } as Row, CLASS_CONVERSATION.id, {}, user.id) };
  },
  markChatRead: async (conversation_id: string, fingerprint?: string): Promise<{ success: boolean }> => {
    const user = await currentChatUser(fingerprint);
    if (!user) return { success: false };
    if (groupIdFromConversation(conversation_id)) return { success: true };
    await update(ref(db, `chatUsers/${user.id}`), { lastReadAt: Date.now(), lastSeenAt: Date.now() }).catch(() => {});
    return { success: true };
  },
  getChatUnread: async (fingerprint: string): Promise<{ unread: number }> => {
    const key = chatKey(fingerprint);
    if (!key) return { unread: 0 };
    const users = (await watch('chatUsers')) || {};
    const u = users[key];
    if (!u) return { unread: 0 };
    const since = Number(u.lastReadAt) || Number(u.createdAt) || 0;
    const value = await watch('chatMessages');
    return { unread: liveMessages(value).filter((m) => (m.createdAt || 0) > since && m.senderId !== key).length };
  },
  /** Image d'un message (chat de classe ou de groupe), en data URL. */
  getChatImage: async (messageId: string, conversation_id: string = 'classe'): Promise<string | null> => {
    const gid = groupIdFromConversation(conversation_id);
    if (gid) return (await readOnce(`groupChatImages/${gid}/${messageId}`)) || null;
    const msgs = (await watch('chatMessages')) || {};
    if (msgs[messageId]?.image) return msgs[messageId].image; // ancien format (image dans le message)
    return (await readOnce(`chatImages/${messageId}`)) || null;
  },
  deleteChatMessage: async (id: string, fingerprint?: string): Promise<{ success: boolean }> => {
    const msgs = (await watch('chatMessages')) || {};
    const m = msgs[id];
    if (!m) fail('Message introuvable', 404);
    const delegate = isDelegate();
    if (!delegate && (!fingerprint || m.senderId !== safeKey(fingerprint))) fail('Suppression non autorisée', 403);
    await write(() => update(ref(db), { [`chatMessages/${id}`]: null, [`chatImages/${id}`]: null, [`chatReactions/${id}`]: null }));
    if (delegate) void logAdmin('chat_message_delete', 'chat_message', id, `Message de ${m.senderName} supprimé`);
    return { success: true };
  },
  getChatMembers: async (): Promise<ChatMemberInfo[]> => {
    requireDelegate();
    const [users, value] = await Promise.all([watch('chatUsers'), watch('chatMessages')]);
    const msgs = liveMessages(value);
    return rows(users)
      .map((u) => {
        const mine = msgs.filter((m) => m.senderId === u.id);
        return {
          id: u.id,
          display_name: u.displayName || '?',
          kind: u.kind || 'student',
          joined_at: iso(u.createdAt),
          last_seen_at: iso(u.lastSeenAt || u.createdAt),
          message_count: mine.length,
          last_message_at: mine.length ? iso(mine[mine.length - 1].createdAt) : null,
        };
      })
      .sort((a, b) => (a.kind === 'delegate' ? -1 : b.kind === 'delegate' ? 1 : b.last_seen_at.localeCompare(a.last_seen_at)));
  },
  deleteChatDay: async (date: string): Promise<{ success: boolean; deleted: number; date: string }> => {
    requireDelegate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Date invalide');
    const msgs = liveMessages(await watch('chatMessages')).filter((m) => localDay(m.createdAt || 0) === date);
    if (msgs.length === 0) fail('Aucun message à cette date', 404);
    const updates: Record<string, null> = {};
    for (const m of msgs) {
      updates[`chatMessages/${m.id}`] = null;
      updates[`chatImages/${m.id}`] = null;
      updates[`chatReactions/${m.id}`] = null;
    }
    await write(() => update(ref(db), updates));
    void logAdmin('chat_day_delete', 'chat_conversation', 'classe', `Journée du ${date} supprimée (${msgs.length} message(s))`);
    return { success: true, deleted: msgs.length, date };
  },
  toggleChatReaction: async (
    messageId: string,
    reaction: ChatReaction,
    fingerprint?: string | null
  ): Promise<{ reaction: ChatReaction; active: number; mine: boolean; counts: ChatReactionCounts }> => {
    if (isDelegate()) fail('Les réactions sont réservées aux élèves', 403);
    if (!CHAT_REACTIONS.includes(reaction)) fail('Réaction inconnue');
    const fp = safeKey(fingerprint);
    if (fp.length < 8) fail('Identifiant appareil manquant', 401);
    const all = (await watch('chatReactions')) || {};
    const active = !all?.[messageId]?.[reaction]?.[fp];
    await write(() => set(ref(db, `chatReactions/${messageId}/${reaction}/${fp}`), active ? true : null));
    return { reaction, active: active ? 1 : 0, mine: active, counts: reactionCounts(await watch('chatReactions'), messageId, fp) };
  },

  /* ---------------- Birthdays ---------------- */
  getBirthdays: async (): Promise<{ birthdays: BirthdayEntry[] }> => {
    const [students, selfEntered] = await Promise.all([watch('students'), watch('birthdays')]);
    const list: BirthdayEntry[] = [];
    const seen = new Set<string>();
    for (const s of rows(students)) {
      if (!s.birthday) continue;
      const first = String(s.firstName || '').split(' ')[0];
      list.push({ fingerprint: `eleve-${s.id}`, date_mmdd: s.birthday, first_name: first });
      seen.add(`${normalizeName(first)}|${s.birthday}`);
    }
    for (const [fp, b] of Object.entries(selfEntered || {}) as [string, any][]) {
      if (!b?.dateMmdd || !b?.firstName) continue;
      const key = `${normalizeName(b.firstName)}|${b.dateMmdd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ fingerprint: fp, date_mmdd: b.dateMmdd, first_name: b.firstName });
    }
    return { birthdays: list };
  },
  setMyBirthday: async (
    fingerprint: string,
    date_mmdd: string,
    first_name: string
  ): Promise<{ success: boolean; date_mmdd: string; first_name: string }> => {
    const fp = safeKey(fingerprint);
    if (fp.length < 8) fail('Identifiant appareil manquant', 401);
    const date = cleanBirthday(date_mmdd);
    if (!date) fail('Format de date invalide (attendu MM-JJ)');
    const name = cleanFirstName(first_name).split(' ')[0];
    if (!name) fail('Prénom requis');
    await write(() => set(ref(db, `birthdays/${fp}`), { dateMmdd: date, firstName: name, updatedAt: Date.now() }));
    return { success: true, date_mmdd: date, first_name: name };
  },

  /* ---------------- Group chats ---------------- */
  getMyGroupChat: async (fingerprint: string): Promise<{ conversation: GroupChatConversation }> => {
    const g = await findMyGroup(fingerprint);
    if (!g) fail('Aucun groupe validé', 404);
    return { conversation: await shapeGroupConversation(g) };
  },
  getGroupChats: async (): Promise<{ conversations: GroupChatConversation[] }> => {
    requireDelegate();
    const groups = rows(await watch('studentGroups')).filter((g) => g.status === 'valide');
    const conversations = await Promise.all(groups.map(shapeGroupConversation));
    conversations.sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
    return { conversations };
  },
  getGroupChat: async (groupId: string, fingerprint?: string | null): Promise<{ conversation: GroupChatConversation }> => {
    const g = await canUseGroup(groupId, fingerprint);
    return { conversation: await shapeGroupConversation(g) };
  },
  closeGroupChat: async (groupId: string): Promise<{ success: boolean; closed: boolean }> => {
    requireDelegate();
    await write(() => update(ref(db, `groupChats/${groupId}`), { closed: true, lastActivityAt: Date.now() }));
    return { success: true, closed: true };
  },
  reopenGroupChat: async (groupId: string): Promise<{ success: boolean; closed: boolean }> => {
    requireDelegate();
    await write(() => update(ref(db, `groupChats/${groupId}`), { closed: false, lastActivityAt: Date.now() }));
    return { success: true, closed: false };
  },
  sendGroupChatMessage: async (data: {
    groupId: string;
    content: string;
    image?: string | null;
    fingerprint?: string | null;
  }): Promise<{ message: ChatMessage }> => {
    const g = await canUseGroup(data.groupId, data.fingerprint);
    const chats = (await watch('groupChats')) || {};
    const delegate = isDelegate();
    if (chats[g.id]?.closed && !delegate) fail('Ce groupe a été fermé par le délégué', 403);
    let sender: ChatUser | null = await currentChatUser(data.fingerprint);
    if (!sender && !delegate) {
      const name = cleanFirstName(getFirstName());
      if (!isValidFirstName(name)) fail('Rejoins d\u2019abord le chat de classe avec ton prénom', 403);
      sender = { id: safeKey(data.fingerprint), display_name: name, kind: 'student' };
    }
    const content = cleanText(data.content, 2000);
    const image = checkImage(data.image);
    if (!content && !image) fail('Message vide');
    checkSendRate();
    const id = newId(`groupChatMessages/${g.id}`);
    const now = Date.now();
    const value = clean({
      senderId: sender!.id,
      senderName: sender!.display_name.slice(0, 20),
      senderKind: sender!.kind === 'delegate' ? 'delegate' : 'student',
      content,
      hasImage: image ? true : undefined,
      createdAt: now,
    });
    const updates: Record<string, any> = {
      [`groupChatMessages/${g.id}/${id}`]: value,
      [`groupChats/${g.id}/lastActivityAt`]: now,
    };
    if (!chats[g.id]) updates[`groupChats/${g.id}/closed`] = false;
    if (image) updates[`groupChatImages/${g.id}/${id}`] = image;
    await write(() => update(ref(db), updates));
    return { message: shapeChatMessage({ ...value, id } as Row, groupConversationId(g.id), {}, sender!.id) };
  },

  /* ---------------- Sheets ---------------- */
  getSheets: async (
    params: { subject?: string | null; q?: string | null; page?: number; fingerprint?: string | null; status?: string | null } = {}
  ): Promise<SheetListResponse> => {
    const delegate = isDelegate();
    const subject = cleanText(params.subject, 40);
    const q = normalizeName(cleanText(params.q, 60));
    const page = Math.max(1, Number(params.page) || 1);
    let list = rows(await watch('sheets'));
    if (!delegate) list = list.filter((s) => (s.status || 'active') === 'active');
    else if (params.status === 'active' || params.status === 'hidden') list = list.filter((s) => (s.status || 'active') === params.status);
    if (subject) list = list.filter((s) => s.subject === subject);
    if (q) {
      list = list.filter((s) =>
        normalizeName(`${s.title || ''} ${s.description || ''} ${s.authorName || ''}`).includes(q)
      );
    }
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const total = list.length;
    const items = list.slice((page - 1) * SHEETS_PER_PAGE, page * SHEETS_PER_PAGE).map((s) => shapeSheet(s, params.fingerprint));
    return { items, total, page, limit: SHEETS_PER_PAGE, has_more: page * SHEETS_PER_PAGE < total };
  },
  createSheet: async (data: {
    title: string;
    subject: string;
    class_level?: string;
    description?: string;
    file: string;
    fingerprint?: string | null;
    author_name?: string;
  }): Promise<Sheet> => {
    const title = cleanText(data?.title, 80);
    const author = cleanText(data?.author_name, 40);
    if (!title || !author) fail('Titre et auteur requis');
    if (author.length < 2) fail('Auteur : au moins 2 caractères');
    const file = data?.file;
    if (!file || typeof file !== 'string') fail('Aucun fichier reçu');
    const m = file.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,/i);
    if (!m) fail('Format de fichier non autorisé');
    const mime = m[1].toLowerCase();
    const isImage = /^image\/(jpeg|png|webp|gif)$/.test(mime);
    const isPdf = mime === 'application/pdf';
    if (!isImage && !isPdf) fail('Type de fichier non autorisé (images JPG/PNG/WEBP/GIF ou PDF uniquement)');
    if (file.length > MAX_SHEET_FILE_CHARS) fail('Fichier trop volumineux (max 4 Mo)');
    const size = Math.floor(((file.length - m[0].length) * 3) / 4);
    const fp = safeKey(data?.fingerprint);
    const id = newId('sheets');
    const now = Date.now();
    const meta = clean({
      id,
      title,
      subject: cleanText(data?.subject, 40) || 'autre',
      classLevel: cleanText(data?.class_level, 20) || undefined,
      description: cleanText(data?.description, 500),
      authorName: author,
      authorFingerprint: fp || undefined,
      fileName: `fiche.${isPdf ? 'pdf' : mime.split('/')[1]}`,
      mimeType: mime,
      fileSize: size,
      hasFile: true,
      kind: isImage ? 'image' : 'document',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await write(() => update(ref(db), { [`sheets/${id}`]: meta, [`sheetFiles/${id}`]: { data: file, mimeType: mime } }));
    return shapeSheet({ ...meta, id } as Row, data?.fingerprint);
  },
  setSheetStatus: async (id: string, status: 'active' | 'hidden'): Promise<{ success: boolean; status: string }> => {
    requireDelegate();
    if (status !== 'active' && status !== 'hidden') fail('Statut invalide');
    await write(() => update(ref(db, `sheets/${id}`), { status, updatedAt: Date.now() }));
    void logAdmin(status === 'hidden' ? 'sheet_hide' : 'sheet_show', 'sheet', id, null);
    return { success: true, status };
  },
  deleteSheet: async (id: string, fingerprint?: string | null): Promise<{ success: boolean }> => {
    const all = (await watch('sheets')) || {};
    const s = all[id];
    if (!s) fail('Fiche introuvable', 404);
    const delegate = isDelegate();
    if (!delegate && (!fingerprint || s.authorFingerprint !== safeKey(fingerprint))) {
      fail('Seul l\u2019auteur ou le délégué peut supprimer cette fiche', 403);
    }
    await write(() => update(ref(db), { [`sheets/${id}`]: null, [`sheetFiles/${id}`]: null }));
    blobCache.delete(`sheetFiles/${id}`);
    if (delegate) void logAdmin('sheet_delete', 'sheet', id, s.title || null);
    return { success: true };
  },
  /** Contenu du fichier d'une fiche, en data URL (ou null). */
  getSheetFile: async (id: string): Promise<string | null> => {
    const all = (await watch('sheets')) || {};
    if (all[id]?.fileData) return all[id].fileData; // ancien format
    const f = await readOnce(`sheetFiles/${id}`);
    return f?.data || null;
  },

  /* ---------------- Administration ---------------- */
  getChatUsers: async (): Promise<ChatUser[]> => {
    requireDelegate();
    const members = await api.getChatMembers();
    return members.map((m) => ({
      id: m.id,
      display_name: m.display_name,
      kind: m.kind,
      created_at: m.joined_at,
      last_seen_at: m.last_seen_at,
      message_count: m.message_count,
    }));
  },
  getAdminLog: async (limit = 50): Promise<AdminLogEntry[]> => {
    requireDelegate();
    return rows(await watch('adminLog'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, Math.min(limit, 200))
      .map((l) => ({
        id: l.id,
        action: l.action || '',
        target_type: l.targetType || null,
        target_id: l.targetId || null,
        detail: l.detail || null,
        created_at: iso(l.createdAt),
      }));
  },
  getAdminOverview: async (): Promise<AdminOverview> => {
    requireDelegate();
    const [sheets, msgs, users] = await Promise.all([watch('sheets'), watch('chatMessages'), watch('chatUsers')]);
    const s = rows(sheets);
    const m = liveMessages(msgs);
    return {
      sheets: s.filter((x) => (x.status || 'active') === 'active').length,
      hiddenSheets: s.filter((x) => x.status === 'hidden').length,
      chatMessages: m.length,
      chatUsers: rows(users).filter((u) => (u.kind || 'student') === 'student').length,
      imagesPosted: m.filter((x) => x.hasImage || x.image).length,
    };
  },
  getStorage: async (): Promise<{ persistent_storage: boolean; db_path: string; backups: { file: string; date: string; size: number }[] }> => ({
    persistent_storage: true,
    db_path: 'Firebase Realtime Database',
    backups: [],
  }),
  exportDatabase: async (): Promise<any> => {
    requireDelegate();
    const data: Record<string, any> = {};
    for (const path of BACKUP_PATHS) {
      try {
        data[path] = await fetchOnce(path);
      } catch {
        data[path] = null;
      }
    }
    return { format: 'seconde-firebase', version: 1, exported_at: new Date().toISOString(), data };
  },
  /**
   * Restaure un export (format Firebase de ce site). Chaque élément est réécrit
   * un par un : les règles refusent certaines réécritures (votes déjà présents,
   * journal), elles sont simplement ignorées.
   */
  importDatabase: async (payload: any, _confirmEmpty = false): Promise<{ success: boolean }> => {
    requireDelegate();
    if (!payload || payload.format !== 'seconde-firebase' || typeof payload.data !== 'object') {
      fail('Fichier de sauvegarde invalide (seules les sauvegardes de cette version du site sont acceptées)');
    }
    let written = 0;
    for (const path of BACKUP_PATHS) {
      const value = payload.data[path];
      if (!value || typeof value !== 'object' || path === 'adminLog') continue;
      if (path === 'settings') {
        await update(ref(db, 'settings'), value).then(() => written++).catch(() => {});
        continue;
      }
      for (const [key, child] of Object.entries(value)) {
        await set(ref(db, `${path}/${key}`), child).then(() => written++).catch(() => {});
      }
    }
    if (!written) fail('Rien n\u2019a pu être restauré');
    void logAdmin('backup_import', 'database', null, `${written} élément(s) restauré(s)`);
    return { success: true };
  },
  getStorageInfo: async (): Promise<any> => api.getStorage(),
};

/**
 * Suit le cahier de textes en temps réel : `onData` reçoit la valeur courante
 * tout de suite, puis à chaque nouvelle synchronisation. Renvoie la fonction
 * qui arrête le suivi (à appeler au démontage).
 */
export function subscribeHomework(
  onData: (homework: Homework) => void,
  onError?: (err: unknown) => void
): () => void {
  let active = true;
  const emit = () => {
    api
      .getHomework()
      .then((h) => {
        if (active) onData(h);
      })
      .catch((err) => {
        if (active) onError?.(err);
      });
  };
  const onChange = (ev: globalThis.Event) => {
    const paths: string[] | undefined = (ev as CustomEvent).detail?.paths;
    if (!paths || paths.includes('homework')) emit();
  };
  emit();
  window.addEventListener(DATA_CHANGED_EVENT, onChange);
  return () => {
    active = false;
    window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  };
}

// Tests automatisés uniquement (build branché sur l'émulateur) : jamais en production.
if (import.meta.env.VITE_FIREBASE_EMULATOR && typeof window !== 'undefined') {
  (window as any).__api = api;
}
