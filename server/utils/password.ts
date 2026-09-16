import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return uuidv4().replace(/-/g, '').substring(0, 12);
}
