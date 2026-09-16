import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

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

export function checkRateLimit(ip: string, db: Database.Database): boolean {
  const row = db.prepare(
    `SELECT COUNT(*) AS count FROM admin_login_attempts
     WHERE ip_address = ? AND success = 0 AND attempted_at > datetime('now', '-15 minutes')`
  ).get(ip) as { count: number } | undefined;

  return (row?.count ?? 0) < 5;
}

export function recordAttempt(ip: string, db: Database.Database, success: boolean): void {
  if (!success) {
    db.prepare(
      'INSERT INTO admin_login_attempts (ip_address, success) VALUES (?, ?)'
    ).run(ip, 0);
  }
}
