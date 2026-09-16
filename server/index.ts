import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import db from './db/index.js';
import { initDatabase } from './db/schema.js';
import { seedDatabase } from './db/seed.js';

import authRoutes from './routes/auth.js';
import announcementsRoutes from './routes/announcements.js';
import ideasRoutes from './routes/ideas.js';
import messagesRoutes from './routes/messages.js';
import pollsRoutes from './routes/polls.js';
import eventsRoutes from './routes/events.js';
import resourcesRoutes from './routes/resources.js';
import projectsRoutes from './routes/projects.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

initDatabase(db);
seedDatabase(db);

app.set('trust proxy', process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) : false);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
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

app.use('/api/auth', authRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/ideas', ideasRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);

if (NODE_ENV === 'production') {
  const staticDir = path.join(__dirname, '..', '..', 'dist', 'public');
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} [${NODE_ENV}]`);
});
