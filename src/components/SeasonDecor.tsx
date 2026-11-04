import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { normalizeSeasonTheme, type SeasonTheme } from '@/lib/season';

/**
 * Décorations de saison.
 *
 * Le thème actif est porté par l'attribut `data-season` sur <html>, posé par
 * applySeason(). On l'observe plutôt que de le stocker ici : la décoration suit
 * ainsi le thème sur toutes les pages, et disparaît avec « Normal ».
 *
 * Deux calques :
 *   1. `.season-decor__fall` — uniquement pour le sous-marin (bulles qui
 *      remontent) et Noël (flocons qui tombent). Les autres thèmes n'ont plus
 *      de particules : c'était trop chargé et peu réaliste.
 *   2. `.season-decor__fixed` — les éléments du décor (coraux, château,
 *      immeubles, lune...), ancrés sur les bords pour ne jamais passer devant
 *      le texte. Le calque est en z-index 0 et l'application en z-index 1.
 */

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

function useUid(): string {
  return useId().replace(/:/g, '');
}

/* ------------------------------------------------------------------ */
/* Halloween                                                           */
/* ------------------------------------------------------------------ */

function Pumpkin() {
  return (
    <svg viewBox="0 0 64 56" className="h-full w-full">
      <ellipse cx="32" cy="52" rx="24" ry="3" fill="#000" opacity="0.25" />
      <ellipse cx="32" cy="34" rx="26" ry="19" fill="#d95c0e" />
      <ellipse cx="20" cy="34" rx="9" ry="18" fill="#f08a2b" />
      <ellipse cx="44" cy="34" rx="9" ry="18" fill="#f08a2b" />
      <ellipse cx="32" cy="34" rx="26" ry="19" fill="none" stroke="#a84306" strokeWidth="1.4" />
      <path d="M30 16h5l-1-6h-3z" fill="#5a7a35" />
      <path d="M34 10c2-3 6-3 8-1" stroke="#5a7a35" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M20 28l7 4-7 4zM44 28l-7 4 7 4z" fill="#2a1206" />
      <path d="M18 40h28l-4 4h-20z" fill="#2a1206" />
    </svg>
  );
}

function Candle() {
  return (
    <svg viewBox="0 0 32 72" className="h-full w-full">
      <ellipse cx="16" cy="68" rx="13" ry="3.5" fill="#000" opacity="0.2" />
      <rect x="9" y="28" width="14" height="40" rx="3" fill="#f4e6cf" />
      <rect x="9" y="28" width="5" height="40" rx="2.5" fill="#fffaf0" />
      <path d="M16 28v-7" stroke="#4a3524" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 22c-4-4-2-9 0-13 2 4 4 9 0 13z" fill="#ffb340" />
      <path d="M16 21c-2-2-1-4 0-6 1 2 2 4 0 6z" fill="#fff3c4" />
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

/** Maison hantée : toit pointu, fenêtres allumées, cheminée. */
function HauntedHouse() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 160 200" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a4d" />
          <stop offset="1" stopColor="#1a1226" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="194" rx="60" ry="6" fill="#000" opacity="0.3" />
      <path d="M20 196V96l60-46 60 46v100z" fill={`url(#${uid}h)`} stroke="#120c1c" strokeWidth="2" />
      <path d="M16 98L80 44l64 54" fill="none" stroke="#2a1e3a" strokeWidth="10" strokeLinecap="round" />
      <rect x="112" y="46" width="16" height="34" fill="#241833" />
      <path d="M112 46h16" stroke="#120c1c" strokeWidth="3" />
      <g fill="#ffb347">
        <rect x="42" y="112" width="18" height="24" rx="2" />
        <rect x="100" y="112" width="18" height="24" rx="2" />
        <rect x="70" y="74" width="20" height="18" rx="2" />
      </g>
      <g stroke="#1a1226" strokeWidth="1.4">
        <path d="M51 112v24M42 124h18M109 112v24M100 124h18M80 74v18M70 83h20" />
      </g>
      <path d="M66 196v-34a14 14 0 0 1 28 0v34z" fill="#0f0a17" />
      <g fill="none" stroke="#0f0a17" strokeWidth="2" opacity="0.7">
        <path d="M20 120h120M20 150h120M20 176h120" />
      </g>
    </svg>
  );
}

function Bat() {
  return (
    <svg viewBox="0 0 80 40" className="h-full w-full">
      <path d="M40 22c-6-10-16-14-28-10 6 2 10 6 12 12-4-2-8-2-12 0 8 2 12 6 14 12 4-6 8-8 14-8s10 2 14 8c2-6 6-10 14-12-4-2-8-2-12 0 2-6 6-10 12-12-12-4-22 0-28 10z" fill="currentColor" />
    </svg>
  );
}

