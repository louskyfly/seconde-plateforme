import 'dotenv/config';
import { seedDatabase } from '../db/seed.js';
import db from '../db/index.js';

seedDatabase(db, {
  className: process.env.CLASS_NAME,
  delegateName: process.env.DELEGATE_NAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  adminLinkToken: process.env.ADMIN_LINK_TOKEN,
});

console.log('Base de données initialisée avec les données de démonstration.');
process.exit(0);