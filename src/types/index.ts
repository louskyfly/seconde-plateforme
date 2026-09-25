export interface Settings {
  class_name: string;
  delegate_name: string;
  accent_color: string;
  home_info: string;
  home_image: string | null;
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

export interface Message {
  id: number;
  content: string;
  category: string;
  anonymous: number;
  author_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
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
  total_votes?: number;
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

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_kind: string;
  content: string;
  has_image: number;
  created_at: string;
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