function MoonSmall() {
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full">
      <path d="M52 6a34 34 0 1 0 22 58A38 38 0 0 1 52 6z" fill="currentColor" opacity="0.9" />
      <circle cx="30" cy="30" r="3" fill="#fff" opacity="0.45" />
      <circle cx="24" cy="46" r="2" fill="#fff" opacity="0.35" />
      <circle cx="40" cy="52" r="2.4" fill="#fff" opacity="0.3" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Noël                                                                */
/* ------------------------------------------------------------------ */

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

const SNOW_ARMS = [0, 60, 120, 180, 240, 300];
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

/* ------------------------------------------------------------------ */
/* Sous-marin                                                          */
/* ------------------------------------------------------------------ */

function Bubble() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full">
      <circle cx="16" cy="16" r="13" fill="rgba(125, 227, 255, 0.1)" stroke="rgba(160, 235, 255, 0.7)" strokeWidth="1.4" />
      <circle cx="11" cy="11" r="3.2" fill="rgba(255, 255, 255, 0.5)" />
      <circle cx="21" cy="21" r="1.5" fill="rgba(255, 255, 255, 0.3)" />
    </svg>
  );
}

/** Corail branchu, avec pied, branches courbes et polypes lumineux. */
function Coral() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 120 140" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}c`} x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="1" stopColor="currentColor" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="136" rx="40" ry="5" fill="#000" opacity="0.18" />
      <g fill="none" stroke={`url(#${uid}c)`} strokeLinecap="round">
        <path d="M60 136V96" strokeWidth="13" />
        <path d="M60 102C44 92 32 76 30 58" strokeWidth="10" />
        <path d="M60 108C78 96 90 80 92 60" strokeWidth="10" />
        <path d="M60 96C52 82 50 70 54 58" strokeWidth="8" />
        <path d="M30 60C22 48 20 38 24 28" strokeWidth="7" />
        <path d="M30 60C38 50 42 42 40 32" strokeWidth="7" />
        <path d="M92 62C102 52 106 42 102 32" strokeWidth="7" />
        <path d="M92 62C84 52 80 44 82 34" strokeWidth="7" />
        <path d="M54 58C48 46 48 38 52 28" strokeWidth="6" />
      </g>
      <g fill="currentColor">
        <circle cx="24" cy="26" r="6" />
        <circle cx="40" cy="30" r="5.4" />
        <circle cx="102" cy="30" r="6" />
        <circle cx="82" cy="32" r="5.4" />
        <circle cx="52" cy="26" r="4.6" />
        <circle cx="30" cy="54" r="4" opacity="0.8" />
        <circle cx="92" cy="56" r="4" opacity="0.8" />
      </g>
      <g fill="#fff" opacity="0.4">
        <circle cx="22" cy="24" r="1.8" />
        <circle cx="100" cy="28" r="1.8" />
        <circle cx="50" cy="24" r="1.4" />
      </g>
    </svg>
  );
}

function Kelp() {
  return (
    <svg viewBox="0 0 50 140" className="h-full w-full">
      <path d="M25 140C10 116 40 106 25 82S40 50 25 26" stroke="currentColor" strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M10 140C0 120 20 112 10 92S20 64 10 44" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.55" />
      <path d="M40 140C50 120 30 112 40 92S30 64 40 44" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function Fish() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 90 50" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d="M12 25c12-14 36-16 50-7l14-10v34L62 32c-14 9-38 7-50-7z" fill={`url(#${uid}f)`} />
      <path d="M62 25c5-5 10-7 14-7v14c-4 0-9-2-14-7z" fill="currentColor" opacity="0.6" />
      <path d="M40 18c6 4 6 10 0 14" stroke="#06222e" strokeWidth="1.2" fill="none" opacity="0.35" />
      <circle cx="24" cy="22" r="2.6" fill="#06222e" />
      <circle cx="23" cy="21" r="0.8" fill="#fff" />
      <path d="M30 14c4-4 10-5 16-3" stroke="#fff" strokeWidth="1.4" opacity="0.25" fill="none" />
    </svg>
  );
}

function Jellyfish() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 80 110" className="h-full w-full">
      <defs>
        <radialGradient id={`${uid}j`} cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.75" />
        </radialGradient>
      </defs>
      <path d="M8 44C8 20 24 6 40 6s32 14 32 38c-10-6-22-8-32-8S18 38 8 44z" fill={`url(#${uid}j)`} />
      <g stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.75">
        <path d="M20 46c-6 14 4 20 0 34s6 16 2 24" />
        <path d="M32 48c-4 14 4 20 0 34s4 16 0 22" />
        <path d="M48 48c4 14-4 20 0 34s-4 16 0 22" />
        <path d="M60 46c6 14-4 20 0 34s-6 16-2 24" />
      </g>
      <g fill="#fff" opacity="0.4">
        <circle cx="30" cy="24" r="3" />
        <circle cx="46" cy="18" r="2" />
      </g>
    </svg>
  );
}

