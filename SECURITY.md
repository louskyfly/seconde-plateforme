# Sécurité — à lire avant de déployer

## État actuel de la production (important)

La base Firebase `sync-3626f` est **encore ouverte** : `database.rules.json` n'a
pas pu être déployé depuis ce poste, faute de compte Firebase CLI connecté et
parce que **Firebase Authentication est désactivé** sur le projet.

Vérifications faites le 29/10/2026 :

- `GET /settings.json` → **200 sans authentification** ;
- `GET /students.json?shallow=true` → **35 entrées** lisibles sans compte ;
- `accounts:signUp` (connexion anonyme) → **400** (fournisseur désactivé) ;
- `firebase login:list` → **aucun compte autorisé**.

Autrement dit : tant que les étapes ci-dessous ne sont pas faites, **n'importe
qui ayant l'URL de la base peut lire et modifier les données**, y compris les
noms des élèves.

De plus, la base ne contient aucun `passwordHash` : le code retombe sur le hash
de développement et accepte le mot de passe `dev`. **Change-le en priorité.**

## Ce que le code livré apporte

- `src/lib/auth.ts` : connexion anonyme des élèves et compte email/mot de passe
  du délégué. Si Firebase Auth est indisponible, l'application continue de
  fonctionner comme avant (aucune régression).
- `database.rules.json` : règles complètes basées sur `auth.uid` et le nœud
  `delegates`, avec :
  - lecture/écriture réservées aux comptes connectés ;
  - écritures « délégué » pour annonces, sondages, événements, ressources,
    projets, élèves, chats de groupe, paramètres, journaux, visites ;
  - un seul vote par compte (`pollVotes/$pollId/$voter` avec
    `auth.uid == $voter`) ;
  - création de groupes par les élèves **uniquement si**
    `settings/groupsOpen === true` ;
  - validation d'un groupe réservée au délégué ;
  - purge du chat autorisée pour les messages de plus de 48 h ;
  - `adminLog`, `visits`, `messageFiles`, `maintenanceLog` lisibles par le
    délégué seulement.
- `scripts/check-rules.mjs` : test automatique (`npm test`) qui refuse une
  configuration ouverte.
- `firebase.json` / `.firebaserc` : déploiement des règles.

## Activation — dans cet ordre

> Ne déploie **pas** les règles avant d'avoir activé Auth, sinon l'application
> ne pourra plus lire la base.

1. **Console Firebase** → projet `sync-3626f` → *Authentication* →
   *Sign-in method* :
   - activer **Anonyme** (élèves) ;
   - activer **E-mail/Mot de passe** (délégué).
2. **Se connecter à Firebase CLI** sur un poste autorisé :
   ```bash
   firebase login
   ```
3. **Déployer les règles** :
   ```bash
   npm run rules:deploy
   ```
4. **Créer le compte délégué** : ouvrir
   `https://seconde-plateforme.onrender.com/gestion/<TOKEN>/`.
   L'écran affiche « Première configuration » : saisir l'e-mail et un mot de
   passe de 8 caractères minimum. Ce compte devient le délégué
   (`delegates/<uid>`). Il fonctionne ensuite sur n'importe quel appareil.
5. **Tester** avec un autre appareil :
   - élève : la page d'accueil se charge (connexion anonyme) ;
   - délégué : connexion e-mail + mot de passe ;
   - un élève ne peut pas ouvrir `/gestion/<TOKEN>/` sans le mot de passe.
6. **Supprimer l'ancien hash** dans la console : `settings/passwordHash`
   (il n'est plus utilisé et restait lisible).

## Limites connues

- Le **jeton du lien délégué** reste lisible dans `settings` : il ne sert plus
  qu'à masquer l'URL de connexion, la vraie protection est le compte Firebase.
- Les **messages anonymes** ne stockent plus d'empreinte ; leur historique est
  conservé localement (`localStorage`, clé `anon_message_ids`). Vider les
  données du site efface cet historique.
- L'appartenance aux **chats de groupe** reste vérifiée côté application : les
  règles empêchent l'écriture si le groupe n'est pas validé ou s'il est fermé,
  mais ne vérifient pas la liste des membres (les membres sont identifiés par
  nom, pas par compte).
- Les **règles n'ont pas pu être testées sur émulateur** ici. Après déploiement,
  vérifier les parcours élève/délégué ; en cas de blocage, restaurer les
  anciennes règles depuis la console (onglet *Rules* → historique).

## Retour arrière

Dans la console Firebase → *Realtime Database* → *Rules* → historique, restaurer
la version précédente. Les données ne sont pas modifiées par un changement de
règles.
