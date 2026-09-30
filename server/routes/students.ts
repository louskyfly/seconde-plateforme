import { Router } from 'express';
import type Database from 'better-sqlite3';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';

const router = Router();

/** Taille d'un groupe : 3 ou 4 élèves, comme demandé. */
const MIN_GROUP = 3;
const MAX_GROUP = 4;

const GROUP_STATUSES = ['en_attente', 'valide', 'refuse'] as const;
type GroupStatus = (typeof GROUP_STATUSES)[number];

function isGroupStatus(value: unknown): value is GroupStatus {
  return typeof value === 'string' && (GROUP_STATUSES as readonly string[]).includes(value);
}

/** Nettoie un prénom / un nom : lettres, espaces, apostrophes, tirets. */
function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Forme normalisée d'un nom, pour repérer « Lucas », « lucas » ou « LUCAS » comme
 * le même élève. Les accents sont retirés : sans cela, un élève qui tape son
 * prénom sans accent se retrouve en doublon de lui-même.
 */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Nettoie un nom tapé dans un groupe.
 *
 * Contrairement à `cleanName`, un caractère interdit devient un espace et n'est
 * pas simplement effacé : un élève qui tape `Jean@Paul` veut dire Jean Paul, et
 * `JeanPaul` serait deux mots collés. C'est aussi ce qui rend la virgule
 * utilisable comme séparateur quand on colle une liste de noms.
 */
function cleanMemberName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Retrouve la fiche d'un élève à partir d'un nom tapé.
 *
 * C'est ce qui permet de conserver la règle « un élève ne peut être que dans un
 * groupe validé » pour tous ceux que le délégué a bien enregistrés. Un nom sans
 * correspondance reste un membre sans fiche : le groupe est valide quand même,
 * mais cet élève-là n'est pas verrouillé ailleurs.
 */
function studentByName(db: Database.Database, memberName: string) {
  const wanted = normalizeName(memberName);
  if (!wanted) return undefined;
  const students = db.prepare('SELECT * FROM students').all() as any[];
  return students.find((s) => normalizeName(`${s.first_name} ${s.last_name}`) === wanted);
}

/** Fiche d'un élève du tableau correspondant à un nom tapé, sinon rien. */
function getStudentByName(db: Database.Database, memberName: string) {
  return studentByName(db, memberName);
}

function getStudent(db: Database.Database, id: number) {
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
}

/** Membres d'un groupe, dans l'ordre d'ajout. */
function membersOf(db: Database.Database, groupId: number) {
  return db
    .prepare(
      `SELECT m.id, m.student_id, m.member_name, m.member_key, m.added_at, s.birthday
       FROM student_group_members m
       LEFT JOIN students s ON s.id = m.student_id
       WHERE m.group_id = ?
       ORDER BY m.added_at, m.id`
    )
    .all(groupId)
    .map((m: any) => ({
      ...m,
      // `id` reste l'identifiant de la fiche élève quand il y en a une : le
      // délégué s'en sert pour choisir des élèves dans le tableau.
      name: m.member_name || '',
      birthday: m.birthday ?? null,
    })) as any[];
}