function Submarine() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 180 100" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <ellipse cx="90" cy="88" rx="66" ry="5" fill="#000" opacity="0.15" />
      <path d="M20 58c0-18 16-28 40-28h50c24 0 42 10 42 28s-18 28-42 28H60c-24 0-40-10-40-28z" fill={`url(#${uid}s)`} />
      <rect x="72" y="18" width="34" height="16" rx="6" fill="#d4a017" />
      <rect x="80" y="8" width="4" height="14" fill="#8a6508" />
      <path d="M84 8h14" stroke="#8a6508" strokeWidth="3" strokeLinecap="round" />
      <g fill="#bfefff" stroke="#6b4e05" strokeWidth="2">
        <circle cx="58" cy="58" r="7" />
        <circle cx="82" cy="58" r="7" />
        <circle cx="106" cy="58" r="7" />
      </g>
      <path d="M146 48l16-10v36l-16-10z" fill="#8a6508" />
      <circle cx="154" cy="58" r="4" fill="#ffd27d" />
      <path d="M20 58H6" stroke="#7dfcff" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function Starfish() {
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full">
      <path d="M40 4l8 22 24 2-18 16 6 24-20-13-20 13 6-24L8 28l24-2z" fill="currentColor" opacity="0.85" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <g fill="#fff" opacity="0.35">
        <circle cx="40" cy="34" r="2" />
        <circle cx="28" cy="44" r="1.5" />
        <circle cx="52" cy="44" r="1.5" />
        <circle cx="40" cy="52" r="1.5" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Futuriste                                                           */
/* ------------------------------------------------------------------ */

/** Gratte-ciel très haut, fenêtres éclairées et arête néon. */
function Skyscraper() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 100 320" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0b1a3a" />
          <stop offset="0.5" stopColor="#16306a" />
          <stop offset="1" stopColor="#0a1530" />
        </linearGradient>
        <pattern id={`${uid}w`} width="16" height="20" patternUnits="userSpaceOnUse">
          <rect x="3" y="5" width="7" height="9" rx="1" fill="#8ff6ff" opacity="0.75" />
        </pattern>
        <pattern id={`${uid}p`} width="32" height="40" patternUnits="userSpaceOnUse">
          <rect x="5" y="10" width="7" height="9" rx="1" fill="#ff7de9" opacity="0.7" />
        </pattern>
      </defs>
      <rect x="18" y="46" width="64" height="274" rx="4" fill={`url(#${uid}t)`} />
      <rect x="18" y="46" width="64" height="274" fill={`url(#${uid}w)`} opacity="0.4" />
      <rect x="18" y="46" width="64" height="274" fill={`url(#${uid}p)`} opacity="0.24" />
      <path d="M50 46V16" stroke="#8ff6ff" strokeWidth="2" opacity="0.8" />
      <circle cx="50" cy="14" r="3" fill="#ff7de9" />
      <path d="M18 46h64" stroke="#8ff6ff" strokeWidth="1.5" opacity="0.8" />
      <path d="M14 320V60h6" stroke="#8ff6ff" strokeWidth="1.2" opacity="0.35" fill="none" />
      <path d="M86 320V60h-6" stroke="#ff7de9" strokeWidth="1.2" opacity="0.3" fill="none" />
    </svg>
  );
}

