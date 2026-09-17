export const DEFAULT_ACCENT = '#3b5ba6';

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace('#', '').trim();
  const expanded = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
}

function mix(from: number, to: number, t: number) {
  return Math.round(from + (to - from) * t);
}

export function paletteFromHex(hex: string): Record<string, string> {
  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_ACCENT)!;
  const [r, g, b] = rgb;
  const white = (step: number) => `${mix(r, 255, step)} ${mix(g, 255, step)} ${mix(b, 255, step)}`;
  const dark = (step: number) => `${mix(r, 0, step)} ${mix(g, 0, step)} ${mix(b, 0, step)}`;
  return {
    '50': white(0.92),
    '100': white(0.85),
    '200': white(0.7),
    '300': white(0.5),
    '400': white(0.25),
    '500': `${r} ${g} ${b}`,
    '600': dark(0.2),
    '700': dark(0.35),
    '800': dark(0.5),
    '900': dark(0.64),
    '950': dark(0.78),
  };
}

export function applyAccent(hex: string) {
  if (typeof document === 'undefined') return;
  const palette = paletteFromHex(hex);
  const root = document.documentElement.style;
  for (const [step, value] of Object.entries(palette)) {
    root.setProperty(`--i-${step}`, value);
  }
}