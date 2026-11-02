import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { normalizeSeasonTheme, type SeasonTheme } from '@/lib/season';

/**
 * Décorations de saison.
 *
 * Le thème actif est porté par l'attribut `data-season` sur <html>, posé par
 * applySeason(). On l'observe plutôt que de le stocker ici : la décoration suit
 * ainsi le thème sur toutes les pages, et disparaît avec « Normal ».
 *
 * Deux calques, dans cet ordre d'importance :
 *   1. `.season-decor__fall`  — les particules qui tombent (flocons, feuilles),
 *      seules choses en mouvement. Peu nombreuses, en haut de l'écran.
 *   2. `.season-decor__fixed` — deux ou trois éléments sobres, ancrés dans les
 *      coins et le bas de l'écran, immobiles.
 *
 * Rien ne traverse le contenu : le calque est à z-index 0 et l'application à
 * z-index 1 (voir .app-root dans index.css), donc aucune décoration ne peut
 * passer devant le texte quelle que soit la position de la pile. Les
 * animations ne touchent que `transform` et `opacity`, ce qui évite les
 * recalculs de mise en page saccadés pendant un swipe.
 */

/** Suit le thème posé sur <html> par applySeason(). */
function useSeasonFromDocument(): SeasonTheme {
  const [season, setSeason] = useState<SeasonTheme>(() =>
    normalizeSeasonTheme(document.documentElement.dataset.season)
  );

  useEffect(() => {
    const update = () => setSeason(normalizeSeasonTheme(document.documentElement.dataset.season));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-season'] });
    return () => observer.disconnect();
  }, []);

  return season;
}

/* ------------------------------------------------------------------ */
/* Motifs                                                              */
/* ------------------------------------------------------------------ */

function Pumpkin() {
  return (
    <svg viewBox="0 0 64 56" className="h-full w-full">
      <ellipse cx="32" cy="36" rx="26" ry="19" fill="#e2620f" />
      <ellipse cx="20" cy="36" rx="9" ry="18" fill="#f08a2b" />
      <ellipse cx="44" cy="36" rx="9" ry="18" fill="#f08a2b" />
      <ellipse cx="32" cy="36" rx="26" ry="19" fill="none" stroke="#b64c07" strokeWidth="1.4" />
      <path d="M30 17h5l-1-6h-3z" fill="#5a7a35" />
      <path d="M34 11c2-3 6-3 8-1" stroke="#5a7a35" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M20 30l7 4-7 4zM44 30l-7 4 7 4z" fill="#2a1206" />
      <path d="M18 42h28l-4 3h-20z" fill="#2a1206" />
    </svg>
  );
}

function Candle() {
  return (
    <svg viewBox="0 0 32 72" className="h-full w-full">
      <ellipse cx="16" cy="68" rx="13" ry="3.5" fill="#000" opacity="0.18" />
      <rect x="9" y="28" width="14" height="40" rx="3" fill="#f4e6cf" />
      <rect x="9" y="28" width="5" height="40" rx="2.5" fill="#fffaf0" />
      <path d="M16 28v-7" stroke="#4a3524" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 22c-4-4-2-9 0-13 2 4 4 9 0 13z" fill="#ffb340" />
      <path d="M16 21c-2-2-1-4 0-6 1 2 2 4 0 6z" fill="#fff3c4" />
    </svg>
  );
}

/** Feuille d'automne : c'est ce qui tombe, plutôt qu'un animal qui traverse. */
function Leaf() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full">
      <path d="M12 1c6 4 9 9 9 13a9 9 0 0 1-18 0c0-4 3-9 9-13z" fill="currentColor" />
      <path d="M12 4v16M12 9l4-3M12 9l-4-3M12 14l4-3M12 14l-4-3" stroke="rgba(60,26,6,0.55)" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function SpiderWeb() {
  const rays = [0, 30, 60, 90, 120, 150];
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <g stroke="#e4ecf7" strokeWidth="1.1" fill="none" opacity="0.7">
        {rays.map((deg) => (
          <line key={deg} x1="0" y1="0" x2="200" y2="0" transform={`rotate(${deg})`} />
        ))}
        {[45, 90, 140].map((r) => (
          <circle key={r} cx="0" cy="0" r={r} />
        ))}
        {[45, 90, 140].map((r) => (
          <polygon
            key={`p${r}`}
            points={rays
              .map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return `${(Math.cos(rad) * r).toFixed(1)},${(Math.sin(rad) * r).toFixed(1)}`;
              })
              .join(' ')}
          />
        ))}
      </g>
    </svg>
  );
}

