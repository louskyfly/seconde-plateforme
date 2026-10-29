// Hachage des mots de passe — navigateur (Web Crypto).
//
// PBKDF2-SHA-256, 150 000 itérations : contrairement à un simple SHA-256, le
// calcul est volontairement lent, ce qui rend une attaque hors ligne par
// dictionnaire beaucoup plus coûteuse si le hash fuit.
//
// Les anciens formats restent vérifiables pour ne pas bloquer les comptes
// existants : `sha256$<sel>$<hash>` et le hash de développement `$2a$10$dev`.
const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 150_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;

  if (hash.startsWith('pbkdf2$')) {
    const [, iterations, saltHex, expected] = hash.split('$');
    const n = Number(iterations);
    if (!n || !saltHex || !expected) return false;
    try {
      const computed = await pbkdf2(password, fromHex(saltHex), n);
      return computed === expected;
    } catch {
      return false;
    }
  }

  if (hash.startsWith('sha256$')) {
    // Ancien format : conservé pour les bases existantes.
    const [, saltHex, expected] = hash.split('$');
    if (!saltHex || !expected) return false;
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password + saltHex));
    return toHex(new Uint8Array(digest)) === expected;
  }

  // Hash de développement historique : n'accepte que « dev ».
  return hash === '$2a$10$dev' && password === 'dev';
}
