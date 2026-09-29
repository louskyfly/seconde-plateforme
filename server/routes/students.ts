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

/** Date d'anniversaire au format MM-JJ, l'année étant inutile. */
function cleanBirthday(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value.trim())) return null;
  const [month, day] = value.trim().split('-').map(Number);
  // Rejette le 31 février et le 00/13, que le navigateur laisse passer.
  const probe = new Date(2024, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getStudent(db: Database.Database, id: number) {
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
}

/** Membres d'un groupe, dans l'ordre d'ajout. */
function membersOf(db: Database.Database, groupId: number) {
  return db
    .prepare(
      `SELECT s.id, s.first_name, s.last_name, s.birthday, m.added_at
       FROM student_group_members m
       JOIN students s ON s.id = m.student_id
       WHERE m.group_id = ?
       ORDER BY s.last_name, s.first_name`
    )
    .all(groupId) as any[];
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

router.get('/groups', (_req, res) => {
  try {
    res.json(groupsWithMembers(db));
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Création d'un groupe, réservée au délégué.
 *
 * Un groupe peut être privé : c'est lui qui décide, les élèves ne font que
 * proposer des membres (voir propose-member). Le groupe naît « en attente » puis
 * passe par la même validation que les autres, pour que la règle des 3-4 et
 * l'unicité d'appartenance soient appliquées au même endroit.
 */
router.post('/groups', requireAuth, (req, res) => {
  try {
    const name = cleanText(req.body?.name, 80);
    if (name.length < 2) {
      res.status(400).json({ error: 'Nom du groupe requis' });
      return;
    }

    const result = db
      .prepare('INSERT INTO student_groups (name, is_private, status) VALUES (?, ?, ?)')
      .run(name, req.body?.is_private ? 1 : 0, 'en_attente');

    const id = Number(result.lastInsertRowid);
    const studentIds: number[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids.map(Number) : [];
    addMembers(db, id, studentIds, null);

    if (req.body?.validate_now !== false) {
      const err = claimGroup(db, id, cleanText(req.body?.validated_by, 30) || 'Délégué');
      if (err) {
        db.prepare('DELETE FROM student_groups WHERE id = ?').run(id);
        res.status(err.status).json({ error: err.message });
        return;
      }
    }

    res.status(201).json(db.prepare('SELECT * FROM student_groups WHERE id = ?').get(id));
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Ajoute des élèves à un groupe en attente, en ignorant les doublons. */
function addMembers(db: Database.Database, groupId: number, studentIds: number[], by: string | null): number {
  let added = 0;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO student_group_members (group_id, student_id, added_by_fingerprint) VALUES (?, ?, ?)'
  );
  for (const sid of studentIds) {
    if (!getStudent(db, sid)) continue;
    if (insert.run(groupId, sid, by).changes > 0) added += 1;
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

    const placeholders = members.map(() => '?').join(',');
    const conflicts = db
      .prepare(
        `SELECT v.student_id, g.name FROM student_group_validated v
         JOIN student_groups g ON g.id = v.group_id
         WHERE v.group_id <> ? AND v.student_id IN (${placeholders})`
      )
      .all(id, ...members.map((m) => m.id)) as { student_id: number; name: string }[];

    if (conflicts.length > 0) {
      const names = conflicts
        .map((c) => {
          const s = getStudent(db, c.student_id);
          return `${s.first_name} ${s.last_name} (${c.name})`;
        })
        .join(', ');
      throw Object.assign(new Error(`Déjà dans un groupe validé : ${names}`), { status: 409 });
    }

    db.prepare('DELETE FROM student_group_validated WHERE group_id = ?').run(id);
    const claim = db.prepare('INSERT INTO student_group_validated (student_id, group_id) VALUES (?, ?)');
    for (const m of members) claim.run(m.id, id);

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

/** Un élève propose un groupe privé ; le délégué doit le valider. */
router.post('/groups/:id/propose-member', (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = db.prepare('SELECT * FROM student_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }

    const studentId = Number(req.body?.student_id);
    const fingerprint = cleanText(req.body?.fingerprint, 64);
    if (!getStudent(db, studentId)) {
      res.status(404).json({ error: 'Élève introuvable' });
      return;
    }
    if (fingerprint.length < 8) {
      res.status(401).json({ error: 'Identifiant appareil manquant' });
      return;
    }

    // On ne touche pas à un groupe déjà validé : il est alors figé.
    if (group.status !== 'en_attente') {
      res.status(409).json({ error: 'Ce groupe n’est plus modifiable' });
      return;
    }

    addMembers(db, groupId, [studentId], fingerprint);
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

/** Retirer un élève d'un groupe. Interdit une fois le groupe validé. */
router.delete('/groups/:id/members/:studentId', requireAuth, (req, res) => {
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

    db.prepare('DELETE FROM student_group_members WHERE group_id = ? AND student_id = ?').run(
      groupId,
      Number(req.params.studentId)
    );
    res.json({ success: true, members: membersOf(db, groupId) });
  } catch (err) {
    console.error('Delete group member error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/groups/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM student_groups WHERE id = ?').get(id)) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }
    db.prepare('DELETE FROM student_groups WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