function FlyingCar() {
  return (
    <svg viewBox="0 0 110 46" className="h-full w-full">
      <path d="M4 30h100" stroke="currentColor" strokeWidth="2" opacity="0.3" strokeLinecap="round" />
      <path d="M18 28l12-11h40l14 11z" fill="currentColor" opacity="0.9" />
      <rect x="12" y="27" width="76" height="8" rx="4" fill="currentColor" opacity="0.75" />
      <path d="M34 17h24l8 8H28z" fill="#bfefff" opacity="0.8" />
      <circle cx="26" cy="36" r="3" fill="#7dfcff" />
      <circle cx="74" cy="36" r="3" fill="#7dfcff" />
      <path d="M88 30h18" stroke="#7dfcff" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      <path d="M4 30h8" stroke="#ff7de9" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function NeonSign() {
  return (
    <svg viewBox="0 0 40 140" className="h-full w-full">
      <rect x="8" y="6" width="24" height="128" rx="6" fill="#0a1430" stroke="#ff7de9" strokeWidth="2" opacity="0.9" />
      <g stroke="#8ff6ff" strokeWidth="3" strokeLinecap="round">
        <path d="M15 24h10" />
        <path d="M15 38h10" />
        <path d="M15 52h10" />
        <path d="M15 66h10" />
        <path d="M15 80h10" />
      </g>
      <g stroke="#ff7de9" strokeWidth="3" strokeLinecap="round">
        <path d="M15 98h10" />
        <path d="M15 112h10" />
      </g>
    </svg>
  );
}

function Planet() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 120 100" className="h-full w-full">
      <defs>
        <radialGradient id={`${uid}pl`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#9fe9ff" />
          <stop offset="1" stopColor="#2a4fd8" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="50" r="30" fill={`url(#${uid}pl)`} />
      <ellipse cx="60" cy="50" rx="48" ry="12" fill="none" stroke="#ff7de9" strokeWidth="3" opacity="0.7" transform="rotate(-18 60 50)" />
      <circle cx="48" cy="40" r="4" fill="#fff" opacity="0.25" />
      <circle cx="72" cy="60" r="3" fill="#fff" opacity="0.2" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Médiéval                                                            */
/* ------------------------------------------------------------------ */

/** Château fort : donjon, tours, créneaux, porte, fenêtres et drapeaux. */
function Castle() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 240 200" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}k`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a7350" />
          <stop offset="0.5" stopColor="#b59a6c" />
          <stop offset="1" stopColor="#6f5a3c" />
        </linearGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a3b2e" />
          <stop offset="1" stopColor="#4a2119" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="196" rx="104" ry="7" fill="#000" opacity="0.25" />
      {/* Remparts */}
      <path d="M14 196V120h24v-14h18v14h16v-14h18v14h16v-14h18v14h16v-14h18v14h16v-14h18v14h16v76z" fill={`url(#${uid}k)`} />
      {/* Donjon */}
      <rect x="88" y="64" width="64" height="132" fill={`url(#${uid}k)`} />
      <path d="M84 64h8V50h12v14h8V50h12v14h8V50h12v14h8V50h8v18H84z" fill="#9c8159" />
      {/* Tours */}
      <rect x="26" y="86" width="40" height="110" fill={`url(#${uid}k)`} />
      <path d="M22 86h8V72h10v14h8V72h10v14h8V72h6v18H22z" fill="#9c8159" />
      <rect x="174" y="86" width="40" height="110" fill={`url(#${uid}k)`} />
      <path d="M170 86h8V72h10v14h8V72h10v14h8V72h6v18h-50z" fill="#9c8159" />
      {/* Toits */}
      <path d="M46 72L30 40l32 0z" fill={`url(#${uid}r)`} />
      <path d="M194 72l-16-32 32 0z" fill={`url(#${uid}r)`} />
      <path d="M120 64L96 24h48z" fill={`url(#${uid}r)`} />
      {/* Porte */}
      <path d="M104 196v-40a16 16 0 0 1 32 0v40z" fill="#2a1a12" />
      <path d="M120 140v56M108 152h24" stroke="#5a3a22" strokeWidth="2.5" />
      {/* Fenêtres allumées */}
      <g fill="#ffd27d">
        <rect x="100" y="82" width="10" height="16" rx="5" />
        <rect x="130" y="82" width="10" height="16" rx="5" />
        <rect x="38" y="108" width="8" height="14" rx="4" />
        <rect x="48" y="140" width="8" height="14" rx="4" />
        <rect x="186" y="108" width="8" height="14" rx="4" />
        <rect x="196" y="140" width="8" height="14" rx="4" />
      </g>
      {/* Drapeaux */}
      <path d="M120 24V4" stroke="#3a2a1a" strokeWidth="2.5" />
      <path d="M120 4l20 5-20 5z" fill="#c0392b" />
      <path d="M46 40V22" stroke="#3a2a1a" strokeWidth="2" />
      <path d="M46 22l14 4-14 4z" fill="#c9a227" />
      {/* Pierre */}
      <g stroke="#5b4a33" strokeWidth="1" opacity="0.35">
        <path d="M14 136h212M14 160h212M14 184h212" />
        <path d="M64 120v76M88 120v76M152 120v76M176 120v76" />
      </g>
    </svg>
  );
}

function Tower() {
  return (
    <svg viewBox="0 0 80 180" className="h-full w-full">
      <rect x="20" y="50" width="40" height="130" fill="currentColor" opacity="0.85" />
      <path d="M16 50h8V38h8v12h8V38h8v12h8V38h8v12h8v12H16z" fill="currentColor" opacity="0.95" />
      <path d="M40 38L20 8h40z" fill="#7a3b2e" />
      <path d="M40 8V0" stroke="#3a2a1a" strokeWidth="2" />
      <path d="M40 0l12 4-12 4z" fill="#c9a227" />
      <g fill="#ffd27d">
        <rect x="30" y="70" width="7" height="11" rx="3.5" />
        <rect x="43" y="98" width="7" height="11" rx="3.5" />
        <rect x="30" y="126" width="7" height="11" rx="3.5" />
      </g>
    </svg>
  );
}

function Banner() {
  return (
    <svg viewBox="0 0 40 110" className="h-full w-full">
      <path d="M20 0v110" stroke="#3a2a1a" strokeWidth="2.5" opacity="0.8" />
      <path d="M8 10h24v52l-12-10-12 10z" fill="currentColor" opacity="0.9" />
      <path d="M8 10h24v10H8z" fill="#000" opacity="0.2" />
      <path d="M14 26h12M14 38h12M14 50h8" stroke="#1b140d" strokeWidth="2.4" opacity="0.4" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 60 70" className="h-full w-full">
      <path d="M30 2l26 8v22c0 18-12 30-26 36C16 62 4 50 4 32V10z" fill="currentColor" opacity="0.9" />
      <path d="M30 8l20 6v18c0 14-9 24-20 29-11-5-20-15-20-29V14z" fill="#1b140d" opacity="0.22" />
      <path d="M30 14v38M16 30h28" stroke="#ffe0a3" strokeWidth="3.4" opacity="0.85" />
    </svg>
  );
}

function Sword() {
  return (
    <svg viewBox="0 0 30 130" className="h-full w-full">
      <path d="M15 4l6 16v66H9V20z" fill="#d9dde3" stroke="#8b939e" strokeWidth="1.5" />
      <path d="M15 4v82" stroke="#fff" strokeWidth="1.4" opacity="0.5" />
      <rect x="4" y="86" width="22" height="6" rx="3" fill="#c9a227" />
      <rect x="12" y="92" width="6" height="22" rx="3" fill="#5a3a22" />
      <circle cx="15" cy="120" r="6" fill="#c9a227" />
    </svg>
  );
}

function Chest() {
  return (
    <svg viewBox="0 0 80 60" className="h-full w-full">
      <ellipse cx="40" cy="56" rx="32" ry="4" fill="#000" opacity="0.2" />
      <rect x="8" y="24" width="64" height="30" rx="4" fill="#6b4a2a" />
      <path d="M8 24c0-10 14-16 32-16s32 6 32 16z" fill="#7d5732" />
      <rect x="8" y="30" width="64" height="6" fill="#c9a227" />
      <rect x="35" y="34" width="10" height="12" rx="2" fill="#e6c45a" />
      <g fill="#f5d76e">
        <circle cx="20" cy="44" r="2.5" />
        <circle cx="28" cy="47" r="2" />
        <circle cx="52" cy="45" r="2.5" />
        <circle cx="60" cy="48" r="2" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Fantastique                                                         */
/* ------------------------------------------------------------------ */

function Moon() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full">
      <circle cx="60" cy="60" r="46" fill="currentColor" opacity="0.95" />
      <g fill="#c9b8ff" opacity="0.45">
        <circle cx="44" cy="42" r="9" />
        <circle cx="74" cy="54" r="6" />
        <circle cx="52" cy="78" r="7" />
        <circle cx="80" cy="82" r="4" />
        <circle cx="34" cy="64" r="3.5" />
      </g>
      <g fill="#fff" opacity="0.35">
        <circle cx="40" cy="38" r="2" />
        <circle cx="76" cy="50" r="1.5" />
      </g>
    </svg>
  );
}

function Crystal() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 80 120" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}cr`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0e6ff" />
          <stop offset="0.5" stopColor="currentColor" />
          <stop offset="1" stopColor="#5b2a9e" />
        </linearGradient>
      </defs>
      <path d="M40 2l30 34-12 80H22L10 36z" fill={`url(#${uid}cr)`} opacity="0.9" />
      <path d="M40 2v114M10 36h60M40 2L22 116M40 2l18 114" stroke="#fff" strokeWidth="1.3" opacity="0.35" />
      <path d="M22 116h36l-8 4H30z" fill="#fff" opacity="0.3" />
    </svg>
  );
}

