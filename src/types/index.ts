export interface Settings {
  class_name: string;
  delegate_name: string;
  accent_color: string;
  home_info: string;
  home_image: string | null;
  /** Thème de saison : 'aucun' | 'halloween' | 'noel' */
  season_theme?: string;
}

export interface Announcement {
  id: number;
  title: string;
  description: string;
  category: string;
  importance: string;
  author: string;
  attachment_url: string | null;
  image: string | null;
  published: number;
  created_at: string;
  updated_at: string;
  reactions?: Record<string, number>;
  my_reactions?: string[];
}

export interface Idea {
  id: number;
  title: string;
  description: string;
  category: string;
  anonymous: number;
  author_name: string | null;
  status: string;
  delegate_response: string | null;
  created_at: string;
  updated_at: string;
}

/** Réponse d'un élève sous une idée. Suppression logique via `deleted_at`. */
export interface IdeaReply {
  id: number;
  content: string;
  /** null quand la réponse a été supprimée. */
  author_name: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  content: string;
  category: string;
  anonymous: number;
  author_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** Réponse du délégué, visible uniquement par l'élève concerné. */
  delegate_reply?: string | null;
  replied_at?: string | null;
  delegate_name?: string | null;
  /** Renseigné par le serveur : l'élève a ouvert la réponse du délégué. */
  response_read_at?: string | null;
}

export interface Poll {
  id: number;
  question: string;
  allow_multiple: number;
  show_results: number;
  anonymous: number;
  active: number;
  created_at: string;
  closed_at: string | null;
  options?: PollOption[];
  /** Nombre de réponses enregistrées (choix multiple : plus grand que le nombre d'élèves) */
  total_votes?: number;
  /** Nombre d'élèves distincts ayant voté */
  total_voters?: number;
  /** L'élève a déjà voté sur ce sondage (renvoyé si le fingerprint est fourni) */
  has_voted?: boolean;
}

export interface PollOption {
  id: number;
  poll_id: number;
  text: string;
  vote_count?: number;
}

export interface Event {
  id: number;
  title: string;
  date: string;
  time: string | null;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: number;
  title: string;
  description: string;
  subject: string;
  file_url: string | null;
  link_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  date: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  newMessages: number;
  newIdeas: number;
  activePolls: number;
  announcementsCount: number;
  upcomingEvents: number;
}

export interface MaintenanceState {
  active: boolean;
  message: string;
  activated_by?: string | null;
  activated_at?: string | null;
  deactivated_by?: string | null;
  deactivated_at?: string | null;
}

/** Une ligne de `maintenance_log`, telle que renvoyée par /api/maintenance/history. */
export interface MaintenanceLogEntry {
  id: number;
  active: number;
  message: string;
  activated_by: string | null;
  activated_at: string;
  deactivated_by: string | null;
  deactivated_at: string | null;
}

export interface ChatUser {
  id: number;
  display_name: string;
  kind: string;
  fingerprint?: string | null;
  created_at?: string;
  last_seen_at?: string;
  message_count?: number;
}

export interface ChatConversation {
  id: number;
  title: string | null;
  is_group: number;
}

export type ChatReaction = 'pouce' | 'rire' | 'coeur';

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_kind: string;
  content: string;
  has_image: number;
  created_at: string;
  /** Compteurs par réaction, avec `mine` pour celles de l'élève courant. */
  reactions: Record<string, { total: number; mine: boolean }>;
}

export interface Sheet {
  id: number;
  title: string;
  subject: string;
  class_level: string | null;
  description: string;
  author_name: string | null;
  kind: string;
  mime_type: string | null;
  file_size: number;
  has_file: number;
  status: string;
  created_at: string;
  is_mine: boolean;
}

export interface SheetListResponse {
  items: Sheet[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface AdminLogEntry {
  id: number;
  action: string;
  target_type: string | null;
  target_id: number | null;
  detail: string | null;
  created_at: string;
}

export interface AdminOverview {
  sheets: number;
  hiddenSheets: number;
  chatMessages: number;
  chatUsers: number;
  imagesPosted: number;
}
