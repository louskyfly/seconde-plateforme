import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import db, { isPersistentStorage } from './db/index.js';
import { initDatabase, ensureDefaultChatGroup } from './db/schema.js';
import { SqliteSessionStore } from './db/session-store.js';
import { startAutoBackup } from './db/backup.js';
import { seedDatabase } from './db/seed.js';
import { maintenanceGate } from './middleware/maintenance.js';
import { startChatPurge } from './lib/chat-purge.js';

import authRoutes from './routes/auth.js';
import announcementsRoutes from './routes/announcements.js';
import ideasRoutes from './routes/ideas.js';
import messagesRoutes from './routes/messages.js';
import pollsRoutes from './routes/polls.js';
import eventsRoutes from './routes/events.js';
import resourcesRoutes from './routes/resources.js';
import projectsRoutes from './routes/projects.js';
import revisionsRoutes from './routes/revisions.js';
import studentsRoutes from './routes/students.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';
import pushRoutes from './routes/push.js';
import chatRoutes from './routes/chat.js';
import sheetsRoutes from './routes/sheets.js';
import maintenanceRoutes from './routes/maintenance.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

initDatabase(db);
seedDatabase(db);
ensureDefaultChatGroup(db);
startAutoBackup(db);
startChatPurge();

app.set('trust proxy', process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) : false);

// 24 Mo : les fiches de révision acceptent des images jusqu'à 15 Mo, converties
// en base64 par le navigateur (~20 Mo de texte JSON).
app.use(express.json({ limit: '24mb' }));
app.use(express.urlencoded({ extended: true, limit: '24mb' }));
app.use(cookieParser());

// Les réponses d'API ne doivent jamais être conservées par un cache HTTP
// (navigateur, proxy Render ou service worker). Une réponse périmée présentée
// comme fraîche est pire qu'une erreur franche : l'élève croyait ses données
// perdues alors qu'il lisait un instantané de l'ancienne base.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    // MemoryStore (défaut) perdait la session à chaque redémarrage de Render.
    store: new SqliteSessionStore(db),
    cookie: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true' ? true : ('auto' as const),
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

if (NODE_ENV === 'production') {
  const staticDir = path.join(__dirname, '..', '..', 'dist', 'public');
  app.use(express.static(staticDir));
}

// Mode maintenance : contrôle serveur global, appliqué avant toutes les routes API.
// Le délégué connecté n'est jamais bloqué, et /api/health reste accessible.
app.use(maintenanceGate);

app.use('/api/auth', authRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/ideas', ideasRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/revisions', revisionsRoutes);
app.use('/api', studentsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', persistent_storage: isPersistentStorage });
});

if (NODE_ENV === 'production') {
  const staticDir = path.join(__dirname, '..', '..', 'dist', 'public');
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} [${NODE_ENV}]`);
});
