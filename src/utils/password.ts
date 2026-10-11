// Password hashing using Web Crypto API (works in browser)
const encoder = new TextEncoder();

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(password: string): Promise<string> {
  const saltArray = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltedPassword = encoder.encode(password + saltHex);
  const hash = await hashBuffer(saltedPassword.buffer as ArrayBuffer);
  return `sha256$${saltHex}$${hash}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith('sha256$')) {
    // Legacy bcrypt hash - for migration, just check if it's the dev hash
    return hash === '$2a$10$dev' && password === 'dev';
  }
  
  const parts = hash.split('$');
  if (parts.length !== 3) return false;
  
  const saltHex = parts[1];
  const expectedHash = parts[2];
  
  const saltedPassword = encoder.encode(password + saltHex);
  const computedHash = await hashBuffer(saltedPassword.buffer as ArrayBuffer);
  
  return computedHash === expectedHash;
}