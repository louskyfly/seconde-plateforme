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

/** Arbre d'automne : tronc nu et houppier en feuilles jaunes et ambre. */
function AutumnTree() {
  return (
    <svg viewBox="0 0 72 88" className="h-full w-full">
      <ellipse cx="36" cy="83" rx="24" ry="3.5" fill="#000" opacity="0.2" />
      <path d="M32.5 83V44h5v39z" fill="#5a3a22" />
      <path d="M35 58l-10-10M35 52l9-9M35 65l-8-7" stroke="#5a3a22" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <circle cx="36" cy="28" r="17" fill="#d99a0b" />
      <circle cx="19" cy="36" r="13" fill="#f0c419" />
      <circle cx="53" cy="36" r="13" fill="#dca10a" />
      <circle cx="29" cy="18" r="11" fill="#f7d945" />
      <circle cx="45" cy="20" r="10" fill="#eebc14" />
      <circle cx="36" cy="40" r="12" fill="#c98a08" />
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

const MOTIFS = {
  pumpkin: Pumpkin,
  candle: Candle,
  leaf: Leaf,
  web: SpiderWeb,
  fir: FirTree,
  autumn: AutumnTree,
  snow: Snowflake,
  gift: Gift,
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

/**
 * Les particules restent dans le haut de l'écran (y de 3 à 41 %) : aucune ne
 * descend volontairement sous la mi-écran, pour ne jamais empiéter sur la
 * lecture du texte. Le motif diffère par thème : flocon pour Noël, feuille
 * d'automne pour Halloween.
 */
const FALL_MOTIF: Record<'halloween' | 'noel', Motif> = { halloween: 'leaf', noel: 'snow' };
const PARTICLES: Record<'halloween' | 'noel', Particle[]> = {
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
};

/**
 * Éléments immobiles, ancrés dans les coins : ce sont eux qui font le décor,
 * ils ne bougent jamais, donc ils ne peuvent pas gêner la lecture ni saccader.
 *
 * Halloween en est plus généreux que Noël : l'arbre d'automne, la citrouille et
 * et les deux toiles restent visibles sur tous les écrans, les bougies
 * secondaires disparaissent sur téléphone.
 */
const ANCHORS: Record<'halloween' | 'noel', Anchor[]> = {
  halloween: [
    { motif: 'web', size: 20, opacity: 0.3, fromRight: -4, fromTop: -7 },
    { motif: 'web', size: 15, opacity: 0.24, fromLeft: -5, fromTop: -8, small: true },
    { motif: 'autumn', size: 21, opacity: 0.92, fromRight: 3, fromBottom: -2 },
    { motif: 'pumpkin', size: 13, opacity: 0.92, fromRight: 22, fromBottom: -1 },
    { motif: 'pumpkin', size: 8, opacity: 0.7, fromLeft: 2, fromBottom: -2, small: true },
    { motif: 'candle', size: 10, opacity: 0.8, fromRight: 2, fromBottom: 0, small: true },
    { motif: 'candle', size: 7.5, opacity: 0.7, fromRight: 15, fromBottom: 0, small: true },
  ],
  noel: [
    { motif: 'fir', size: 19, opacity: 0.9, fromLeft: 1.5, fromBottom: -2 },
    { motif: 'gift', size: 7, opacity: 0.7, fromRight: 4, fromBottom: 0, small: true },
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