function FloatingIsland() {
  return (
    <svg viewBox="0 0 140 110" className="h-full w-full">
      <path d="M16 46c8-20 30-28 54-26 26 2 46 14 54 26-12 8-28 12-54 12S28 54 16 46z" fill="#4b2a7a" />
      <path d="M18 46c14 8 32 12 52 12s38-4 52-12l-10 34-24 16-18-10-18 10-24-16z" fill="#2a1450" />
      <path d="M22 48c10 6 24 9 48 9s38-3 48-9" stroke="#b388ff" strokeWidth="2" fill="none" opacity="0.5" />
      <g fill="#7a4fd0" opacity="0.8">
        <circle cx="40" cy="38" r="3" />
        <circle cx="62" cy="34" r="2" />
        <circle cx="88" cy="36" r="2.5" />
      </g>
      <path d="M70 58v34" stroke="#b388ff" strokeWidth="2" opacity="0.5" />
      <path d="M70 92c-6 4-6 10 0 14 6-4 6-10 0-14z" fill="#b388ff" opacity="0.7" />
    </svg>
  );
}

function MagicTree() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 180 240" className="h-full w-full">
      <defs>
        <linearGradient id={`${uid}tr`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2a1450" />
          <stop offset="1" stopColor="#5b3a86" />
        </linearGradient>
        <radialGradient id={`${uid}gl`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f0e6ff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#b388ff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="90" cy="236" rx="58" ry="6" fill="#000" opacity="0.22" />
      <path
        d="M90 236c-20-6-34-4-46 2 14 2 26 2 36-2M90 236c20-6 34-4 46 2-14 2-26 2-36-2"
        fill="none"
        stroke={`url(#${uid}tr)`}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M78 232c-4-38-2-62 6-88 2-10 8-18 12-26 4 10 10 20 12 30 6 26 8 50 6 84z"
        fill={`url(#${uid}tr)`}
      />
      <path
        d="M88 230c-2-30 0-56 6-80M100 230c2-26 0-52-4-74"
        stroke="#1b0d33"
        strokeWidth="1.6"
        opacity="0.45"
        fill="none"
      />
      <path
        d="M90 150c-16-10-30-12-44-8M90 160c16-12 32-14 46-8M90 180c-12-6-22-6-32-2M90 190c12-6 24-6 34-2"
        stroke={`url(#${uid}tr)`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="90" cy="88" rx="76" ry="68" fill={`url(#${uid}gl)`} />
      <g fill="#7c3aed">
        <ellipse cx="52" cy="104" rx="34" ry="28" opacity="0.75" />
        <ellipse cx="128" cy="104" rx="34" ry="28" opacity="0.75" />
        <ellipse cx="90" cy="68" rx="42" ry="32" opacity="0.85" />
        <ellipse cx="64" cy="76" rx="26" ry="22" opacity="0.8" />
        <ellipse cx="116" cy="76" rx="26" ry="22" opacity="0.8" />
      </g>
      <g fill="#a78bfa" opacity="0.55">
        <ellipse cx="76" cy="62" rx="18" ry="14" />
        <ellipse cx="106" cy="72" rx="16" ry="12" />
        <ellipse cx="58" cy="96" rx="14" ry="10" />
        <ellipse cx="124" cy="96" rx="14" ry="10" />
      </g>
      <g fill="#f0e6ff">
        <circle cx="70" cy="86" r="3.4" />
        <circle cx="102" cy="58" r="3" />
        <circle cx="118" cy="98" r="3.2" />
        <circle cx="52" cy="108" r="2.6" />
        <circle cx="86" cy="112" r="2.4" />
      </g>
      <g fill="#fff" opacity="0.8">
        <circle cx="68" cy="84" r="1.2" />
        <circle cx="100" cy="56" r="1.1" />
        <circle cx="116" cy="96" r="1.2" />
      </g>
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full">
      <path d="M16 1l3.2 9.8L29 14l-9.8 3.2L16 27l-3.2-9.8L3 14l9.8-3.2z" fill="currentColor" />
      <circle cx="16" cy="14" r="2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function Dragon() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      <path d="M20 40c14-14 34-20 54-16 10-10 24-12 34-4-6 2-10 6-12 12 8 2 14 6 18 12-8-2-16-2-22 2-6 12-18 20-34 20-16 0-30-8-38-26z" fill="currentColor" opacity="0.8" />
      <path d="M74 24c-8-12-20-18-34-16 10 6 16 12 18 20zM110 24c8-10 18-14 30-12-8 5-13 10-15 16z" fill="currentColor" opacity="0.65" />
      <path d="M20 40c-6-4-12-4-18 0 6 2 10 4 12 8z" fill="currentColor" opacity="0.7" />
      <circle cx="96" cy="34" r="2.4" fill="#ffd27d" />
    </svg>
  );
}

function Portal() {
  const uid = useUid();
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full">
      <defs>
        <radialGradient id={`${uid}po`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="0.5" stopColor="#b388ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#5b2a9e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="70" rx="44" ry="60" fill={`url(#${uid}po)`} />
      <path d="M18 130V56a32 32 0 0 1 64 0v74" fill="none" stroke="#d9c2ff" strokeWidth="3" opacity="0.7" />
      <path d="M26 130V58a24 24 0 0 1 48 0v72" fill="none" stroke="#b388ff" strokeWidth="2" opacity="0.5" />
      <g fill="#fff" opacity="0.6">
        <circle cx="50" cy="54" r="2" />
        <circle cx="40" cy="74" r="1.5" />
        <circle cx="60" cy="88" r="1.5" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Registre des motifs                                                 */
/* ------------------------------------------------------------------ */

const MOTIFS = {
  pumpkin: Pumpkin,
  candle: Candle,
  web: SpiderWeb,
  house: HauntedHouse,
  bat: Bat,
  moonSmall: MoonSmall,
  fir: FirTree,
  snow: Snowflake,
  gift: Gift,
  bubble: Bubble,
  coral: Coral,
  kelp: Kelp,
  fish: Fish,
  jellyfish: Jellyfish,
  submarine: Submarine,
  starfish: Starfish,
  tower: Skyscraper,
  car: FlyingCar,
  neon: NeonSign,
  planet: Planet,
  castle: Castle,
  keep: Tower,
  banner: Banner,
  shield: Shield,
  sword: Sword,
  chest: Chest,
  moon: Moon,
  crystal: Crystal,
  island: FloatingIsland,
  tree: MagicTree,
  star: Star,
  dragon: Dragon,
  portal: Portal,
};
type Motif = keyof typeof MOTIFS;

interface Box {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

interface Particle extends Box {
  duration: number;
  delay: number;
  drift: number;
  color?: string;
  small?: boolean;
}

interface Anchor {
  motif: Motif;
  /** Taille en vmin (carré) si w/h ne sont pas fournis. */
  size: number;
  /** Largeur / hauteur explicites en vmin (immeubles, château...). */
  w?: number;
  h?: number;
  opacity: number;
  color?: string;
  fromLeft?: number;
  fromRight?: number;
  fromTop?: number;
  fromBottom?: number;
  small?: boolean;
}

/** Particules uniquement pour le sous-marin (bulles) et Noël (flocons). */
const FALL_MOTIF: Partial<Record<SeasonTheme, Motif>> = {
  'sous-marin': 'bubble',
  noel: 'snow',
};

const PARTICLES: Partial<Record<SeasonTheme, Particle[]>> = {
  'sous-marin': [
    { x: 6, y: 0, size: 2.2, opacity: 0.7, duration: 12, delay: 0, drift: 5, color: '#bff4ff' },
    { x: 20, y: 0, size: 1.6, opacity: 0.55, duration: 15, delay: 2.1, drift: -6, color: '#9fe9ff' },
    { x: 35, y: 0, size: 1.9, opacity: 0.65, duration: 13, delay: 4.2, drift: 4, color: '#d8f8ff' },
    { x: 51, y: 0, size: 1.4, opacity: 0.5, duration: 16, delay: 1.3, drift: -4, color: '#8fdcf5' },
    { x: 67, y: 0, size: 2.4, opacity: 0.7, duration: 11, delay: 3.6, drift: 6, color: '#bff4ff' },
    { x: 83, y: 0, size: 1.5, opacity: 0.55, duration: 14, delay: 5.4, drift: -5, color: '#a8ecff' },
    { x: 94, y: 0, size: 1.8, opacity: 0.6, duration: 12.5, delay: 2.7, drift: 3, color: '#cff7ff' },
    { x: 42, y: 0, size: 1.3, opacity: 0.4, duration: 17, delay: 6.8, drift: 4, color: '#9fe9ff', small: true },
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
 * Éléments fixes. Les gros décors (château, immeubles) sont placés sur les
 * bords et le bas de l'écran, avec une taille en vmin : ils remplissent la
 * page sans recouvrir le texte, qui reste dans la colonne centrale.
 */
const ANCHORS: Record<Exclude<SeasonTheme, 'aucun'>, Anchor[]> = {
  halloween: [
    { motif: 'web', size: 20, opacity: 0.28, fromRight: -4, fromTop: -7 },
    { motif: 'house', size: 30, opacity: 0.7, fromRight: 0, fromBottom: -5 },
    { motif: 'moonSmall', size: 12, opacity: 0.8, fromRight: 24, fromTop: 4 },
    { motif: 'bat', size: 8, opacity: 0.55, fromRight: 34, fromTop: 10, small: true },
    { motif: 'pumpkin', size: 12, opacity: 0.92, fromRight: 30, fromBottom: -4 },
    { motif: 'candle', size: 9, opacity: 0.8, fromRight: 38, fromBottom: -3, small: true },
  ],
  noel: [
    { motif: 'fir', size: 20, opacity: 0.9, fromRight: 2, fromBottom: -5 },
    { motif: 'fir', size: 15, opacity: 0.85, fromRight: 16, fromBottom: -5 },
    { motif: 'fir', size: 10, opacity: 0.7, fromRight: 30, fromBottom: -4, small: true },
    { motif: 'gift', size: 7, opacity: 0.75, fromRight: 8, fromBottom: -3, small: true },
  ],
  'sous-marin': [
    { motif: 'kelp', size: 18, w: 10, h: 34, opacity: 0.6, fromRight: 1, fromBottom: -4, color: '#1f9e7a' },
    { motif: 'kelp', size: 16, w: 9, h: 30, opacity: 0.55, fromRight: 14, fromBottom: -4, color: '#28b58c' },
    { motif: 'coral', size: 18, opacity: 0.85, fromRight: 20, fromBottom: -5, color: '#ff8f7a' },
    { motif: 'coral', size: 13, opacity: 0.75, fromRight: 6, fromBottom: -4, color: '#ffb39e' },
    { motif: 'starfish', size: 6, opacity: 0.7, fromRight: 30, fromBottom: -2, color: '#ffb347', small: true },
    { motif: 'submarine', size: 22, w: 30, h: 16, opacity: 0.8, fromRight: 6, fromTop: 1 },
    { motif: 'jellyfish', size: 11, opacity: 0.6, fromRight: 2, fromTop: 42, color: '#c9a7ff' },
    { motif: 'fish', size: 10, opacity: 0.75, fromRight: 45, fromTop: 2, color: '#7fe3ff' },
    { motif: 'fish', size: 6, opacity: 0.5, fromRight: 24, fromBottom: 12, color: '#9fe9ff', small: true },
    { motif: 'fish', size: 7, opacity: 0.55, fromRight: 30, fromTop: 6, color: '#7fe3ff', small: true },
  ],
  futuriste: [
    { motif: 'tower', size: 26, w: 22, h: 94, opacity: 0.36, fromRight: -5, fromBottom: -8, color: '#2a6cff' },
    { motif: 'tower', size: 24, w: 16, h: 76, opacity: 0.26, fromRight: -12, fromBottom: -8, color: '#3b4fd8' },
    { motif: 'tower', size: 18, w: 12, h: 54, opacity: 0.24, fromRight: 14, fromBottom: -6, color: '#1f4bd8', small: true },
    { motif: 'neon', size: 10, w: 5, h: 18, opacity: 0.8, fromRight: 36, fromTop: 2, small: true },
    { motif: 'planet', size: 15, opacity: 0.8, fromRight: 14, fromTop: 2 },
    { motif: 'car', size: 14, w: 18, h: 8, opacity: 0.9, fromRight: 5, fromTop: 12 },
  ],
  medieval: [
    { motif: 'castle', size: 40, w: 54, h: 36, opacity: 0.62, fromRight: -3, fromBottom: -7 },
    { motif: 'keep', size: 20, w: 11, h: 26, opacity: 0.8, fromRight: 28, fromBottom: -7 },
    { motif: 'banner', size: 9, w: 4, h: 12, opacity: 0.85, fromRight: 34, fromTop: -1 },
    { motif: 'sword', size: 12, w: 4, h: 16, opacity: 0.6, fromRight: 40, fromBottom: -2, small: true },
    { motif: 'chest', size: 8, opacity: 0.7, fromRight: 8, fromBottom: -3, small: true },
  ],
  fantastique: [
    { motif: 'moon', size: 22, opacity: 0.9, fromRight: 5, fromTop: 2 },
    { motif: 'dragon', size: 16, w: 22, h: 11, opacity: 0.55, fromRight: 34, fromTop: 1 },
    { motif: 'crystal', size: 12, opacity: 0.8, fromRight: 16, fromBottom: -6, color: '#b388ff' },
    { motif: 'crystal', size: 8, opacity: 0.65, fromRight: 4, fromBottom: -6, color: '#d1b3ff', small: true },
    { motif: 'portal', size: 18, w: 14, h: 22, opacity: 0.55, fromRight: 26, fromBottom: -10 },
    { motif: 'star', size: 5, opacity: 0.9, fromRight: 40, fromTop: 4, color: '#f0e6ff', small: true },
    { motif: 'star', size: 4, opacity: 0.7, fromRight: 46, fromTop: 6, color: '#ffb3f0', small: true },
  ],
};

function anchorStyle(a: Anchor): CSSProperties {
  const w = a.w ?? a.size;
  const h = a.h ?? a.size;
  return {
    width: `${w}vmin`,
    height: `${h}vmin`,
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

  const particles = PARTICLES[season] || [];
  const fallMotif = FALL_MOTIF[season];
  const rising = season === 'sous-marin';

  return (
    <div className="season-decor" aria-hidden="true">
      {fallMotif && particles.length > 0 && (
        <div className={`season-decor__fall ${rising ? 'season-decor__fall--rise' : ''}`}>
          {particles.map((p, i) => {
            const Motif = MOTIFS[fallMotif];
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
      )}

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
