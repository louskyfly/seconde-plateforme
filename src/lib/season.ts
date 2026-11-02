/**
 * Thèmes de saison : changent la décoration et les couleurs de l'application.
 * Le thème est stocké en base (paramètres du délégué) et s'applique à toute
 * l'application via l'attribut `data-season` sur <html>.
 */

export type SeasonTheme =
  | 'aucun'
  | 'halloween'
  | 'noel'
  | 'sous-marin'
  | 'futuriste'
  | 'medieval'
  | 'fantastique';

const SEASONS: SeasonTheme[] = [
  'aucun',
  'halloween',
  'noel',
  'sous-marin',
  'futuriste',
  'medieval',
  'fantastique',
];

/** Icône d'onglet accordée au thème. */
const FAVICONS: Record<SeasonTheme, string> = {
  aucun: import.meta.env.BASE_URL + 'favicon.svg',
  halloween: import.meta.env.BASE_URL + 'favicon-halloween.svg',
  noel: import.meta.env.BASE_URL + 'favicon-noel.svg',
  'sous-marin': import.meta.env.BASE_URL + 'favicon.svg',
  futuriste: import.meta.env.BASE_URL + 'favicon.svg',
  medieval: import.meta.env.BASE_URL + 'favicon.svg',
  fantastique: import.meta.env.BASE_URL + 'favicon.svg',
};

/** Couleur de la barre système (PWA) par thème. */
const THEME_COLORS: Record<SeasonTheme, string> = {
  aucun: '#0a1220',
  halloween: '#2b1b3d',
  noel: '#3a1220',
  'sous-marin': '#03212e',
  futuriste: '#050b1e',
  medieval: '#1b140d',
  fantastique: '#150a28',
};

export function normalizeSeasonTheme(value: unknown): SeasonTheme {
  const theme = String(value ?? '').toLowerCase().trim();
  return (SEASONS as string[]).includes(theme) ? (theme as SeasonTheme) : 'aucun';
}

/** Applique (ou retire) la décoration sur l'ensemble de l'application. */
export function applySeason(theme: unknown): SeasonTheme {
  const value = normalizeSeasonTheme(theme);
  const root = document.documentElement;
  if (value === 'aucun') {
    delete root.dataset.season;
  } else {
    root.dataset.season = value;
  }
  // Couleur de la barre système (PWA installée) accordée au thème
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[value]);
  // L'icône de l'onglet suit le thème : citrouille en octobre, sapin en
  // décembre. Sans cela, l'onglet garde l'icône bleue d'origine et on ne voit
  // plus du tout de quel côté on est.
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.setAttribute('href', FAVICONS[value]);
  return value;
}

export const SEASON_THEMES: { value: SeasonTheme; label: string; emoji: string; hint: string }[] = [
  { value: 'aucun', label: 'Normal', emoji: '🎨', hint: 'Le thème actuel' },
  { value: 'halloween', label: 'Halloween', emoji: '🎃', hint: 'Citrouilles, bougies, chauve-souris' },
  { value: 'noel', label: 'Noël', emoji: '🎄', hint: 'Sapins, étoiles, flocons, cadeaux' },
  {
    value: 'sous-marin',
    label: 'Sous-marin',
    emoji: '🐠',
    hint: 'Bulles, poissons, algues et corail',
  },
  {
    value: 'futuriste',
    label: 'Futuriste',
    emoji: '🚀',
    hint: 'Nuit bleue, gratte-ciel illuminés, voitures volantes',
  },
  {
    value: 'medieval',
    label: 'Médiéval',
    emoji: '🏰',
    hint: 'Château, bannières et blasons',
  },
  {
    value: 'fantastique',
    label: 'Fantastique',
    emoji: '✨',
    hint: 'Lune, cristaux et poussière d’étoiles',
  },
];
