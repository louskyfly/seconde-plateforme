export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes}min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(dateStr);
}

export function generateFingerprint(): string {
  let fp = localStorage.getItem('voter_fp');
  if (!fp) {
    fp = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('voter_fp', fp);
  }
  return fp;
}

export const CATEGORIES_ANNOUNCEMENT: Record<string, string> = {
  scolarite: '📚 Scolarite',
  organisation: '📅 Organisation',
  lycee: '🏫 Lycée',
  evenement: '🎉 Événement',
  important: '⚠️ Important',
  general: 'ℹ️ Général',
};

export const CATEGORIES_IDEA: Record<string, string> = {
  classe: 'Classe',
  organisation: 'Organisation',
  activites: 'Activités',
  environnement: 'Environnement',
  lycee: 'Lycée',
  autre: 'Autre',
};

export const CATEGORIES_MESSAGE: Record<string, string> = {
  question: 'Question',
  idee: 'Idée',
  organisation: 'Organisation',
  probleme: 'Problème',
  autre: 'Autre',
};

export const EVENT_CATEGORIES: Record<string, string> = {
  controle: '📝 Contrôle',
  devoir: '📖 Devoir',
  sortie: '🚌 Sortie',
  evenement: '🎉 Événement',
  reunion: '🤝 Réunion',
  autre: '📌 Autre',
};

export const SUBJECTS: Record<string, string> = {
  francais: 'Français',
  maths: 'Mathématiques',
  histoire: 'Histoire-Géo',
  svt: 'SVT',
  physique: 'Physique-Chimie',
  anglais: 'Anglais',
  autre: 'Autre',
};

export const IDEA_STATUSES: Record<string, { label: string; color: string }> = {
  a_etudier: { label: 'À étudier', color: 'bg-yellow-400' },
  en_discussion: { label: 'En discussion', color: 'bg-blue-400' },
  transmise: { label: 'Transmise', color: 'bg-purple-400' },
  realisee: { label: 'Réalisée', color: 'bg-green-400' },
  non_retenue: { label: 'Non retenue', color: 'bg-red-400' },
};

export const MESSAGE_STATUSES: Record<string, string> = {
  nouveau: 'Nouveau',
  lu: 'Lu',
  traite: 'Traité',
};

export const PROJECT_STATUSES: Record<string, { label: string; color: string }> = {
  en_preparation: { label: 'En préparation', color: 'bg-yellow-400' },
  en_cours: { label: 'En cours', color: 'bg-blue-400' },
  termine: { label: 'Terminé', color: 'bg-green-400' },
};
