import type { Request, Response, NextFunction } from 'express';
import { queryOne, execute } from '../db/index.js';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    userId?: number;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Non autorisé' });
  }
}

export async function checkRateLimit(ip: string): Promise<boolean> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM admin_login_attempts
    WHERE ip_address = $1 AND success = FALSE AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'`,
    [ip]
  );

  return (row?.count ?? 0) < 5;
}

export async function recordAttempt(ip: string, success: boolean): Promise<void> {
  if (!success) {
    await execute(
      'INSERT INTO admin_login_attempts (ip_address, success) VALUES ($1, FALSE)',
      [ip]
    );
  }
}