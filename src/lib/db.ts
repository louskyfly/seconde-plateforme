import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id?: string;
  content: string;
  senderId: string;
  senderName: string;
  senderKind: 'student' | 'delegate';
  image?: string;
  createdAt: number;
  reactions?: Record<string, { total: number; mine: boolean }>;
}

export interface Idea {
  id?: string;
  title: string;
  description: string;
  authorName: string | null;
  anonymous: boolean;
  fingerprint: string | null;
  status: 'a_etudier' | 'en_discussion' | 'transmise' | 'realisee' | 'non_retenue';
  createdAt: number;
  updatedAt: number;
  delegateResponse?: string;
  delegateRepliedAt?: number;
}

export interface IdeaReply {
  id?: string;
  ideaId: string;
  content: string;
  authorName: string;
  fingerprint: string;
  deletedAt?: number;
  createdAt: number;
}

export interface RevisionSession {
  id?: string;
  title: string;
  subject: string;
  date: string;
  time?: string;
  duration: number;
  location: string;
  description: string;
  createdByFingerprint: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Sheet {
  id?: string;
  title: string;
  subject: string;
  classLevel: string;
  description: string;
  authorName: string;
  authorFingerprint: string | null;
  fileData: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number;
  kind: 'image' | 'document';
  status: 'active' | 'hidden';
  createdAt: number;
  updatedAt: number;
}

export interface Student {
  id?: number;
  firstName: string;
  lastName: string;
  birthday?: string;
  createdAt?: number;
}

export interface StudentGroup {
  id?: number;
  name: string;
  isPrivate: boolean;
  status: 'en_attente' | 'valide' | 'refuse';
  createdByFingerprint: string | null;
  validatedAt?: number;
  validatedBy?: string;
  createdAt?: number;
}

export interface StudentGroupMember {
  id?: number;
  groupId: number;
  studentId: number | null;
  memberName: string;
  memberKey: string;
  addedByFingerprint: string | null;
  addedAt?: number;
}

export interface Birthday {
  fingerprint: string;
  dateMmdd: string;
  firstName: string;
  updatedAt: number;
}

export interface ChatUser {
  id?: number;
  displayName: string;
  display_name?: string;
  kind: 'student' | 'delegate';
  fingerprint: string | null;
  lastSeenAt: number;
  createdAt?: number;
}

export interface ChatConversation {
  id?: number;
  title: string | null;
  isGroup: boolean;
  createdBy: number | null;
  groupId: number | null;
  closed: boolean;
  createdAt?: number;
  lastActivityAt?: number;
}

export interface ChatMessageDB {
  id?: number;
  conversationId: number;
  senderId: number;
  content: string;
  image?: string;
  createdAt: number;
  deletedAt?: number;
  deletedBy?: string;
}

export interface ChatReaction {
  id?: number;
  messageId: number;
  reaction: 'pouce' | 'rire' | 'coeur';
  userId: number;
  createdAt: number;
}

export interface Announcement {
  id?: number;
  title: string;
  description: string;
  category: string;
  importance: string;
  author: string;
  attachmentUrl?: string;
  image?: string;
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AnnouncementReaction {
  id?: number;
  announcementId: number;
  reaction: string;
  reactorFingerprint: string;
  createdAt: number;
}

export interface Poll {
  id?: number;
  question: string;
  allowMultiple: boolean;
  showResults: boolean;
  anonymous: boolean;
  active: boolean;
  createdAt: number;
  closedAt?: number;
  options?: PollOption[];
  totalVotes?: number;
  totalVoters?: number;
  hasVoted?: boolean;
}

export interface PollOption {
  id?: number;
  pollId: number;
  text: string;
  position: number;
  votes?: number;
}

export interface PollVote {
  id?: number;
  pollId: number;
  optionId: number;
  voterFingerprint: string;
  createdAt: number;
}

export interface Event {
  id?: number;
  title: string;
  date: string;
  time?: string;
  description: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id?: number;
  name: string;
  description: string;
  status: string;
  date?: string;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Resource {
  id?: number;
  title: string;
  description: string;
  subject: string;
  fileUrl?: string;
  linkUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id?: number;
  content: string;
  category: string;
  anonymous: boolean;
  authorName: string | null;
  fingerprint: string | null;
  status: string | null;
  delegateReply: string | null;
  repliedAt: number | null;
  responseReadAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  id: number;
  className: string;
  delegateName: string;
  delegateLinkToken: string;
  passwordHash: string;
  password_hash?: string;
  accentColor: string;
  homeInfo: string;
  homeImage?: string;
  seasonTheme: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdminLoginAttempt {
  id?: number;
  ipAddress: string;
  attemptedAt: number;
  success: boolean;
}

export interface PushSubscription {
  id?: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
}

export interface Visit {
  fingerprint: string;
  day: string;
  page: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  hits: number;
}

export interface ChatMember {
  conversationId: number;
  userId: number;
  lastReadAt: number;
  lastReadMessageId: number;
  joinedAt: number;
}

export interface StudentGroupValidated {
  studentId: number;
  groupId: number;
}

export interface RevisionSessionProposed {
  id?: number;
  title: string;
  subject: string;
  date: string;
  time?: string;
  duration: number;
  location: string;
  description: string;
  createdByFingerprint: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
}

export interface AdminLog {
  id?: number;
  action: string;
  targetType: string;
  targetId: number | null;
  detail: string | null;
  createdAt: number;
}

/**
 * Ancienne base locale (IndexedDB, propre à chaque appareil).
 * Elle n'est plus utilisée par les pages : toutes les données partagées sont
 * dans Firebase. Elle ne sert plus qu'à l'import unique (src/lib/migrateLocal.ts)
 * des données déjà saisies sur un appareil.
 */
class LocalDatabase extends Dexie {
  chatMessages!: Table<ChatMessage>;
  ideas!: Table<Idea>;
  ideaReplies!: Table<IdeaReply>;
  revisionSessions!: Table<RevisionSession>;
  sheets!: Table<Sheet>;
  students!: Table<Student>;
  studentGroups!: Table<StudentGroup>;
  studentGroupMembers!: Table<StudentGroupMember>;
  birthdays!: Table<Birthday>;
  chatUsers!: Table<ChatUser>;
  chatConversations!: Table<ChatConversation>;
  chatMessagesDB!: Table<ChatMessageDB>;
  chatReactions!: Table<ChatReaction>;
  chatMembers!: Table<ChatMember>;
  announcements!: Table<Announcement>;
  announcementReactions!: Table<AnnouncementReaction>;
  polls!: Table<Poll>;
  pollOptions!: Table<PollOption>;
  pollVotes!: Table<PollVote>;
  events!: Table<Event>;
  projects!: Table<Project>;
  resources!: Table<Resource>;
  messages!: Table<Message>;
  settings!: Table<Settings>;
  adminLoginAttempts!: Table<AdminLoginAttempt>;
  pushSubscriptions!: Table<PushSubscription>;
  visits!: Table<Visit>;
  adminLog!: Table<AdminLog>;
  revisionSessionsProposed!: Table<RevisionSessionProposed>;

  constructor() {
    super('SecondePlatformLocal');

    this.version(1).stores({
      chatMessages: '++id, content, senderId, senderName, senderKind, createdAt',
      ideas: '++id, title, description, authorName, anonymous, fingerprint, status, createdAt, updatedAt',
      ideaReplies: '++id, ideaId, content, authorName, fingerprint, deletedAt, createdAt',
      revisionSessions: '++id, title, subject, date, time, duration, location, description, createdByFingerprint, createdAt, updatedAt',
      sheets: '++id, title, subject, classLevel, description, authorName, authorFingerprint, kind, mimeType, fileSize, fileName, status, createdAt, updatedAt',
      students: '++id, firstName, lastName, birthday, createdAt',
      studentGroups: '++id, name, isPrivate, status, createdByFingerprint, createdAt, validatedAt, validatedBy',
      studentGroupMembers: '++id, groupId, studentId, memberName, memberKey, addedByFingerprint, addedAt',
      birthdays: 'fingerprint, dateMmdd, firstName, updatedAt',
      chatUsers: '++id, displayName, kind, fingerprint, lastSeenAt',
      chatConversations: '++id, title, isGroup, createdBy, groupId, closed, createdAt, lastActivityAt',
      chatMessagesDB: '++id, conversationId, senderId, content, image, createdAt, deletedAt, deletedBy',
      chatReactions: '++id, messageId, reaction, userId, createdAt',
      chatMembers: '[conversationId+userId], conversationId, userId, lastReadAt, lastReadMessageId, joinedAt',
      announcements: '++id, title, description, category, importance, author, published, createdAt, updatedAt',
      announcementReactions: '++id, announcementId, reaction, reactorFingerprint, createdAt',
      polls: '++id, question, allowMultiple, showResults, anonymous, active, createdAt, closedAt',
      pollOptions: '++id, pollId, text, position',
      pollVotes: '++id, pollId, optionId, voterFingerprint, createdAt',
      events: '++id, title, date, time, description, category, createdAt, updatedAt',
      projects: '++id, name, description, status, date, imageUrl, createdAt, updatedAt',
      resources: '++id, title, description, subject, fileUrl, linkUrl, createdAt, updatedAt',
      messages: '++id, content, category, anonymous, authorName, fingerprint, status, delegateReply, repliedAt, responseReadAt, createdAt, updatedAt',
      settings: 'id, className, delegateName, delegateLinkToken, passwordHash, accentColor, homeInfo, homeImage, seasonTheme, createdAt, updatedAt',
      adminLoginAttempts: '++id, ipAddress, attemptedAt, success',
      pushSubscriptions: '++id, endpoint, p256dh, auth, createdAt',
      visits: '[fingerprint+day], fingerprint, day, page, firstSeenAt, lastSeenAt, hits',
      adminLog: '++id, action, targetType, targetId, detail, createdAt',
      revisionSessionsProposed: '++id, title, subject, date, time, duration, location, description, createdByFingerprint, status, createdAt, updatedAt',
    });
  }
}

export const db = new LocalDatabase();

export const generateId = () => uuidv4();
export const now = () => Date.now();
export { getFingerprint } from './device';
import { getFingerprint as _fp } from './device';
export const fingerprint = () => _fp();

export default db;