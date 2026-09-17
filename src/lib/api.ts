import type { Settings, Announcement, Idea, Message, Poll, Event, Resource, Project, Stats } from '../types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Erreur réseau' }));
    throw new Error(data.error || `Erreur ${res.status}`);
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
  getAnnouncements: () => request<Announcement[]>('/announcements'),
  createAnnouncement: (data: any) => request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(data) }),
  updateAnnouncement: (id: number, data: any) => request<Announcement>(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAnnouncement: (id: number) => request<{ success: boolean }>(`/announcements/${id}`, { method: 'DELETE' }),
  
  // Ideas
  getIdeas: () => request<Idea[]>('/ideas'),
  createIdea: (data: any) => request<Idea>('/ideas', { method: 'POST', body: JSON.stringify(data) }),
  updateIdea: (id: number, data: any) => request<Idea>(`/ideas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIdea: (id: number) => request<{ success: boolean }>(`/ideas/${id}`, { method: 'DELETE' }),
  
  // Messages
  getMessages: () => request<Message[]>('/messages'),
  sendMessage: (data: any) => request<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  updateMessage: (id: number, data: any) => request<Message>(`/messages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMessage: (id: number) => request<{ success: boolean }>(`/messages/${id}`, { method: 'DELETE' }),
  
  // Polls
  getPolls: () => request<Poll[]>('/polls'),
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
  
  // Stats
  getStats: () => request<Stats>('/stats'),

  // Push notifications
  getPushVapidKey: () => request<{ publicKey: string }>('/push/vapid-public-key'),
  subscribePush: (subscription: any) => request<{ success: boolean }>('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint: string) => request<{ success: boolean }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
};