function FirTree() {
  return (
    <svg viewBox="0 0 64 84" className="h-full w-full">
      <ellipse cx="32" cy="80" rx="22" ry="3.5" fill="#000" opacity="0.2" />
      <rect x="29" y="66" width="6" height="12" rx="2" fill="#5a3a22" />
      <path d="M32 8l15 22H17z" fill="#1f7a3d" />
      <path d="M32 25l19 25H13z" fill="#2b8f4a" />
      <path d="M32 44l22 25H10z" fill="#359a55" />
      <path d="M32 3l3 5.8 6.4.9-4.6 4.5 1.1 6.4-5.9-3.1-5.9 3.1 1.1-6.4-4.6-4.5 6.4-.9z" fill="#f5d76e" />
      <circle cx="26" cy="35" r="1.9" fill="#f5d76e" />
      <circle cx="38" cy="42" r="1.9" fill="#e0484f" />
      <circle cx="27" cy="55" r="1.9" fill="#f5d76e" />
    </svg>
  );
}

/**
 * Flocon de neige « stellaire dendritique ».
 *
 * Un vrai flocon a une symétrie hexagonale (groupe diédrique D6) : on dessine
 * UNE branche, avec ses ramifications, puis on la répète 6 fois en tournant de
 * 60°. C'est ce qui le distingue d'un simple astérisque (trois barres
 * croisées), qui est la version qu'on obtenait avant.
 */
const SNOW_ARMS = [0, 60, 120, 180, 240, 300];
/** Position sur l'épine, longueur de la ramification. */
const SNOW_BRANCHES = [
  { y: 8.5, len: 5.4 },
  { y: 13, len: 4.2 },
  { y: 16.8, len: 2.6 },
];

function Snowflake() {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full">
      <g stroke="#eaf6ff" strokeWidth="1.25" strokeLinecap="round" fill="none">
        {SNOW_ARMS.map((deg) => (
          <g key={deg} transform={`rotate(${deg} 20 20)`}>
            <path d="M20 20V5" />
            {SNOW_BRANCHES.map((b) => {
              // Ramification à 60° de l'épine : 0,866 en dx, 0,5 en dy.
              const dx = b.len * 0.866;
              const dy = b.len * 0.5;
              return (
                <path
                  key={b.y}
                  d={`M20 ${b.y}l${-dx.toFixed(2)} ${dy.toFixed(2)}M20 ${b.y}l${dx.toFixed(2)} ${dy.toFixed(2)}`}
                />
              );
            })}
          </g>
        ))}
      </g>
      <circle cx="20" cy="20" r="1.7" fill="#eaf6ff" />
    </svg>
  );
}

function Gift() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <ellipse cx="24" cy="45" rx="17" ry="3" fill="#000" opacity="0.18" />
      <rect x="6" y="18" width="36" height="25" rx="3" fill="#c0273a" />
      <rect x="6" y="18" width="36" height="8" rx="3" fill="#d9364c" />
      <rect x="20" y="18" width="8" height="25" fill="#f2e3b8" />
      <path d="M24 18c-6 0-9-3-8-6 1.4-3.4 6-1 8 6zm0 0c6 0 9-3 8-6-1.4-3.4-6-1-8 6z" fill="#f2e3b8" />
    </svg>
  );
}

function Bubble() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full">
      <circle cx="16" cy="16" r="13" fill="rgba(125, 227, 255, 0.12)" stroke="rgba(160, 235, 255, 0.75)" strokeWidth="1.4" />
      <circle cx="11" cy="11" r="3.2" fill="rgba(255, 255, 255, 0.55)" />
      <circle cx="21" cy="21" r="1.5" fill="rgba(255, 255, 255, 0.35)" />
    </svg>
  );
}

function Fish() {
  return (
    <svg viewBox="0 0 64 40" className="h-full w-full">
      <path d="M8 20c10-12 28-14 38-6l10-8v28l-10-8c-10 8-28 6-38-6z" fill="currentColor" opacity="0.85" />
      <path d="M46 20c4-4 8-6 10-6v12c-2 0-6-2-10-6z" fill="currentColor" opacity="0.55" />
      <circle cx="20" cy="17" r="2.2" fill="#06222e" />
      <path d="M30 14c4 2 4 10 0 12" stroke="#06222e" strokeWidth="1.2" fill="none" opacity="0.4" />
    </svg>
  );
}

