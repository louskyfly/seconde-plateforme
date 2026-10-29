/**
 * Vérifie la configuration de sécurité Firebase avant tout déploiement.
 *
 * Ce script échoue si une règle laisse la base ouverte à tout le monde, ou si
 * les garde-fous essentiels (rôle délégué, un vote par compte, création de
 * groupes contrôlée) ont disparu. Il ne remplace pas un test sur émulateur,
 * mais il empêche de redéployer par erreur l'ancienne configuration ouverte.
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'database.rules.json');
const rules = JSON.parse(fs.readFileSync(file, 'utf8')).rules;

const errors = [];

if (rules['.read'] !== false) errors.push('La racine doit être en lecture interdite (.read: false).');
if (rules['.write'] !== false) errors.push('La racine doit être en écriture interdite (.write: false).');
if (!rules.delegates) errors.push('Le nœud delegates (rôle délégué) est absent.');
if (!rules.settings) errors.push('Le nœud settings est absent.');

const delegateWrite = String(rules.settings?.['.write'] || '');
if (!delegateWrite.includes("delegates") || !delegateWrite.includes('auth.uid')) {
  errors.push("settings doit être modifiable uniquement par un délégué (règle basée sur delegates + auth.uid).");
}

// Aucune collection métier ne doit rester ouverte en écriture sans contrôle.
const delegateOnly = [
  'announcements',
  'polls',
  'events',
  'resources',
  'projects',
  'students',
  'groupChats',
];
for (const key of delegateOnly) {
  const w = String(rules[key]?.['.write'] || '');
  if (w === 'true' || !w.includes("delegates")) {
    errors.push(`${key} doit être en écriture réservée au délégué.`);
  }
}

// Un vote : la clé doit être le compte Firebase, pas une valeur fournie par le client.
const voteWrite = String(rules.pollVotes?.$pollId?.$voter?.['.write'] || '');
if (!voteWrite.includes('auth.uid == $voter') || !voteWrite.includes('!data.exists()')) {
  errors.push('pollVotes doit imposer un seul vote par compte (auth.uid == $voter).');
}

// Création de groupes : uniquement quand le délégué l'a ouverte.
const groupWrite = String(rules.studentGroups?.$groupId?.['.write'] || '');
if (!groupWrite.includes('settings/groupsOpen')) {
  errors.push("studentGroups doit vérifier settings/groupsOpen pour les élèves.");
}

// Purge du chat à 2 jours autorisée, mais pas la suppression arbitraire.
const chatWrite = String(rules.chatMessages?.$msgId?.['.write'] || '');
if (!chatWrite.includes('172800000')) {
  errors.push('chatMessages doit autoriser la purge des messages de plus de 2 jours.');
}

// Les journaux et statistiques ne sont pas publics.
for (const key of ['adminLog', 'visits', 'messageFiles', 'maintenanceLog']) {
  const r = String(rules[key]?.['.read'] || '');
  if (r === 'true' || !r.includes('delegates')) {
    errors.push(`${key} ne doit être lisible que par le délégué.`);
  }
}

if (errors.length) {
  console.error('❌ Configuration de sécurité invalide :');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log('✅ Configuration de sécurité conforme (rôles, votes, groupes, purge, journaux).');
