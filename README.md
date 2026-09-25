# 🏫 Seconde — Plateforme des délégués de classe

Application web moderne pour centraliser les informations d'une classe de seconde et communiquer avec son délégué. Conçue en priorité pour **iPad / iPhone** avec un design **Liquid Glass**, en PWA.

## 🔗 Deux espaces distincts

| Espace | URL | Accès |
|---|---|---|
| **Élèves** | `https://votre-domaine.fr/` | Lien public court |
| **Délégué** | `https://votre-domaine.fr/gestion/<TOKEN>/` | Lien secret + mot de passe |

## 🚀 Lancer le projet en développement

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier d'environnement
cp .env.example .env
# (sur Windows : copy .env.example .env)

# 3. Lancer le serveur + le frontend
npm run dev
```

- Frontend : **http://localhost:5173** (Vite, hot reload)
- API + base : **http://localhost:3001** (Express + SQLite)

### Identifiants par défaut
- **Lien délégué** : `http://localhost:5173/gestion/<TOKEN>/` (celui que vous avez régénéré dans Paramètres)
- **Mot de passe** : `delegue2026`

> ⚠️ Changez le mot de passe et le lien privé dès le premier lancement
> via **Paramètres → Espace délégué**.

## 🏗️ Lancer en production

```bash
# 1. Compiler serveur + frontend
npm run build

# 2. Configurer l'environnement
# NODE_ENV=production dans le fichier .env

# 3. Démarrer
npm start
```

Le serveur sert alors l'API **et** le frontend compilé (port 3001).
Ouvrez `http://localhost:3001/`.

## 🔑 Changer le mot de passe du délégué

**Depuis l'interface** (recommandé) :
1. Connectez-vous à l'espace délégué
2. Paramètres (⚙️) → section « Changer le mot de passe »
3. Saisissez l'ancien mot de passe + le nouveau

**À la création de la base** : modez `ADMIN_PASSWORD` dans `.env` puis
supprimez le fichier `data/seconde.db` et relancez `npm run db:seed`.

> Le mot de passe est stocké **haché** (bcrypt, 12 rounds), jamais en clair.

## 🔐 Sécurité implémentée

