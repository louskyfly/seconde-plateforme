import { useEffect, useState } from 'react';
import { normalizeSeasonTheme, type SeasonTheme } from '@/lib/season';

/**
 * Décorations de saison (citrouilles, bougies, sapins, étoiles…).
 *
 * Le thème actif est porté par l'attribut `data-season` sur <html>, posé par
 * applySeason(). On l'observe plutôt que de le stocker ici : la décoration suit
 * ainsi le thème quel que soit l'écran affiché, et disparaît avec « Normal ».
 *
 * Les dessins sont en SVG (nets à toute taille, pas d'image à charger) et
 * animés uniquement en CSS, avec un nombre d'éléments fixe pour ne pas peser
 * sur un téléphone d'élève.
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
      <rect x="9" y="28" width="14" height="40" rx="3" fill="#f4e6cf" />
      <rect x="9" y="28" width="5" height="40" rx="2.5" fill="#fffaf0" />
      <ellipse cx="16" cy="30" rx="8" ry="2.6" fill="#e2d3b6" />
      <path d="M16 28v-7" stroke="#4a3524" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 22c-4-4-2-9 0-13 2 4 4 9 0 13z" fill="#ffb340" />
      <path d="M16 21c-2-2-1-4 0-6 1 2 2 4 0 6z" fill="#fff3c4" />
    </svg>
  );
}

function Bat() {
  return (
    <svg viewBox="0 0 64 40" className="h-full w-full">
      <path
        d="M32 22C24 10 12 8 4 12c4 4 6 8 4 12 4-2 8 0 10 4 3-2 6-2 9 0 2-3 3-5 5-6zM32 22c8-12 20-14 28-10-4 4-6 8-4 12-4-2-8 0-10 4-3-2-6-2-9 0-2-3-3-5-5-6z"
        fill="#2b1b3d"
      />
      <ellipse cx="32" cy="24" rx="5" ry="7" fill="#2b1b3d" />
      <path d="M28 15l-2-6 5 4zM36 15l2-6-5 4z" fill="#2b1b3d" />
      <circle cx="30" cy="22" r="1.3" fill="#ff9e3e" />
      <circle cx="34" cy="22" r="1.3" fill="#ff9e3e" />
    </svg>
  );
}

function Ghost() {
  return (
    <svg viewBox="0 0 48 56" className="h-full w-full">
      <path
        d="M24 4c11 0 18 8 18 19v29l-6-5-6 5-6-5-6 5-6-5-6 5V23C6 12 13 4 24 4z"
        fill="#e8e2f5"
        opacity="0.85"
      />
      <ellipse cx="17" cy="22" rx="3.4" ry="4.4" fill="#3a2a55" />
      <ellipse cx="31" cy="22" rx="3.4" ry="4.4" fill="#3a2a55" />
      <ellipse cx="24" cy="33" rx="4" ry="3.4" fill="#3a2a55" />
    </svg>
  );
}

function SpiderWeb() {
  const rays = [0, 30, 60, 90, 120, 150];
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <g stroke="#cbd5e1" strokeWidth="1" fill="none" opacity="0.5">
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
    <svg viewBox="0 0 64 80" className="h-full w-full">
      <rect x="29" y="66" width="6" height="12" rx="2" fill="#5a3a22" />
      <path d="M32 6l16 24H16z" fill="#1f7a3d" />
      <path d="M32 24l20 26H12z" fill="#2b8f4a" />
      <path d="M32 44l23 26H9z" fill="#359a55" />
      <path d="M32 2l3.2 6.4 7 1-5 5 1.2 7-6.4-3.4-6.4 3.4 1.2-7-5-5 7-1z" fill="#f5d76e" />
      <circle cx="26" cy="34" r="2" fill="#f5d76e" />
      <circle cx="38" cy="42" r="2" fill="#e0484f" />
      <circle cx="27" cy="55" r="2" fill="#f5d76e" />
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full">
      <path
        d="M12 1.6l3.1 6.9 7.4.8-5.5 5 1.5 7.3L12 17.8 5.5 21.6 7 14.3 1.5 9.3l7.4-.8z"
        fill="#ffe9a3"
      />
    </svg>
  );
}

function Snowflake() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" stroke="#eaf4ff" strokeWidth="1.6" strokeLinecap="round" fill="none">
      <path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17" />
      <path d="M12 6l-2.6-2.2M12 6l2.6-2.2M12 18l-2.6 2.2M12 18l2.6 2.2" />
      <path d="M5.6 9.6L2.7 8.9M5.6 9.6l-.5-3M18.4 14.4l2.9.7M18.4 14.4l.5 3" />
    </svg>
  );
}

function Gift() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <rect x="6" y="18" width="36" height="26" rx="3" fill="#c0273a" />
      <rect x="6" y="18" width="36" height="8" rx="3" fill="#d9364c" />
      <rect x="20" y="18" width="8" height="26" fill="#f2e3b8" />
      <path d="M24 18c-6 0-9-3-8-6 1.4-3.4 6-1 8 6zm0 0c6 0 9-3 8-6-1.4-3.4-6-1-8 6z" fill="#f2e3b8" />
    </svg>
  );
}

function Ornament() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full">
      <rect x="14" y="0" width="4" height="6" rx="1.5" fill="#c9a227" />
      <circle cx="16" cy="19" r="12" fill="#c0273a" />
      <path d="M8 12c3 4 3 14 0 18M24 12c-3 4-3 14 0 18" stroke="#f2e3b8" strokeWidth="1.6" fill="none" />
      <circle cx="11" cy="14" r="2.6" fill="#fff" opacity="0.7" />
    </svg>
  );
}

const MOTIFS = { pumpkin: Pumpkin, candle: Candle, bat: Bat, ghost: Ghost, web: SpiderWeb, tree: FirTree, star: Star, snow: Snowflake, gift: Gift, ornament: Ornament };
type Motif = keyof typeof MOTIFS;

interface Placement {
  motif: Motif;
  /** Position en % de la fenêtre. */
  x: number;
  y: number;
  /** Taille en vmin : la décoration s'adapte au téléphone comme au grand écran. */
  size: number;
  animation: string;
  duration: number;
  delay: number;
  opacity: number;
  /** Masqué sur petit écran pour ne pas encombrer le contenu. */
  mobile?: boolean;
}