function Seaweed() {
  return (
    <svg viewBox="0 0 40 100" className="h-full w-full">
      <path d="M20 100c-10-16 8-22 0-38s8-22 0-38" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M8 100c-5-12 4-16 0-28s4-16 0-26" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.55" />
      <path d="M32 100c5-12-4-16 0-28s-4-16 0-26" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function Coral() {
  return (
    <svg viewBox="0 0 80 60" className="h-full w-full">
      <path d="M40 60V34M40 40L22 22M40 44L58 24M22 22V10M58 24V8M22 22l-8-4M58 24l8-4" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="14" cy="16" r="4" fill="currentColor" />
      <circle cx="66" cy="18" r="4" fill="currentColor" />
      <circle cx="22" cy="8" r="3.5" fill="currentColor" />
      <circle cx="58" cy="6" r="3.5" fill="currentColor" />
    </svg>
  );
}

function FlyingCar() {
  return (
    <svg viewBox="0 0 90 40" className="h-full w-full">
      <path d="M6 26h78" stroke="currentColor" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      <path d="M14 24l10-9h34l12 9z" fill="currentColor" opacity="0.9" />
      <rect x="10" y="23" width="62" height="7" rx="3.5" fill="currentColor" opacity="0.75" />
      <path d="M30 15h20l6 6H26z" fill="#bfefff" opacity="0.75" />
      <circle cx="22" cy="31" r="2.6" fill="#7dfcff" />
      <circle cx="60" cy="31" r="2.6" fill="#7dfcff" />
      <path d="M72 26h14" stroke="#7dfcff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function Skyscraper() {
  return (
    <svg viewBox="0 0 70 140" className="h-full w-full">
      <rect x="8" y="28" width="54" height="112" rx="3" fill="currentColor" opacity="0.28" />
      <rect x="14" y="10" width="42" height="18" rx="2" fill="currentColor" opacity="0.4" />
      <path d="M35 0v10" stroke="currentColor" strokeWidth="2" opacity="0.7" />
      <g fill="#8ff6ff" opacity="0.85">
        <rect x="16" y="38" width="8" height="7" rx="1" />
        <rect x="31" y="38" width="8" height="7" rx="1" />
        <rect x="46" y="38" width="8" height="7" rx="1" />
        <rect x="16" y="54" width="8" height="7" rx="1" />
        <rect x="46" y="54" width="8" height="7" rx="1" />
        <rect x="31" y="70" width="8" height="7" rx="1" />
        <rect x="16" y="86" width="8" height="7" rx="1" />
        <rect x="46" y="86" width="8" height="7" rx="1" />
        <rect x="31" y="102" width="8" height="7" rx="1" />
        <rect x="16" y="118" width="8" height="7" rx="1" />
        <rect x="46" y="118" width="8" height="7" rx="1" />
      </g>
      <g fill="#ff7de9" opacity="0.7">
        <rect x="31" y="54" width="8" height="7" rx="1" />
        <rect x="16" y="70" width="8" height="7" rx="1" />
        <rect x="46" y="70" width="8" height="7" rx="1" />
        <rect x="31" y="86" width="8" height="7" rx="1" />
      </g>
    </svg>
  );
}

function Castle() {
  return (
    <svg viewBox="0 0 100 90" className="h-full w-full">
      <path d="M6 90V46h10v-8h8v8h8v-8h8v8h8V22h10V10h8v12h10v24h8v-8h8v8h8v-8h8v52z" fill="currentColor" opacity="0.75" />
      <path d="M30 90V66a10 10 0 0 1 20 0v24z" fill="#1b140d" opacity="0.65" />
      <g fill="#ffd27d" opacity="0.9">
        <rect x="18" y="54" width="6" height="9" rx="1" />
        <rect x="38" y="30" width="6" height="9" rx="1" />
        <rect x="56" y="30" width="6" height="9" rx="1" />
        <rect x="76" y="54" width="6" height="9" rx="1" />
      </g>
      <path d="M49 10V0" stroke="currentColor" strokeWidth="2" />
      <path d="M49 0l14 4-14 4z" fill="#c0392b" />
    </svg>
  );
}

function Banner() {
  return (
    <svg viewBox="0 0 40 100" className="h-full w-full">
      <path d="M20 0v100" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <path d="M8 8h24v46l-12-9-12 9z" fill="currentColor" opacity="0.85" />
      <path d="M14 18h12M14 28h12M14 38h8" stroke="#1b140d" strokeWidth="2" opacity="0.45" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 60 70" className="h-full w-full">
      <path d="M30 2l26 8v22c0 18-12 30-26 36C16 62 4 50 4 32V10z" fill="currentColor" opacity="0.85" />
      <path d="M30 8l20 6v18c0 14-9 24-20 29-11-5-20-15-20-29V14z" fill="#1b140d" opacity="0.25" />
      <path d="M30 16v34M18 30h24" stroke="#ffe0a3" strokeWidth="3" opacity="0.8" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full">
      <path d="M16 1l3.2 9.8L29 14l-9.8 3.2L16 27l-3.2-9.8L3 14l9.8-3.2z" fill="currentColor" />
      <circle cx="16" cy="14" r="2.2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full">
      <path d="M52 6a34 34 0 1 0 22 58A38 38 0 0 1 52 6z" fill="currentColor" opacity="0.9" />
      <circle cx="30" cy="30" r="3" fill="#fff" opacity="0.5" />
      <circle cx="24" cy="46" r="2" fill="#fff" opacity="0.4" />
      <circle cx="40" cy="52" r="2.4" fill="#fff" opacity="0.35" />
    </svg>
  );
}

function Crystal() {
  return (
    <svg viewBox="0 0 60 90" className="h-full w-full">
      <path d="M30 2l24 28-10 52H16L6 30z" fill="currentColor" opacity="0.8" />
      <path d="M30 2v80M6 30h48M30 2L16 82M30 2l14 80" stroke="#fff" strokeWidth="1.2" opacity="0.35" />
      <path d="M16 82h28l-6 6H22z" fill="#fff" opacity="0.25" />
    </svg>
  );
}

const MOTIFS = {
  pumpkin: Pumpkin,
  candle: Candle,
  leaf: Leaf,
  web: SpiderWeb,
  fir: FirTree,
  snow: Snowflake,
  gift: Gift,
  bubble: Bubble,
  fish: Fish,
  seaweed: Seaweed,
  coral: Coral,
  car: FlyingCar,
  tower: Skyscraper,
  castle: Castle,
  banner: Banner,
  shield: Shield,
  sparkle: Sparkle,
  moon: Moon,
  crystal: Crystal,
};
type Motif = keyof typeof MOTIFS;

/** Position en % de la fenêtre + taille en vmin (le décor s'adapte au téléphone). */
interface Box {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

interface Particle extends Box {
  /** Durée de chute. */
  duration: number;
  /** Décalage : évite que tout tombe en même temps. */
  delay: number;
  /** Légère dérive horizontale. */
  drift: number;
  color?: string;
  /** Masqué sur petit écran, où la place manque. */
  small?: boolean;
}

interface Anchor {
  motif: Motif;
  size: number;
  opacity: number;
  color?: string;
  /** Ancrage : distance depuis le bord, en % de la fenêtre. */
  fromLeft?: number;
  fromRight?: number;
  fromTop?: number;
  fromBottom?: number;
  small?: boolean;
}

type ActiveSeason = Exclude<SeasonTheme, 'aucun'>;

/**
 * Les particules restent dans le haut de l'écran (y de 3 à 41 %) : aucune ne
 * descend volontairement sous la mi-écran, pour ne jamais empiéter sur la
 * lecture du texte. Le motif diffère par thème.
 */
const FALL_MOTIF: Record<ActiveSeason, Motif> = {
  halloween: 'leaf',
  noel: 'snow',
  'sous-marin': 'bubble',
  futuriste: 'sparkle',
  medieval: 'sparkle',
  fantastique: 'sparkle',
};

const PARTICLES: Record<ActiveSeason, Particle[]> = {
  halloween: [
    { x: 8, y: 6, size: 1.8, opacity: 0.7, duration: 9, delay: 0, drift: 6, color: '#c2621c' },
    { x: 24, y: 18, size: 1.4, opacity: 0.6, duration: 11, delay: 2.4, drift: -5, color: '#a3471a' },
    { x: 41, y: 4, size: 2, opacity: 0.65, duration: 10, delay: 4.1, drift: 4, color: '#d4772a' },
    { x: 58, y: 22, size: 1.5, opacity: 0.55, duration: 12, delay: 1.2, drift: -7, color: '#9c4a1c' },
    { x: 73, y: 8, size: 1.7, opacity: 0.6, duration: 9.5, delay: 3.3, drift: 5, color: '#c2621c' },
    { x: 88, y: 19, size: 1.3, opacity: 0.5, duration: 11.5, delay: 5.6, drift: -4, color: '#8f5a2a' },
    { x: 33, y: 38, size: 1.2, opacity: 0.45, duration: 13, delay: 6.4, drift: 3, color: '#b8551d', small: true },
    { x: 66, y: 41, size: 1.3, opacity: 0.45, duration: 12.5, delay: 7.2, drift: -3, color: '#b8551d', small: true },
  ],
  noel: [
    { x: 7, y: 5, size: 2, opacity: 0.85, duration: 11, delay: 0, drift: 5 },
    { x: 21, y: 16, size: 1.5, opacity: 0.75, duration: 13, delay: 2.2, drift: -4 },
    { x: 36, y: 3, size: 1.7, opacity: 0.8, duration: 12, delay: 4.3, drift: 6 },
    { x: 52, y: 20, size: 1.3, opacity: 0.7, duration: 14, delay: 1.1, drift: -5 },
    { x: 67, y: 6, size: 1.9, opacity: 0.8, duration: 11.5, delay: 3.5, drift: 4 },
    { x: 82, y: 17, size: 1.4, opacity: 0.7, duration: 13.5, delay: 5.8, drift: -6 },
    { x: 94, y: 4, size: 1.6, opacity: 0.7, duration: 12.5, delay: 2.8, drift: 3 },
    { x: 30, y: 34, size: 1.2, opacity: 0.55, duration: 15, delay: 6.6, drift: 4, small: true },
    { x: 62, y: 38, size: 1.3, opacity: 0.55, duration: 16, delay: 7.4, drift: -3, small: true },
  ],
  'sous-marin': [
    { x: 6, y: 8, size: 2.2, opacity: 0.7, duration: 10, delay: 0, drift: 5, color: '#bff4ff' },
    { x: 20, y: 22, size: 1.6, opacity: 0.55, duration: 13, delay: 2.1, drift: -6, color: '#9fe9ff' },
    { x: 35, y: 5, size: 1.9, opacity: 0.65, duration: 11.5, delay: 4.2, drift: 4, color: '#d8f8ff' },
    { x: 51, y: 19, size: 1.4, opacity: 0.5, duration: 14, delay: 1.3, drift: -4, color: '#8fdcf5' },
    { x: 67, y: 7, size: 2.4, opacity: 0.7, duration: 9.5, delay: 3.6, drift: 6, color: '#bff4ff' },
    { x: 83, y: 20, size: 1.5, opacity: 0.55, duration: 12.5, delay: 5.4, drift: -5, color: '#a8ecff' },
    { x: 94, y: 4, size: 1.8, opacity: 0.6, duration: 11, delay: 2.7, drift: 3, color: '#cff7ff' },
    { x: 42, y: 36, size: 1.3, opacity: 0.4, duration: 15, delay: 6.8, drift: 4, color: '#9fe9ff', small: true },
  ],
  futuriste: [
    { x: 8, y: 6, size: 1.2, opacity: 0.9, duration: 8, delay: 0, drift: 4, color: '#8ff6ff' },
    { x: 24, y: 15, size: 1, opacity: 0.8, duration: 9, delay: 2.2, drift: -3, color: '#ff7de9' },
    { x: 41, y: 4, size: 1.4, opacity: 0.9, duration: 7.5, delay: 4.1, drift: 5, color: '#8ff6ff' },
    { x: 57, y: 20, size: 0.9, opacity: 0.7, duration: 10, delay: 1.1, drift: -4, color: '#ff7de9' },
    { x: 72, y: 8, size: 1.3, opacity: 0.85, duration: 8.5, delay: 3.4, drift: 4, color: '#8ff6ff' },
    { x: 88, y: 18, size: 1.1, opacity: 0.75, duration: 9.5, delay: 5.7, drift: -5, color: '#ff7de9' },
    { x: 33, y: 37, size: 1, opacity: 0.5, duration: 11, delay: 6.5, drift: 3, color: '#8ff6ff', small: true },
  ],
  medieval: [
    { x: 9, y: 7, size: 1.1, opacity: 0.55, duration: 12, delay: 0, drift: 5, color: '#ffd98a' },
    { x: 27, y: 19, size: 0.9, opacity: 0.45, duration: 14, delay: 2.3, drift: -4, color: '#e8c67a' },
    { x: 44, y: 5, size: 1.2, opacity: 0.5, duration: 13, delay: 4.4, drift: 6, color: '#ffd98a' },
    { x: 61, y: 21, size: 1, opacity: 0.4, duration: 15, delay: 1.2, drift: -5, color: '#d9b86a' },
    { x: 76, y: 6, size: 1.3, opacity: 0.5, duration: 12.5, delay: 3.5, drift: 4, color: '#ffd98a' },
    { x: 91, y: 17, size: 1, opacity: 0.45, duration: 14.5, delay: 5.6, drift: -3, color: '#e8c67a' },
  ],
  fantastique: [
    { x: 7, y: 5, size: 1.5, opacity: 0.9, duration: 10, delay: 0, drift: 4, color: '#e9d5ff' },
    { x: 22, y: 17, size: 1.1, opacity: 0.75, duration: 12, delay: 2.2, drift: -5, color: '#ffb3f0' },
    { x: 38, y: 4, size: 1.7, opacity: 0.9, duration: 9, delay: 4.3, drift: 5, color: '#d9c2ff' },
    { x: 54, y: 20, size: 1, opacity: 0.65, duration: 13, delay: 1.1, drift: -4, color: '#ffb3f0' },
    { x: 69, y: 7, size: 1.4, opacity: 0.85, duration: 10.5, delay: 3.6, drift: 6, color: '#e9d5ff' },
    { x: 84, y: 18, size: 1.2, opacity: 0.7, duration: 12.5, delay: 5.8, drift: -5, color: '#d9c2ff' },
    { x: 95, y: 4, size: 1.3, opacity: 0.8, duration: 11, delay: 2.9, drift: 3, color: '#ffb3f0' },
    { x: 31, y: 36, size: 0.9, opacity: 0.5, duration: 14, delay: 6.7, drift: 4, color: '#e9d5ff', small: true },
  ],
};

/**
 * Éléments immobiles, ancrés dans les coins : ce sont eux qui font le décor,
 * ils ne bougent jamais, donc ils ne peuvent pas gêner la lecture ni saccader.
 * Le décor ne touche pas aux boutons, seulement aux bords de l'écran.
 */
const ANCHORS: Record<ActiveSeason, Anchor[]> = {
  halloween: [
    { motif: 'web', size: 20, opacity: 0.3, fromRight: -4, fromTop: -7 },
    { motif: 'web', size: 15, opacity: 0.24, fromLeft: -5, fromTop: -8, small: true },
    { motif: 'pumpkin', size: 13, opacity: 0.92, fromRight: 20, fromBottom: -1 },
    { motif: 'pumpkin', size: 7.5, opacity: 0.8, fromRight: 31, fromBottom: 0, small: true },
    { motif: 'pumpkin', size: 8, opacity: 0.7, fromLeft: 2, fromBottom: -2, small: true },
    { motif: 'candle', size: 10, opacity: 0.8, fromRight: 4, fromBottom: 0, small: true },
    { motif: 'candle', size: 7.5, opacity: 0.7, fromRight: 12.5, fromBottom: 0, small: true },
  ],
  noel: [
    { motif: 'fir', size: 19, opacity: 0.9, fromLeft: 1.5, fromBottom: -2 },
    { motif: 'fir', size: 14, opacity: 0.85, fromRight: 3, fromBottom: -2 },
    { motif: 'gift', size: 7, opacity: 0.75, fromLeft: 18, fromBottom: 0, small: true },
    { motif: 'gift', size: 7, opacity: 0.7, fromRight: 4, fromBottom: 0, small: true },
  ],
  'sous-marin': [
    { motif: 'seaweed', size: 18, opacity: 0.55, fromLeft: 1, fromBottom: -3, color: '#1f9e7a' },
    { motif: 'seaweed', size: 14, opacity: 0.5, fromRight: 2, fromBottom: -3, color: '#28b58c' },
    { motif: 'coral', size: 13, opacity: 0.65, fromLeft: 14, fromBottom: -1, color: '#ff8f7a' },
    { motif: 'coral', size: 9, opacity: 0.55, fromRight: 17, fromBottom: 0, color: '#ffb39e', small: true },
    { motif: 'fish', size: 11, opacity: 0.7, fromRight: 9, fromTop: 13, color: '#7fe3ff' },
    { motif: 'fish', size: 7, opacity: 0.5, fromLeft: 8, fromTop: 28, color: '#9fe9ff', small: true },
  ],
  futuriste: [
    { motif: 'tower', size: 24, opacity: 0.5, fromLeft: -2, fromBottom: -4, color: '#2a6cff' },
    { motif: 'tower', size: 20, opacity: 0.45, fromRight: 1, fromBottom: -4, color: '#3b4fd8' },
    { motif: 'tower', size: 14, opacity: 0.35, fromLeft: 18, fromBottom: -4, color: '#1f4bd8', small: true },
    { motif: 'car', size: 13, opacity: 0.85, fromRight: 7, fromTop: 9, color: '#7dfcff' },
    { motif: 'car', size: 9, opacity: 0.65, fromLeft: 6, fromTop: 22, color: '#ff7de9', small: true },
  ],
  medieval: [
    { motif: 'castle', size: 26, opacity: 0.55, fromRight: -2, fromBottom: -3, color: '#8a6a2f' },
    { motif: 'banner', size: 9, opacity: 0.8, fromLeft: 3, fromTop: -1, color: '#b03a2e' },
    { motif: 'banner', size: 7, opacity: 0.65, fromRight: 6, fromTop: -1, color: '#c9a227', small: true },
    { motif: 'shield', size: 9, opacity: 0.55, fromLeft: 10, fromBottom: 1, color: '#d4af37', small: true },
  ],
  fantastique: [
    { motif: 'moon', size: 16, opacity: 0.75, fromRight: 5, fromTop: 3, color: '#e8d9ff' },
    { motif: 'crystal', size: 11, opacity: 0.65, fromLeft: 4, fromBottom: 0, color: '#b388ff' },
    { motif: 'sparkle', size: 6, opacity: 0.8, fromLeft: 14, fromTop: 12, color: '#f0e6ff', small: true },
    { motif: 'crystal', size: 7, opacity: 0.5, fromRight: 12, fromBottom: 0, color: '#d1b3ff', small: true },
  ],
};

function anchorStyle(a: Anchor): CSSProperties {
  return {
    width: `${a.size}vmin`,
    height: `${a.size}vmin`,
    opacity: a.opacity,
    left: a.fromLeft !== undefined ? `${a.fromLeft}%` : undefined,
    right: a.fromRight !== undefined ? `${a.fromRight}%` : undefined,
    top: a.fromTop !== undefined ? `${a.fromTop}%` : undefined,
    bottom: a.fromBottom !== undefined ? `${a.fromBottom}%` : undefined,
  };
}

export function SeasonDecor() {
  const season = useSeasonFromDocument();
  if (season === 'aucun') return null;

  return (
    <div className="season-decor" aria-hidden="true">
      <div className="season-decor__fall">
        {PARTICLES[season].map((p, i) => {
          const Motif = MOTIFS[FALL_MOTIF[season]];
          return (
            <span
              key={`fall-${i}`}
              className={`season-decor__flake ${p.small ? 'season-decor__item--small' : ''}`}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}vmin`,
                height: `${p.size}vmin`,
                opacity: p.opacity,
                color: p.color,
                // Une durée et une dérive par particule : la chute n'est jamais
                // synchrone, donc l'œil ne suit pas un mouvement_unique.
                ['--fall-duration' as string]: `${p.duration}s`,
                ['--fall-delay' as string]: `${p.delay}s`,
                ['--fall-drift' as string]: `${p.drift}vmin`,
              }}
            >
              <Motif />
            </span>
          );
        })}
      </div>

      <div className="season-decor__fixed">
        {ANCHORS[season].map((a, i) => {
          const Motif = MOTIFS[a.motif];
          return (
            <span
              key={`fixed-${i}`}
              className={`season-decor__anchor ${a.small ? 'season-decor__item--small' : ''}`}
              style={{ ...anchorStyle(a), color: a.color }}
            >
              <Motif />
            </span>
          );
        })}
      </div>
    </div>
  );
}