/** Date d'anniversaire au format MM-JJ, l'année étant inutile. */
function cleanBirthday(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value.trim())) return null;
  const [month, day] = value.trim().split('-').map(Number);
  // Rejette le 31 février et le 00/13, que le navigateur laisse passer.
  const probe = new Date(2024, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function groupsWithMembers(db: Database.Database) {
  const groups = db.prepare('SELECT * FROM student_groups ORDER BY id DESC').all() as any[];
  return groups.map((group) => ({ ...group, members: membersOf(db, group.id) }));
}

/* ------------------------------------------------------------------ élèves */

/** Le tableau des élèves est visible de tous : c'est une liste de classe. */
router.get('/students', (_req, res) => {
  try {
    const students = db
      .prepare('SELECT * FROM students ORDER BY last_name, first_name')
      .all() as any[];
    res.json(students);
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/students', requireAuth, (req, res) => {
  try {
    const first = cleanName(req.body?.first_name);
    const last = cleanName(req.body?.last_name);

    if (first.length < 2 || last.length < 2) {
      res.status(400).json({ error: 'Prénom et nom requis' });
      return;
    }

    const birthday = cleanBirthday(req.body?.birthday);
    const result = db
      .prepare('INSERT INTO students (first_name, last_name, birthday) VALUES (?, ?, ?)')
      .run(first, last, birthday);

    res.status(201).json(getStudent(db, Number(result.lastInsertRowid)));
  } catch (err) {
    console.error('Create student error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/students/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getStudent(db, id);
    if (!existing) {
      res.status(404).json({ error: 'Élève introuvable' });
      return;
    }

    const first = cleanName(req.body?.first_name) || existing.first_name;
    const last = cleanName(req.body?.last_name) || existing.last_name;
    const birthday = req.body?.birthday === undefined ? existing.birthday : cleanBirthday(req.body.birthday);

    db.prepare('UPDATE students SET first_name = ?, last_name = ?, birthday = ? WHERE id = ?').run(
      first,
      last,
      birthday,
      id
    );
    res.json(getStudent(db, id));
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/students/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!getStudent(db, id)) {
      res.status(404).json({ error: 'Élève introuvable' });
      return;
    }
    // Les appartenances partent avec l'élève (clé étrangère en cascade).
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ----------------------------------------------------------------- groupes */

/**
 * Liste des groupes.
 *
 * Un groupe privé n'est renvoyé qu'au délégué. Le rester visible à tout le
 * monde — y compris son nom et la liste complète de ses membres — aurait fait
 * d'un groupe « privé » une simple case à cocher dans un formulaire.
 *
 * La limite est technique, pas seulement de principe : l'appartenance est
 * enregistrée par élève du tableau de classe, et rien ne relie une empreinte
 * d'appareil à une ligne de ce tableau. Le serveur ne peut donc pas reconnaître
 * « un élève de ce groupe » et ne peut donc pas décider qui a le droit de
 * le voir. Le délégué reste la seule autorité sur les groupes privés.
 */
router.get('/groups', (req, res) => {
  try {
    const tous = groupsWithMembers(db) as any[];
    const estDelegue = req.session?.authenticated === true;
    const empreinte = cleanText(req.query.fingerprint, 64);
    const identifie = empreinte.length >= 8;

    // Pour un élève : les groupes ouverts, plus ses propres groupes privés. Un
    // groupe privé créé par un camarade reste invisible, et son nom ne doit pas
    // non plus apparaître dans la réponse.
    const visibles = estDelegue
      ? tous
      : tous.filter((g) => !g.is_private || (identifie && g.created_by_fingerprint === empreinte));

    // `created_by_fingerprint` n'est jamais renvoyé : c'est une empreinte
    // d'appareil, elle n'a rien à faire dans une réponse envoyée à tous.
    // L'interface n'a besoin que de savoir si le groupe est le sien.
    res.json(
      visibles.map(({ created_by_fingerprint, ...reste }) => ({
        ...reste,
        mine: identifie && created_by_fingerprint === empreinte,
        peut_modifier: reste.status === 'en_attente' && (estDelegue || (identifie && created_by_fingerprint === empreinte)),
      }))
    );
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Création d'un groupe.
 *
 * Deux chemins :
 *  - le délégué crée et peut valider dans la foulée ;
 *  - un élève crée le sien, toujours en attente de validation. Il n'a aucun
 *    moyen de s'auto-valider, donc le contrôle reste sur le serveur et pas
 *    seulement dans l'interface.
 *
 * Le signataire est mémorisé : c'est lui qui pourra compléter son groupe tant
 * qu'il est en attente, et c'est lui seul qui verra son groupe privé.
 */
router.post('/groups', (req, res) => {
  try {
    const estDelegue = req.session?.authenticated === true;
    const name = cleanText(req.body?.name, 80);
    if (name.length < 2) {
      res.status(400).json({ error: 'Nom du groupe requis' });
      return;
    }

    let signataire: string | null = null;
    if (!estDelegue) {
      signataire = cleanText(req.body?.fingerprint, 64);
      if (signataire.length < 8) {
        res.status(401).json({ error: 'Identifiant appareil manquant' });
        return;
      }

      // Un élève ne peut pas empiler des groupes en attente : il en corrige un,
      // ou il le supprime. Sans cette limite, une erreur de formulaire se
      // transformerait en file d'attente que le délégué doit traiter une à une.
      const enAttente = db
        .prepare(
          `SELECT COUNT(*) AS n FROM student_groups
           WHERE created_by_fingerprint = ? AND status = 'en_attente'`
        )
        .get(signataire) as { n: number };
      if (enAttente.n > 0) {
        res.status(409).json({
          error: 'Tu as déjà un groupe en attente : modifie-le ou supprime-le avant d’en créer un autre',
        });
        return;
      }
    }

    const result = db
      .prepare('INSERT INTO student_groups (name, is_private, status, created_by_fingerprint) VALUES (?, ?, ?, ?)')
      .run(name, req.body?.is_private ? 1 : 0, 'en_attente', signataire);

    const id = Number(result.lastInsertRowid);
    // Deux façons de renseigner la composition : des fiches du tableau (le
    // délégué les choisit dans une liste) ou des noms tapés (les élèves n'ont
    // pas la liste sous les yeux). Les deux se mélangent.
    const studentIds: number[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids.map(Number) : [];
    const memberNames: string[] = Array.isArray(req.body?.member_names) ? req.body.member_names : [];
    addMembersById(db, id, studentIds, signataire);
    addMembersByName(db, id, memberNames, signataire);

    if (estDelegue && req.body?.validate_now !== false) {
      const err = claimGroup(db, id, cleanText(req.body?.validated_by, 30) || 'Délégué');
      if (err) {
        db.prepare('DELETE FROM student_groups WHERE id = ?').run(id);
        res.status(err.status).json({ error: err.message });
        return;
      }
    }

    res
      .status(201)
      .json(groupsWithMembers(db).find((g: any) => g.id === id));
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Ajoute des élèves du tableau à un groupe, en ignorant les doublons. */
function addMembersById(db: Database.Database, groupId: number, studentIds: number[], by: string | null): number {
  let added = 0;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO student_group_members (group_id, student_id, member_name, member_key, added_by_fingerprint) VALUES (?, ?, ?, ?, ?)'
  );
  for (const sid of studentIds) {
    const student = getStudent(db, sid);
    if (!student) continue;
    const name = `${student.first_name} ${student.last_name}`;
    if (insert.run(groupId, sid, name, normalizeName(name), by).changes > 0) added += 1;
  }
  return added;
}

/**
 * Ajoute des noms tapés à un groupe.
 *
 * Un nom tapé n'a pas besoin d'exister dans le tableau : c'est tout l'intérêt,
 * l'élève écrit le nom de ses camarades tel qu'il le connaît. Si le nom
 * correspond à une fiche du tableau, on rattache quand même le membre à cette
 * fiche, ce qui permet d'appliquer la règle « un élève dans un seul groupe
 * validé ». Sinon le membre reste sans fiche, et rien d'autre ne change.
 *
 * Les doublons sont ignorés, sans distinction de casse ni d'accents.
 */
function addMembersByName(db: Database.Database, groupId: number, rawNames: string[], by: string | null): number {
  let added = 0;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO student_group_members (group_id, student_id, member_name, member_key, added_by_fingerprint) VALUES (?, ?, ?, ?, ?)'
  );
  for (const raw of rawNames) {
    const name = cleanMemberName(raw);
    if (name.length < 2) continue;

    const fiche = getStudentByName(db, name);
    if (insert.run(groupId, fiche?.id ?? null, name, normalizeName(name), by).changes > 0) added += 1;
  }
  return added;
}

/**
 * Fige un groupe : contrôle la taille, refuse les élèves déjà pris, puis
 * réserve l'appartenance dans student_group_validated. Le statut passe à
 * « valide », ce qui le rend ensuite non modifiable.
 *
 * Renvoie `null` en cas de succès, sinon l'erreur à renvoyer au client.
 * Tout est fait dans une transaction : on ne veut pas d'un groupe marqué validé
 * alors que la réservation a échoué pour le deuxième élève.
 */
function claimGroup(
  db: Database.Database,
  id: number,
  validatedBy: string
): { status: number; message: string } | null {
  const run = db.transaction(() => {
    const members = membersOf(db, id);
    if (members.length < MIN_GROUP) {
      throw Object.assign(new Error(`Un groupe doit contenir au moins ${MIN_GROUP} élèves`), { status: 400 });
    }
    if (members.length > MAX_GROUP) {
      throw Object.assign(new Error(`Un groupe ne peut pas dépasser ${MAX_GROUP} élèves`), { status: 400 });
    }

    // Le verrou « un élève dans un seul groupe validé » ne porte que sur les
    // membres rattachés à une fiche du tableau. Un nom tapé qui n'y correspond
    // pas n'a personne à verrouiller : le groupe est valide quand même, et c'est
    // une limite assumée de l'absence de comptes élèves.
    const ids = members.map((m) => m.student_id).filter((v): v is number => typeof v === 'number');

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const conflicts = db
        .prepare(
          `SELECT v.student_id, g.name FROM student_group_validated v
           JOIN student_groups g ON g.id = v.group_id
           WHERE v.group_id <> ? AND v.student_id IN (${placeholders})`
        )
        .all(id, ...ids) as { student_id: number; name: string }[];

      if (conflicts.length > 0) {
        const names = conflicts
          .map((c) => {
            const s = getStudent(db, c.student_id);
            return s ? `${s.first_name} ${s.last_name} (${c.name})` : c.name;
          })
          .join(', ');
        throw Object.assign(new Error(`Déjà dans un groupe validé : ${names}`), { status: 409 });
      }
    }

    db.prepare('DELETE FROM student_group_validated WHERE group_id = ?').run(id);
    const claim = db.prepare('INSERT INTO student_group_validated (student_id, group_id) VALUES (?, ?)');
    for (const sid of ids) claim.run(sid, id);

    db.prepare(
      `UPDATE student_groups SET status = 'valide', validated_at = CURRENT_TIMESTAMP, validated_by = ? WHERE id = ?`
    ).run(validatedBy, id);
  });

  try {
    run();
    return null;
  } catch (err: any) {
    return { status: err.status ?? 500, message: err.status ? err.message : 'Erreur serveur' };
  }
}

/**
 * Un élève propose un groupe privé ; le délégué doit le valider.
 *
 * Pour un groupe privé, seuls son signataire et le délégué peuvent en changer
 * les membres : sinon n'importe quel élève qui découvre l'identifiant du
 * groupe pourrait se glisser dedans ou en retirer quelqu'un.
 */
router.post('/groups/:id/propose-member', (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = db.prepare('SELECT * FROM student_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }

    const fingerprint = cleanText(req.body?.fingerprint, 64);
    const estDelegue = req.session?.authenticated === true;

    // Deux façons d'ajouter un membre : une fiche du tableau (`student_id`),
    // pour le délégué, ou un nom tapé (`member_name`), pour les élèves.
    const studentId = Number(req.body?.student_id);
    const memberName = cleanMemberName(req.body?.member_name);
    const parFiche = Number.isFinite(studentId) && studentId > 0;

    if (parFiche && !getStudent(db, studentId)) {
      res.status(404).json({ error: 'Élève introuvable' });
      return;
    }
    if (!parFiche && memberName.length < 2) {
      res.status(400).json({ error: 'Indique le nom d’un élève' });
      return;
    }
    // Le délégué n'a pas d'empreinte d'appareil : il ne peut pas en avoir, et
    // l'exiger l'aurait forcé à en fabriquer une, qui n'identifierait rien.
    if (!estDelegue && fingerprint.length < 8) {
      res.status(401).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    // On ne touche pas à un groupe déjà validé : il est alors figé.
    if (group.status !== 'en_attente') {
      res.status(409).json({ error: 'Ce groupe n’est plus modifiable' });
      return;
    }

    if (group.is_private && !estDelegue && group.created_by_fingerprint !== fingerprint) {
      res.status(403).json({ error: 'Ce groupe privé ne se modifie que par son créateur' });
      return;
    }

    if (parFiche) {
      addMembersById(db, groupId, [studentId], fingerprint || null);
    } else {
      addMembersByName(db, groupId, [memberName], fingerprint || null);
    }
    res.json({ success: true, members: membersOf(db, groupId) });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      res.status(409).json({ error: 'Cet élève est déjà dans un groupe validé' });
      return;
    }
    console.error('Propose group member error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Le délégué valide un groupe : dès lors, plus personne ne peut le modifier. */
router.put('/groups/:id/status', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const group = db.prepare('SELECT * FROM student_groups WHERE id = ?').get(id) as any;
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }

    const status = req.body?.status;
    if (!isGroupStatus(status)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    // Un groupe validé ne peut pas être rouvert : repasser « en attente »
    // rendrait sa composition modifiable alors qu'elle était figée, et
    // libérerait les élèves au moment précis où ils se sont inscrits ailleurs.
    // Le refus reste possible : c'est la seule correction dont le délégué a
    // besoin, elle rend le groupe aux élèves et n'ouvre pas la composition.
    if (group.status === 'valide' && status === 'en_attente') {
      res.status(409).json({
        error: 'Un groupe validé ne peut pas être rouvert : refuse-le ou supprime-le',
      });
      return;
    }

    const validatedBy = cleanText(req.body?.validated_by, 30) || 'Délégué';

    if (status === 'valide') {
      const err = claimGroup(db, id, validatedBy);
      if (err) {
        res.status(err.status).json({ error: err.message });
        return;
      }
    } else {
      // Refuser, ou repasser en attente, libère les élèves : un groupe validé
      // qui ne l'est plus ne doit pas continuer de bloquer l'élève ailleurs.
      db.transaction(() => {
        db.prepare('DELETE FROM student_group_validated WHERE group_id = ?').run(id);
        db.prepare(
          `UPDATE student_groups SET status = ?, validated_at = CURRENT_TIMESTAMP, validated_by = ? WHERE id = ?`
        ).run(status, validatedBy, id);
      })();
    }

    res.json(db.prepare('SELECT * FROM student_groups WHERE id = ?').get(id));
  } catch (err) {
    console.error('Update group status error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Retirer un élève d'un groupe. Interdit une fois le groupe validé.
 *
 * L'élève qui a créé le groupe peut retirer un camarade tant qu'il est en
 * attente : il doit pouvoir corriger une coquille avant que le délégué valide.
 * L'identité du demandeur est vérifiée par empreinte, comme partout ailleurs.
 */
router.delete('/groups/:id/members/:memberKey', (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = db.prepare('SELECT * FROM student_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }
    if (group.status !== 'en_attente') {
      res.status(409).json({ error: 'Un groupe validé ne peut plus être modifié' });
      return;
    }

    const estDelegue = req.session?.authenticated === true;
    if (!estDelegue) {
      const empreinte = cleanText(req.query.fingerprint ?? req.body?.fingerprint, 64);
      if (empreinte.length < 8 || group.created_by_fingerprint !== empreinte) {
        res.status(403).json({ error: 'Tu ne peux modifier que les groupes que tu as créés' });
        return;
      }
    }

    // Le membre est désigné par sa clé normalisée et non par son identifiant de
    // fiche : un nom tapé n'a pas d'identifiant. Retirer un élève du tableau ou
    // un nom tapé passe donc par la même route.
    const memberKey = normalizeName(decodeURIComponent(String(req.params.memberKey)));
    if (!memberKey) {
      res.status(400).json({ error: 'Élève introuvable dans ce groupe' });
      return;
    }

    db.prepare('DELETE FROM student_group_members WHERE group_id = ? AND member_key = ?').run(groupId, memberKey);
    res.json({ success: true, members: membersOf(db, groupId) });
  } catch (err) {
    console.error('Delete group member error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Suppression d'un groupe.
 *
 * Un élève ne peut supprimer que le groupe qu'il a créé, et seulement s'il est
 * encore en attente : un groupe validé est une décision du délégué, il se
 * refuse ou se supprime depuis l'espace délégué.
 */
router.delete('/groups/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const group = db.prepare('SELECT * FROM student_groups WHERE id = ?').get(id) as any;
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }

    const estDelegue = req.session?.authenticated === true;
    if (!estDelegue) {
      const empreinte = cleanText(req.query.fingerprint ?? req.body?.fingerprint, 64);
      if (empreinte.length < 8 || group.created_by_fingerprint !== empreinte) {
        res.status(403).json({ error: 'Tu ne peux supprimer que les groupes que tu as créés' });
        return;
      }
      if (group.status !== 'en_attente') {
        res.status(409).json({ error: 'Un groupe validé ne se supprime que par le délégué' });
        return;
      }
    }

    db.prepare('DELETE FROM student_groups WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Anniversaires — élèves
 *
 * GET  /api/birthdays           → liste { fingerprint, date_mmdd } (public, pour l'animation)
 * POST /api/birthdays/me        → l'élève connecté (via fingerprint) enregistre sa date
 */

function cleanMmDd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mm = Number(m[1]), dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Liste de tous les anniversaires — publique, pour l'animation au chargement. */
router.get('/birthdays', (_req, res) => {
  try {
    const rows = db
      .prepare('SELECT fingerprint, date_mmdd FROM birthdays')
      .all() as { fingerprint: string; date_mmdd: string }[];
    res.json({ birthdays: rows });
  } catch (err) {
    console.error('Get birthdays error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** L'élève enregistre sa propre date d'anniversaire. */
router.post('/birthdays/me', (req, res) => {
  try {
    const fingerprint = cleanText(req.body?.fingerprint, 64);
    if (fingerprint.length < 8) {
      res.status(401).json({ error: 'Identifiant appareil manquant' });
      return;
    }
    const date_mmdd = cleanMmDd(req.body?.date_mmdd);
    if (!date_mmdd) {
      res.status(400).json({ error: 'Format de date invalide (attendu MM-JJ)' });
      return;
    }
    db.prepare(
      `INSERT INTO birthdays (fingerprint, date_mmdd, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(fingerprint) DO UPDATE SET date_mmdd = excluded.date_mmdd, updated_at = CURRENT_TIMESTAMP`
    ).run(fingerprint, date_mmdd);
    res.json({ success: true, date_mmdd });
  } catch (err) {
    console.error('Set birthday error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
