export interface Settings {
  class_name: string;
  delegate_name: string;
  accent_color: string;
  home_info: string;
}

export interface Announcement {
  id: number;
  title: string;
  description: string;
  category: string;
  importance: string;
  author: string;
  attachment_url: string | null;
  published: number;
  created_at: string;
  updated_at: string;
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
