import type {
  Settings,
  Announcement,
  Idea,
  IdeaReply,
  Message,
  Poll,
  Event,
  Resource,
  Project,
  Student,
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
  Sheet,
  SheetListResponse,
  AdminLogEntry,
  AdminOverview,
} from '../types';

const BASE = '/api';

/**
 * Levée quand une écriture renvoie 401 : le serveur a redémarré (Render le fait
 * souvent sur le plan gratuit) et le store de session, en mémoire, a été vidé.
 * Le client croyait encore être connecté et chaque action échouait sur un
 * message incompréhensible. Cet événement force l'affichage de l'écran de
 * connexion.
 */
export const SESSION_EXPIRED_EVENT = 'api:session-expired';

/**
 * Erreur d'API porteuse du statut HTTP.
 *
 * Le message brut du serveur ("Non autorisé", "Erreur serveur"…) ne dit pas à
 * l'utilisateur quoi faire. On remonte ici un message actionnable.
 */
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
  } catch {
    // Coupure réseau ou service indisponible : on ne parle pas de "401".
    throw new ApiError('Connexion impossible : vérifie ton réseau et réessaie.', 0);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: '' }));
    if (res.status === 401) {
      // /api/auth/* gère lui-même ses erreurs : pas de boucle de redirection.
      if (!path.startsWith('/auth')) {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      }
      throw new ApiError('Session expirée : reconnecte-toi pour continuer.', res.status);
    }
    if (res.status === 503 && (data as any).maintenance) {
      throw new ApiError('Le site est momentanément en maintenance.', res.status);
    }
    throw new ApiError(data.error || `Erreur ${res.status}`, res.status);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (password: string, token?: string) => request<{ success: boolean }>('/auth/login', { method: 'POST', body: JSON.stringify({ password, token }) }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  checkAuth: () => request<{ authenticated: boolean }>('/auth/check'),
  validateToken: (token: string) => request<{ valid: boolean }>(`/auth/validate-token/${encodeURIComponent(token)}`),
  
  // Settings
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (data: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  regenerateToken: () => request<{ token: string }>('/settings/regenerate-token', { method: 'POST' }),
  changePassword: (old_password: string, new_password: string) => request<{ success: boolean }>('/settings/change-password', { method: 'POST', body: JSON.stringify({ old_password, new_password }) }),
  
  // Announcements
  getAnnouncements: (fingerprint?: string) =>
    request<Announcement[]>('/announcements' + (fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : '')),
  createAnnouncement: (data: any) => request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(data) }),
  updateAnnouncement: (id: number, data: any) => request<Announcement>(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAnnouncement: (id: number) => request<{ success: boolean }>(`/announcements/${id}`, { method: 'DELETE' }),
  reactToAnnouncement: (id: number, reaction: string, fingerprint: string) =>
    request<{ reactions: Record<string, number>; my_reactions: string[] }>(`/announcements/${id}/react`, {
      method: 'POST',
      body: JSON.stringify({ reaction, fingerprint }),
    }),
  
  // Ideas
  getIdeas: () => request<Idea[]>('/ideas'),
  createIdea: (data: any) => request<Idea>('/ideas', { method: 'POST', body: JSON.stringify(data) }),
  updateIdea: (id: number, data: any) => request<Idea>(`/ideas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIdea: (id: number) => request<{ success: boolean }>(`/ideas/${id}`, { method: 'DELETE' }),

  // Réponses aux idées (fil de discussion public sous chaque idée)
  getIdeaReplies: (id: number) => request<IdeaReply[]>(`/ideas/${id}/replies`),
  createIdeaReply: (id: number, data: any) =>
    request<IdeaReply>(`/ideas/${id}/replies`, { method: 'POST', body: JSON.stringify(data) }),
  deleteIdeaReply: (replyId: number, fingerprint: string) =>
    request<{ success: boolean }>(`/ideas/replies/${replyId}`, {
      method: 'DELETE',
      body: JSON.stringify({ fingerprint }),
    }),
  
  // Messages
  getMessages: () => request<Message[]>('/messages'),
  sendMessage: (data: any) => request<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  getMyMessages: (fingerprint: string) =>
    request<Message[]>(`/messages/mine?fingerprint=${encodeURIComponent(fingerprint)}`),
  markMessageRead: (id: number, fingerprint: string) =>
    request<{ success: boolean }>(`/messages/mine/${id}/read?fingerprint=${encodeURIComponent(fingerprint)}`, {
      method: 'POST',
    }),
  updateMessage: (id: number, data: any) => request<Message>(`/messages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMessage: (id: number) => request<{ success: boolean }>(`/messages/${id}`, { method: 'DELETE' }),
  
  // Polls
      getPolls: (fingerprint?: string) =>
        request<Poll[]>(`/polls${fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : ''}`),
  getPoll: (id: number) => request<Poll>(`/polls/single/${id}`),
  createPoll: (data: any) => request<Poll>('/polls', { method: 'POST', body: JSON.stringify(data) }),
  votePoll: (id: number, option_ids: number[], fingerprint: string) => request<any>(`/polls/${id}/vote`, { method: 'POST', body: JSON.stringify({ option_ids, fingerprint }) }),
  updatePoll: (id: number, data: any) => request<Poll>(`/polls/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePoll: (id: number) => request<{ success: boolean }>(`/polls/${id}`, { method: 'DELETE' }),
  
  // Events
  getEvents: () => request<Event[]>('/events'),
  createEvent: (data: any) => request<Event>('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: number, data: any) => request<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id: number) => request<{ success: boolean }>(`/events/${id}`, { method: 'DELETE' }),
  
  // Resources
  getResources: () => request<Resource[]>('/resources'),
  createResource: (data: any) => request<Resource>('/resources', { method: 'POST', body: JSON.stringify(data) }),
  updateResource: (id: number, data: any) => request<Resource>(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResource: (id: number) => request<{ success: boolean }>(`/resources/${id}`, { method: 'DELETE' }),
  
  // Projects
  getProjects: () => request<Project[]>('/projects'),
  createProject: (data: any) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: number, data: any) => request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: number) => request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // Élèves et groupes
  getStudents: () => request<Student[]>('/students'),
  createStudent: (data: Partial<Student>) => request<Student>('/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (id: number, data: Partial<Student>) => request<Student>(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (id: number) => request<{ success: boolean }>(`/students/${id}`, { method: 'DELETE' }),
  getStudentGroups: () => request<StudentGroup[]>('/groups'),
  createStudentGroup: (data: { name: string; is_private?: boolean; student_ids?: number[]; validate_now?: boolean }) =>
    request<StudentGroup>('/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroupStatus: (id: number, status: StudentGroupStatus) =>
    request<StudentGroup>(`/groups/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  proposeGroupMember: (id: number, studentId: number, fingerprint: string) =>
    request<{ success: boolean; members: Student[] }>(`/groups/${id}/propose-member`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, fingerprint }),
    }),
  removeGroupMember: (id: number, studentId: number) =>
    request<{ success: boolean; members: Student[] }>(`/groups/${id}/members/${studentId}`, { method: 'DELETE' }),
  deleteStudentGroup: (id: number) => request<{ success: boolean }>(`/groups/${id}`, { method: 'DELETE' }),
  
  // Stats
  getStats: () => request<Stats>('/stats'),
  recordVisit: (fingerprint: string, page: string) =>
    request<{ success: boolean }>('/stats/visit', {
      method: 'POST',
      body: JSON.stringify({ fingerprint, page }),
    }),
  getVisits: (days = 14) => request<VisitStats>(`/stats/visits?days=${days}`),

  // Push notifications
  getPushVapidKey: () => request<{ publicKey: string }>('/push/vapid-public-key'),
  subscribePush: (subscription: any) => request<{ success: boolean }>('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint: string) => request<{ success: boolean }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),

  // Maintenance (bouton d'arrêt d'urgence)
  getMaintenanceState: () => request<MaintenanceState & { is_admin: boolean }>('/maintenance/state'),
  activateMaintenance: (password: string, message?: string) =>
    request<MaintenanceState>('/maintenance/activate', { method: 'POST', body: JSON.stringify({ password, message }) }),
  deactivateMaintenance: () => request<MaintenanceState>('/maintenance/deactivate', { method: 'POST' }),
  getMaintenanceHistory: () => request<MaintenanceLogEntry[]>('/maintenance/history'),

  // Chat
  joinChat: (fingerprint: string, display_name: string) =>
    request<{ user: ChatUser; conversation: ChatConversation }>('/chat/join', { method: 'POST', body: JSON.stringify({ fingerprint, display_name }) }),
  getChatConversation: (fingerprint?: string) =>
    request<{ conversation: ChatConversation; user: ChatUser | null; unread: number }>(
      '/chat/conversation' + (fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : '')
    ),
  getChatMessages: (fingerprint: string | null, conversation_id: number, after = 0) =>
    request<{ messages: ChatMessage[]; conversation_id: number }>(
      `/chat/messages?conversation_id=${conversation_id}&after=${after}` +
        (fingerprint ? `&fingerprint=${encodeURIComponent(fingerprint)}` : '')
    ),
  sendChatMessage: (data: { content: string; image?: string | null; conversation_id: number; fingerprint?: string }) =>
    request<{ message: ChatMessage }>('/chat/messages', { method: 'POST', body: JSON.stringify(data) }),
  markChatRead: (conversation_id: number, fingerprint?: string) =>
    request<{ success: boolean }>('/chat/read', { method: 'POST', body: JSON.stringify({ conversation_id, fingerprint }) }),
  getChatUnread: (fingerprint: string) =>
    request<{ unread: number }>(`/chat/unread?fingerprint=${encodeURIComponent(fingerprint)}`),
  chatImageUrl: (messageId: number, fingerprint: string | null) =>
    `/api/chat/messages/${messageId}/image` + (fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : ''),
  deleteChatMessage: (id: number, fingerprint?: string) =>
    request<{ success: boolean }>(`/chat/messages/${id}` + (fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : ''), { method: 'DELETE' }),
  /** Liste des membres du chat. Réservé au délégué. */
  getChatMembers: () => request<ChatMemberInfo[]>('/chat/members'),
  /** Supprime tous les messages d'une journée. Réservé au délégué. */
  deleteChatDay: (date: string) =>
    request<{ success: boolean; deleted: number; date: string }>(`/chat/day/${date}`, { method: 'DELETE' }),
  /** Ajoute ou retire une réaction. Réservée aux élèves. */
  toggleChatReaction: (messageId: number, reaction: string, fingerprint?: string | null) =>
    request<{ reaction: string; active: number; mine: boolean; counts: Record<string, { total: number; mine: boolean }> }>(
      `/chat/messages/${messageId}/reactions`,
      { method: 'POST', body: JSON.stringify({ reaction, fingerprint }) }
    ),

  // Fiches de révision
  getSheets: (params: { subject?: string | null; q?: string | null; page?: number; fingerprint?: string | null; status?: string | null } = {}) => {
    const search = new URLSearchParams();
    if (params.subject) search.set('subject', params.subject);
    if (params.q) search.set('q', params.q);
    if (params.page) search.set('page', String(params.page));
    if (params.fingerprint) search.set('fingerprint', params.fingerprint);
    if (params.status) search.set('status', params.status);
    const qs = search.toString();
    return request<SheetListResponse>('/sheets' + (qs ? `?${qs}` : ''));
  },
  createSheet: (data: { title: string; subject: string; class_level?: string; description?: string; file: string; fingerprint?: string | null; author_name?: string }) =>
    request<Sheet>('/sheets', { method: 'POST', body: JSON.stringify(data) }),
  setSheetStatus: (id: number, status: 'active' | 'hidden') =>
    request<{ success: boolean; status: string }>(`/sheets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteSheet: (id: number, fingerprint?: string | null) =>
    request<{ success: boolean }>(`/sheets/${id}` + (fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : ''), { method: 'DELETE' }),
  sheetFileUrl: (id: number, inline = false) => `/api/sheets/${id}/file` + (inline ? '?inline=1' : ''),

  // Administration
  getChatUsers: () => request<ChatUser[]>('/admin/users'),
  getAdminLog: (limit = 50) => request<AdminLogEntry[]>(`/admin/log?limit=${limit}`),
  getAdminOverview: () => request<AdminOverview>('/admin/overview'),
  getStorage: () =>
    request<{ persistent_storage: boolean; db_path: string; backups: { file: string; date: string; size: number }[] }>(
      '/admin/storage'
    ),
  exportDatabase: () => request<any>('/admin/export'),
  /**
   * Restauration d'un export. `confirmEmpty` n'est envoyé que si le fichier est
   * minuscule : le serveur refuse par ailleurs une sauvegarde sans aucune ligne,
   * ce qui viderait la base.
   */
  importDatabase: (payload: any, confirmEmpty = false) =>
    request<{ success: boolean }>('/admin/import', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirm_empty: confirmEmpty }),
    }),
  getStorageInfo: () => request<any>('/admin/storage'),
};
