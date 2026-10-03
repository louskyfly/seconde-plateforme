import { Router } from 'express';
import { query, execute, queryOne, transaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanText } from '../lib/files.js';
import { cleanFirstName, isValidFirstName } from '../lib/name.js';

interface StudentRow {
  id: number;
  first_name: string;
  last_name: string;
  birthday: string | null;
}

interface GroupRow {
  id: number;
  name: string;
  is_private: number;
  status: string;
  created_by_fingerprint: string | null;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
}

interface MemberRow {
  id: number;
  student_id: number | null;
  member_name: string;
  member_key: string;
  added_at: string;
  added_by_fingerprint: string | null;
  birthday: string | null;
}

interface BirthdayRow {
  fingerprint: string;
  date_mmdd: string;
  first_name: string;
  updated_at: string;
}

const router = Router();

const MIN_GROUP = 3;
const MAX_GROUP = 4;

const GROUP_STATUSES = ['en_attente', 'valide', 'refuse'] as const;
type GroupStatus = (typeof GROUP_STATUSES)[number];

function isGroupStatus(value: unknown): value is GroupStatus {
  return typeof value === 'string' && (GROUP_STATUSES as readonly string[]).includes(value);
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanMemberName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

async function studentByName(memberName: string) {
  const wanted = normalizeName(memberName);
  if (!wanted) return undefined;
  const students = await query<StudentRow>('SELECT id, first_name, last_name FROM students');
  return students.find((s) => normalizeName(`${s.first_name} ${s.last_name}`) === wanted);
}

async function getStudentByName(memberName: string) {
  return studentByName(memberName);
}

async function getStudent(id: number) {
  return queryOne<StudentRow>('SELECT * FROM students WHERE id = $1', [id]);
}

async function membersOf(groupId: number) {
  const rows = await query<MemberRow>(
    `SELECT m.id, m.student_id, m.member_name, m.member_key, m.added_at, s.birthday
     FROM student_group_members m
     LEFT JOIN students s ON s.id = m.student_id
     WHERE m.group_id = $1
     ORDER BY m.added_at, m.id`,
    [groupId]
  );
  return rows.map((m) => ({
    ...m,
    name: m.member_name || '',
    birthday: m.birthday ?? null,
  }));
}

function cleanBirthday(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value.trim())) return null;
  const parts = value.trim().split('-').map(Number);
  const m = parts[0];
  const d = parts[1];
  const probe = new Date(2024, m - 1, d);
  if (probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

async function groupsWithMembers() {
  const groups = await query<GroupRow>('SELECT * FROM student_groups ORDER BY id DESC');
  const result = [];
  for (const group of groups) {
    const members = await membersOf(group.id);
    result.push({ ...group, members });
  }
  return result;
}

/* ------------------------------------------------------------------ élèves */

router.get('/students', async (_req, res) => {
  try {
    const students = await query<StudentRow>('SELECT * FROM students ORDER BY last_name, first_name');
    res.json(students);
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/students', requireAuth, async (req, res) => {
  try {
    const first = cleanName(req.body?.first_name);
    const last = cleanName(req.body?.last_name);

    if (first.length < 2 || last.length < 2) {
      res.status(400).json({ error: 'Prénom et nom requis' });
      return;
    }

    const birthday = cleanBirthday(req.body?.birthday);
    const result = await execute(
      'INSERT INTO students (first_name, last_name, birthday) VALUES ($1, $2, $3) RETURNING id',
      [first, last, birthday]
    );

    const student = await getStudent(result.lastInsertId as number);
    res.status(201).json(student);
  } catch (err) {
    console.error('Create student error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/students/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await getStudent(id);
    if (!existing) {
      res.status(404).json({ error: 'Élève introuvable' });
      return;
    }

    const first = cleanName(req.body?.first_name) || existing.first_name;
    const last = cleanName(req.body?.last_name) || existing.last_name;
    const birthday = req.body?.birthday === undefined ? existing.birthday : cleanBirthday(req.body?.birthday);

    await execute(
      'UPDATE students SET first_name = $1, last_name = $2, birthday = $3 WHERE id = $4',
      [first, last, birthday, id]
    );
    res.json(await getStudent(id));
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/students/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await getStudent(id))) {
      res.status(404).json({ error: 'Élève introuvable' });
      return;
    }
    await execute('DELETE FROM students WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ----------------------------------------------------------------- groupes */

router.get('/groups', async (_req, res) => {
  try {
    const groups = await groupsWithMembers();
    res.json(groups);
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/groups', async (req, res) => {
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

      const enAttente = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM student_groups
         WHERE created_by_fingerprint = $1 AND status = 'en_attente'`,
        [signataire]
      );
      if (enAttente && enAttente.n > 0) {
        res.status(409).json({
          error: 'Tu as déjà un groupe en attente : modifie-le ou supprime-le avant d\'en créer un autre',
        });
        return;
      }
    }

    const result = await execute(
      'INSERT INTO student_groups (name, is_private, status, created_by_fingerprint) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, req.body?.is_private ? 1 : 0, 'en_attente', signataire]
    );

    const id = Number(result.lastInsertId);
    const studentIds: number[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids.map(Number) : [];
    const memberNames: string[] = Array.isArray(req.body?.member_names) ? req.body.member_names : [];

    await addMembersById(id, studentIds, signataire);
    await addMembersByName(id, memberNames, signataire);

    if (estDelegue && req.body?.validate_now !== false) {
      try {
        await claimGroup(id, cleanText(req.body?.validated_by, 30) || 'Délégué');
      } catch (err: any) {
        await execute('DELETE FROM student_groups WHERE id = $1', [id]);
        res.status(err.status || 500).json({ error: err.message });
        return;
      }
    }

    const groups = await groupsWithMembers();
    res.status(201).json(groups.find((g: any) => g.id === id));
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function addMembersById(groupId: number, studentIds: number[], by: string | null): Promise<number> {
  let added = 0;
  for (const sid of studentIds) {
    const student = await getStudent(sid);
    if (!student) continue;

    const exists = await queryOne(
      'SELECT 1 FROM student_group_members WHERE group_id = $1 AND student_id = $2',
      [groupId, sid]
    );
    if (exists) continue;

    await execute(
      `INSERT INTO student_group_members (group_id, student_id, member_name, member_key, added_by_fingerprint)
       VALUES ($1, $2, $3, $4, $4)`,
      [groupId, sid, `${student.first_name} ${student.last_name}`, normalizeName(`${student.first_name} ${student.last_name}`), by]
    );
    added++;
  }
  return added;
}

async function addMembersByName(groupId: number, memberNames: string[], by: string | null): Promise<number> {
  let added = 0;
  for (const rawName of memberNames) {
    const cleaned = cleanMemberName(rawName);
    if (!cleaned) continue;

    const key = normalizeName(cleaned);
    const exists = await queryOne(
      'SELECT 1 FROM student_group_members WHERE group_id = $1 AND member_key = $2',
      [groupId, key]
    );
    if (exists) continue;

    let studentId: number | null = null;
    const student = await studentByName(cleaned);
    if (student) studentId = student.id;

    await execute(
      `INSERT INTO student_group_members (group_id, student_id, member_name, member_key, added_by_fingerprint)
       VALUES ($1, $2, $3, $4, $4)`,
      [groupId, studentId, cleaned, key, by]
    );
    added++;
  }
  return added;
}

async function claimGroup(groupId: number, validatedBy: string) {
  interface MemberForClaim {
    id: number;
    student_id: number | null;
    member_name: string;
  }
  const members = await query<MemberForClaim>(
    `SELECT m.id, m.student_id, m.member_name FROM student_group_members WHERE group_id = $1`,
    [groupId]
  );

  if (members.length < 3) throw { status: 400, message: `Un groupe doit contenir au moins ${3} élèves` };
  if (members.length > 4) throw { status: 400, message: `Un groupe ne peut pas dépasser ${4} élèves` };

  const ids = members.map((m) => m.student_id).filter((v): v is number => typeof v === 'number');

  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => '$' + (i + 2)).join(',');
    const conflicts = await query<{ student_id: number; name: string }>(
      `SELECT v.student_id, g.name FROM student_group_validated v
       JOIN student_groups g ON g.id = v.group_id
       WHERE v.group_id <> $1 AND v.student_id IN (${placeholders})`,
      [groupId, ...ids]
    );
    if (conflicts.length > 0) {
      const names: string[] = [];
      for (const c of conflicts) {
        const s = c.student_id ? await getStudent(c.student_id) : null;
        names.push(s ? `${s.first_name} ${s.last_name} (${c.name})` : c.name);
      }
      throw { status: 409, message: `Déjà dans un groupe validé : ${names.join(', ')}` };
    }
  }

  await execute('DELETE FROM student_group_validated WHERE group_id = $1', [groupId]);
  await transaction(async (client) => {
    for (const sid of ids) {
      await client.query('INSERT INTO student_group_validated (student_id, group_id) VALUES ($1, $2)', [sid, groupId]);
    }
  });

  await execute(
    `UPDATE student_groups SET status = 'valide', validated_at = CURRENT_TIMESTAMP, validated_by = $1 WHERE id = $2`,
    [validatedBy, groupId]
  );
}

router.post('/groups/:id/propose-member', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = await queryOne<GroupRow>('SELECT * FROM student_groups WHERE id = $1', [groupId]);
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }
    if (group.status !== 'en_attente') {
      res.status(400).json({ error: 'Seuls les groupes en attente acceptent des propositions' });
      return;
    }

    const estDelegue = req.session?.authenticated === true;
    const signataire = estDelegue ? null : cleanText(req.body?.fingerprint, 64);
    if (!estDelegue) {
      if (!signataire || signataire.length < 8) {
        res.status(401).json({ error: 'Identifiant appareil manquant' });
        return;
      }
      if (group.is_private && group.created_by_fingerprint !== signataire) {
        res.status(403).json({ error: 'Seul le signataire ou le délégué peut modifier un groupe privé' });
        return;
      }
    } else if (!estDelegue && group.created_by_fingerprint !== signataire) {
      res.status(403).json({ error: 'Seul le signataire peut modifier ce groupe' });
      return;
    }

    const studentIds: number[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids.map(Number) : [];
    const memberNames: string[] = Array.isArray(req.body?.member_names) ? req.body.member_names : [];
    await addMembersById(groupId, studentIds, signataire);
    await addMembersByName(groupId, memberNames, signataire);

    const groups = await groupsWithMembers();
    res.json(groups.find((g: any) => g.id === groupId));
  } catch (err) {
    console.error('Propose member error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/groups/:id/status', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!isGroupStatus(status)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    const validatedBy = cleanText(req.body?.validated_by, 30) || 'Délégué';
    try {
      await claimGroup(id, validatedBy);
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message });
      return;
    }

    const groups = await groupsWithMembers();
    res.json(groups.find((g: any) => g.id === id));
  } catch (err) {
    console.error('Update group status error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/groups/:id/members/:memberKey', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const memberKey = req.params.memberKey;

    const group = await queryOne<GroupRow>('SELECT * FROM student_groups WHERE id = $1', [groupId]);
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }

    const estDelegue = req.session?.authenticated === true;
    const signataire = cleanText(req.body?.fingerprint ?? req.query.fingerprint, 64);

    if (group.is_private) {
      const canModify = estDelegue || (signataire && group.created_by_fingerprint === signataire);
      if (!canModify) {
        res.status(403).json({ error: 'Seul le signataire ou le délégué peut modifier un groupe privé' });
        return;
      }
    } else if (!estDelegue && group.created_by_fingerprint !== signataire) {
      res.status(403).json({ error: 'Seul le signataire peut modifier ce groupe' });
      return;
    }

    await execute('DELETE FROM student_group_members WHERE group_id = $1 AND member_key = $2', [groupId, memberKey]);

    const groups = await groupsWithMembers();
    res.json(groups.find((g: any) => g.id === groupId));
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/groups/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const estDelegue = req.session?.authenticated === true;

    const group = await queryOne<GroupRow>('SELECT * FROM student_groups WHERE id = $1', [id]);
    if (!group) {
      res.status(404).json({ error: 'Groupe introuvable' });
      return;
    }

    if (group.status === 'valide' && !estDelegue) {
      res.status(403).json({ error: 'Un groupe validé ne se supprime que par le délégué' });
      return;
    }

    if (group.status === 'en_attente' && !estDelegue) {
      if (!group.created_by_fingerprint) {
        res.status(403).json({ error: 'Ce groupe ne peut être supprimé que par son créateur' });
        return;
      }
      const signataire = cleanText(req.body?.fingerprint ?? req.query.fingerprint, 64);
      if (signataire !== group.created_by_fingerprint) {
        res.status(403).json({ error: 'Seul le créateur peut supprimer son groupe en attente' });
        return;
      }
    }

    await execute('DELETE FROM student_groups WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ------------------------------------------------------------------ anniversaires */

function cleanMmDd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mm = Number(m[1]), dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function cleanFirstNameOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
  return cleaned.split(' ')[0] || null;
}

router.get('/birthdays', async (_req, res) => {
  try {
    const rows = await query<BirthdayRow>('SELECT fingerprint, date_mmdd, first_name FROM birthdays');
    res.json({ birthdays: rows });
  } catch (err) {
    console.error('Get birthdays error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/birthdays/me', async (req, res) => {
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
    const first_name = cleanFirstNameOnly(req.body?.first_name);
    if (!first_name) {
      res.status(400).json({ error: 'Prénom requis' });
      return;
    }
    await execute(
      `INSERT INTO birthdays (fingerprint, date_mmdd, first_name, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT(fingerprint) DO UPDATE SET date_mmdd = excluded.date_mmdd, first_name = excluded.first_name, updated_at = CURRENT_TIMESTAMP`,
      [fingerprint, date_mmdd, first_name]
    );
    res.json({ success: true, date_mmdd, first_name });
  } catch (err) {
    console.error('Set birthday error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;