- Mot de passe haché avec **bcrypt**
- Sessions sécurisées (**cookie HttpOnly**)
- **Limitation des tentatives** : 5 échecs → blocage 15 min par IP
- **Jeton secret** du lien délégué validé côté serveur
- Lien régénérable (l'ancien devient immédiatement invalide)
- Les messages/idées anonymes ne révèlent jamais l'auteur
- Validation des formulaires côté serveur, protection XSS (échappement des réponses)
- Aucune donnée sensible dans le frontend (ni mot de passe ni hash)
- **Mode maintenance contrôlé côté serveur** : toute l'API est bloquée (503), pas seulement l'affichage
- **Fichés vérifiés par leurs magic bytes** (jamais le MIME du navigateur), taille et type limités, nom régénéré par le serveur, servis via l'API avec `nosniff` + `sandbox` (jamais de dossier public)
- Chat : chaque élève n'accède qu'aux conversations dont il est membre, limitation à 8 messages / 30 s
- Modération : le délégué supprime n'importe quel message ou photo, chaque action est journalisée

## 🛑 Bouton d'arrêt d'urgence (mode maintenance)

Tableau de bord délégué → carte « État du site » en haut de page.

- **🛑 Arrêter le site** : confirmation explicite + **mot de passe redemandé** (anti-clic accidentel)
- Les élèves voient une page de maintenance (message personnalisable) et **toutes les API renvoient 503** : impossible de contourner le mode en appelant directement une API
- Le délégué n'est **jamais** bloqué et peut se reconnecter pendant la maintenance
- **✅ Rouvrir le site** : le site revient tout seul, la page se réactualise automatiquement (15 s)
- Chaque arrêt est horodaté et journalisé (qui, quand), visible dans l'historique

## 💬 Chat de classe

Un groupe unique où toute la classe échange (élèves + délégué).

- Chaque élève choisit **un pseudo** (stocké sur son appareil, jamais d'email ni de nom)
- Messages texte **et photos**, ordre chronologique, auteur + heure, indicateur de non-lu
- Actualisation automatique toutes les 4 s + notification push à la réception d'un message
- Le délégué **peut supprimer n'importe quel message ou photo** (action journalisée) ; un élève ne peut supprimer que les siens
- Structure `conversations` / `membres` / `messages` : les conversations privées et les groupes pourront être ajoutés sans refonte

## 📝 Fiches de révision

Rubrique ouverte aux élèves : chacun dépose une image ou un PDF.

- Titre, matière, classe/niveau, description facultative
- Formats acceptés : **JPG, PNG, WEBP, GIF, PDF** — 3 Mo par image, 4 Mo par PDF
- Contrôle du **type réel** du fichier côté serveur, nom de fichier régénéré, fichiers servis via l'API (jamais publiquement listables)
- Recherche, filtre par matière, chargement progressif
- Chaque élève supprime ses propres fiches ; le délégué peut masquer ou supprimer n'importe laquelle
- Seuls le pseudo, la date et la matière sont affichés : aucune donnée personnelle

## 🧪 Tests

```bash
npm test
```

 Lance le build puis 34 tests d'intégration sur une **base temporaire** (aucune donnée réelle touchée) :
maintenance (activation, blocage, contournement API, accès délégué), chat (adhésion, envoi, réception, non-lus, isolation, suppression), fiches (dépôt, type refusé, taille refusée, masquage, suppression) et permissions.

## 📦 Structure du projet

```
seconde-platform/
├── server/              # Backend Express + SQLite
│   ├── db/              # Connexion, schéma, seed
│   ├── routes/          # 14 routeurs API
│   ├── middleware/      # Auth, rate limiting, maintenance
│   ├── lib/             # Maintenance, validation de fichiers, push
│   ├── utils/           # Bcrypt, tokens
│   ├── tests/           # Tests d'intégration (node:test)
│   └── scripts/         # Seed, génération icônes PWA
├── src/                 # Frontend React + TypeScript
│   ├── components/      # Layouts, chat, carte d'état du site, Modal
│   ├── pages/           # 10 pages élèves + 12 pages délégué
│   ├── hooks/           # useAuth, useSettings, useMaintenance, useChatUnread
│   └── lib/             # Client API, utils, types
└── public/              # PWA (manifest, sw.js, icônes)
```

## 📊 Base de données

SQLite (`data/seconde.db`) avec les tables :
`settings`, `announcements`, `ideas`, `messages`, `polls`, `poll_options`,
`poll_votes`, `events`, `resources`, `projects`, `admin_login_attempts`,
`push_subscriptions`, `announcement_reactions`, `maintenance_log`, `admin_log`,
`chat_users`, `chat_conversations`, `chat_members`, `chat_messages`, `sheets`.

Les nouvelles tables sont créées automatiquement au démarrage (`CREATE TABLE IF NOT EXISTS`) :
aucune migration manuelle n'est nécessaire.

## ☁️ Déployer le site (Render — gratuit)

Le projet est pré-configuré avec un **render.yaml** (Blueprint).

### Étapes
1. Créez un compte gratuit sur [render.com](https://render.com) (email + mot de passe)
2. Dans le Dashboard → **New** → **Blueprint** → connectez votre compte GitHub
3. Sélectionnez le dépôt `seconde-plateforme` (privé) — Render lit le `render.yaml` automatiquement
4. Configurez les variables d'environnement secrètes dans le Dashboard Render (onglet **Environment**) :
   - `SESSION_SECRET` = le Render le génère automatiquement ✅
   - `ADMIN_LINK_TOKEN` = `cb29d732629c` (ou changez-le via les Paramètres après le 1er lancement)
   - `ADMIN_PASSWORD` = `delegue2026` (ou changez-le via les Paramètres)
5. Cliquez sur **Deploy** — le build prend ~2 min
6. Une fois déployé, le site est accessible sur `https://seconde-plateforme.onrender.com/`

### Accès
- **Élèves** : `https://seconde-plateforme.onrender.com/`
- **Délégué** : `https://seconde-plateforme.onrender.com/gestion/cb29d732629c/`

### Notes
- Le QR code se génère automatiquement depuis la page **Paramètres** de l'espace délégué
- Les données SQLite sont éphémères sur le plan gratuit (perdues au redéploiement)
- En cas de crash : vérifiez les logs dans le Dashboard Render

## 🌐 Connecter un domaine court

1. Achetez un domaine court (ex : `seconde9.fr`)
2. Créez un enregistrement **A** pointant vers l'IP de votre serveur
   (ou **CNAME** vers le domaine de la plateforme d'hébergement)
3. Configurez l'environnement :
   - `SESSION_SECRET` = chaîne aléatoire longue
   - `NODE_ENV=production`
4. Option HTTPS (obligatoire pour les cookies sécurisés et la PWA) :
   - **Traefik / Caddy** : autonomes (Let's Encrypt)
   - **Railway/Render** : HTTPS automatique
   - **VPS** : `certbot --nginx`

Résultat :
- Espace élève : `https://seconde9.fr`
- Espace délégué : `https://seconde9.fr/gestion/<TOKEN>/`

## 📱 Installer sur l'iPad / iPhone (PWA)

1. Ouvrez `https://votre-domaine.fr/` dans Safari
2. Partage (bouton ⬆️) → **Sur l'écran d'accueil**
3. L'app s'ouvre en plein écran, avec son icône, hors connexion
   pour les contenus déjà chargés

## 🧪 Vérifications effectuées

- ✅ Compilation TypeScript (frontend + serveur)
- ✅ Build Vite de production
- ✅ 26 tests d'API (auth, validation de token, seed, CRUD, votes…)
- ✅ Routes publiques et privées
- ✅ Authentification + logout + rate limiting
- ✅ Formulaires élève (idée, message, vote)
- ✅ PWA (manifest, icônes, service worker)
- ✅ Design responsive iPad (sidebar grand écran / nav inférieure petit écran)

## ✍️ Auteur

Plateforme conçue sur demande pour un délégué de classe de seconde.