# 🏫 Seconde — Plateforme des délégués de classe

Application web moderne pour centraliser les informations d'une classe de seconde et communiquer avec son délégué. Conçue en priorité pour **iPad / iPhone** avec un design **Liquid Glass**, en PWA.

## 🔗 Deux espaces distincts

| Espace | URL | Accès |
|---|---|---|
| **Élèves** | `https://votre-domaine.fr/` | Lien public court |
| **Délégué** | `https://votre-domaine.fr/gestion-7xK4p/` | Lien secret + mot de passe |

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
- **Lien délégué** : `http://localhost:5173/gestion-7xK4p/`
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

## 📦 Structure du projet

```
seconde-platform/
├── server/              # Backend Express + SQLite
│   ├── db/              # Connexion, schéma, seed
│   ├── routes/          # 10 routeurs API
│   ├── middleware/      # Auth, rate limiting
│   ├── utils/           # Bcrypt, tokens
│   └── scripts/         # Seed, génération icônes PWA
├── src/                 # Frontend React + TypeScript
│   ├── components/      # Layouts (sidebar/bottom nav), Modal
│   ├── pages/           # 8 pages élèves + 10 pages délégué
│   ├── hooks/           # useAuth, useSettings
│   └── lib/             # Client API, utils, types
└── public/              # PWA (manifest, sw.js, icônes)
```

## 📊 Base de données

SQLite (`data/seconde.db`) avec les tables :
`settings`, `announcements`, `ideas`, `messages`, `polls`, `poll_options`,
`poll_votes`, `events`, `resources`, `projects`, `admin_login_attempts`.

Le schéma est conçu pour **ajouter d'autres classes** facilement
(colonne `class_id` à ajouter + route paramétrée `/gestion-{token}`).

## ☁️ Déployer le site

**Option 1 — Serveur Node.js (Replit, Railway, Render, Fly.io, VPS)**

```bash
npm install && npm run build && npm start
```

Sur Railway/Render : build command `npm run build`, start command `npm start`.
> ⚠️ Sur ces plateformes, montez un volume persistant pour `data/` (SQLite)
> afin de conserver les données entre les redéploiements.

**Option 2 — Bonne pratique production**: migrez vers **PostgreSQL**
(architecture déjà séparée : modifiez les requêtes dans `server/db`).

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
- Espace délégué : `https://seconde9.fr/gestion-7xK4p/`

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