/**
 * Disposition volontairement asymmetrical et aérée : les décorations doivent
 * rester sur les bords pour ne pas concurrencer le texte des cartes en verre.
 * `mobile: false` masque l'élément sur petit écran, où la place manque.
 */
const PLACEMENTS: Record<'halloween' | 'noel', Placement[]> = {
  halloween: [
    { motif: 'pumpkin', x: 6, y: 74, size: 13, animation: 'decor-sway', duration: 6, delay: 0, opacity: 0.9 },
    { motif: 'pumpkin', x: 88, y: 80, size: 10, animation: 'decor-sway', duration: 7.5, delay: 1.1, opacity: 0.8, mobile: false },
    { motif: 'pumpkin', x: 46, y: 88, size: 8, animation: 'decor-sway', duration: 6.8, delay: 2.3, opacity: 0.6, mobile: false },
    { motif: 'candle', x: 17, y: 86, size: 11, animation: 'decor-flicker', duration: 4, delay: 0.4, opacity: 0.85 },
    { motif: 'candle', x: 80, y: 88, size: 9, animation: 'decor-flicker', duration: 4.6, delay: 1.7, opacity: 0.7, mobile: false },
    { motif: 'candle', x: 30, y: 92, size: 7, animation: 'decor-flicker', duration: 3.6, delay: 2.9, opacity: 0.55, mobile: false },
    { motif: 'bat', x: 22, y: 14, size: 7, animation: 'decor-fly', duration: 11, delay: 0, opacity: 0.55 },
    { motif: 'bat', x: 64, y: 9, size: 6, animation: 'decor-fly', duration: 13, delay: 3, opacity: 0.5, mobile: false },
    { motif: 'bat', x: 82, y: 30, size: 5, animation: 'decor-fly', duration: 15, delay: 6, opacity: 0.45, mobile: false },
    { motif: 'ghost', x: 92, y: 20, size: 8, animation: 'decor-float', duration: 9, delay: 0.8, opacity: 0.5, mobile: false },
    { motif: 'ghost', x: 4, y: 34, size: 6, animation: 'decor-float', duration: 10, delay: 3.4, opacity: 0.45, mobile: false },
    { motif: 'web', x: -8, y: -6, size: 26, animation: 'none', duration: 0, delay: 0, opacity: 0.35, mobile: false },
  ],
  noel: [
    { motif: 'tree', x: 5, y: 70, size: 17, animation: 'decor-sway', duration: 7, delay: 0, opacity: 0.95 },
    { motif: 'tree', x: 89, y: 74, size: 14, animation: 'decor-sway', duration: 8, delay: 1.3, opacity: 0.85, mobile: false },
    { motif: 'tree', x: 47, y: 87, size: 10, animation: 'decor-sway', duration: 7.6, delay: 2.5, opacity: 0.6, mobile: false },
    { motif: 'gift', x: 19, y: 88, size: 8, animation: 'decor-float', duration: 6, delay: 0.5, opacity: 0.85 },
    { motif: 'gift', x: 78, y: 90, size: 7, animation: 'decor-float', duration: 6.8, delay: 2.2, opacity: 0.7, mobile: false },
    { motif: 'ornament', x: 11, y: 58, size: 5, animation: 'decor-sway', duration: 5.4, delay: 0.9, opacity: 0.75 },
    { motif: 'ornament', x: 85, y: 52, size: 5, animation: 'decor-sway', duration: 5.8, delay: 2, opacity: 0.7, mobile: false },
    { motif: 'ornament', x: 72, y: 16, size: 4, animation: 'decor-sway', duration: 6.2, delay: 3.1, opacity: 0.6, mobile: false },
    { motif: 'star', x: 15, y: 12, size: 3, animation: 'decor-twinkle', duration: 3.4, delay: 0, opacity: 0.9 },
    { motif: 'star', x: 34, y: 7, size: 2.4, animation: 'decor-twinkle', duration: 4.2, delay: 1.2, opacity: 0.85 },
    { motif: 'star', x: 58, y: 11, size: 2.8, animation: 'decor-twinkle', duration: 3.8, delay: 2.4, opacity: 0.8 },
    { motif: 'star', x: 78, y: 6, size: 2.2, animation: 'decor-twinkle', duration: 4.6, delay: 0.6, opacity: 0.75, mobile: false },
    { motif: 'star', x: 92, y: 42, size: 2.6, animation: 'decor-twinkle', duration: 3.6, delay: 3.4, opacity: 0.7, mobile: false },
    { motif: 'star', x: 6, y: 44, size: 2, animation: 'decor-twinkle', duration: 4.4, delay: 1.8, opacity: 0.7, mobile: false },
    { motif: 'snow', x: 12, y: 24, size: 2.6, animation: 'decor-fall', duration: 13, delay: 0, opacity: 0.8 },
    { motif: 'snow', x: 31, y: 40, size: 2, animation: 'decor-fall', duration: 17, delay: 3, opacity: 0.7 },
    { motif: 'snow', x: 50, y: 30, size: 2.4, animation: 'decor-fall', duration: 15, delay: 6, opacity: 0.75 },
    { motif: 'snow', x: 68, y: 46, size: 2, animation: 'decor-fall', duration: 19, delay: 2, opacity: 0.65, mobile: false },
    { motif: 'snow', x: 88, y: 34, size: 2.6, animation: 'decor-fall', duration: 16, delay: 8, opacity: 0.7, mobile: false },
  ],
};

export function SeasonDecor() {
  const season = useSeasonFromDocument();
  const placements = season === 'aucun' ? undefined : PLACEMENTS[season];

  if (!placements) return null;

  return (
    <div className="season-decor" aria-hidden="true">
      {placements.map((p, i) => {
        const Motif = MOTIFS[p.motif];
        return (
          <span
            key={`${season}-${i}`}
            className={`season-decor__item ${p.mobile ? 'season-decor__item--wide' : ''}`}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}vmin`,
              height: `${p.size}vmin`,
              opacity: p.opacity,
              animation: p.animation === 'none' ? undefined : `${p.animation} ${p.duration}s ease-in-out ${p.delay}s infinite`,
            }}
          >
            <Motif />
          </span>
        );
      })}
    </div>
  );
}
