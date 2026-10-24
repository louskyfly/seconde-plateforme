import { ref, get, query, limitToFirst, push, update as firebaseUpdate, set as firebaseSet } from 'firebase/database';
import { db as fdb, FB, clean } from './firebase';

/**
 * Import UNIQUE des données saisies avant la synchronisation, quand chaque
 * appareil gardait ses données dans IndexedDB (Dexie).
 *
 * Règle simple pour ne pas dupliquer ni ressusciter des données supprimées :
 *  - une collection n'est importée que si elle est VIDE dans Firebase
 *    et qu'aucun appareil ne l'a déjà importée (meta/migrated/{chemin}) ;
 *  - chaque appareil ne tente l'import qu'une fois (localStorage).
 */
const DONE_KEY = 'firebase_migration_v1_done';

/** Vrai si l'ancienne base IndexedDB existe sur cet appareil (sans la créer). */
export async function hasLegacyLocalDb(): Promise<boolean> {
  try {
    if (!('indexedDB' in window)) return false;
    const list = (indexedDB as any).databases ? await (indexedDB as any).databases() : null;
    return list ? list.some((d: any) => d.name === 'SecondePlatformLocal') : true;
  } catch {
    return false;
  }
}

async function isEmpty(path: string) {
  const snap = await get(query(ref(fdb, path), limitToFirst(1)));
  return !snap.exists();
}

async function claim(path: string): Promise<boolean> {
  const markerRef = ref(fdb, `${FB.meta}/migrated/${path}`);
  if ((await get(markerRef)).exists()) return false;
  const empty = await isEmpty(path);
  try {
    await firebaseSet(markerRef, true);
  } catch {
    return false; // un autre appareil vient de le faire
  }
  return empty;
}

const newKey = (path: string) => push(ref(fdb, path)).key as string;
const ts = (v: any) => (typeof v === 'number' && v > 0 ? v : Date.now());

async function writeAll(updates: Record<string, any>) {
  if (Object.keys(updates).length) await firebaseUpdate(ref(fdb), clean(updates));
}

export async function migrateLocalDataOnce() {
  if (typeof window === 'undefined' || localStorage.getItem(DONE_KEY)) return;
  if (!('indexedDB' in window)) return;

  let local: typeof import('./db').db;
  try {
    // Ne pas créer une base vide sur les nouveaux appareils.
    if (!(await hasLegacyLocalDb())) {
      localStorage.setItem(DONE_KEY, '1');
      return;
    }
    local = (await import('./db')).db;
    await local.open();
  } catch (e) {
    console.warn('[migration] base locale illisible', e);
    return;
  }

  try {
    // --- Révisions
    const revisions = await local.revisionSessions.toArray();
    if (revisions.length && (await claim(FB.revisions))) {
      const u: Record<string, any> = {};
      for (const r of revisions) {
        const k = newKey(FB.revisions);
        u[`${FB.revisions}/${k}`] = {
          id: k, title: r.title, subject: r.subject, date: r.date, time: r.time || '',
          duration: Number(r.duration) || 60, location: r.location || '', description: r.description || '',
          createdByFingerprint: r.createdByFingerprint || null,
          createdAt: ts(r.createdAt), updatedAt: ts(r.updatedAt),
        };
      }
      await writeAll(u);
    }

    // --- Calendrier
    const events = await local.events.toArray();
    if (events.length && (await claim(FB.events))) {
      const u: Record<string, any> = {};
      for (const e of events) {
        const k = newKey(FB.events);
        u[`${FB.events}/${k}`] = {
          id: k, title: e.title, date: e.date, time: e.time || '', description: e.description || '',
          category: e.category || 'evenement', createdAt: ts(e.createdAt), updatedAt: ts(e.updatedAt),
        };
      }
      await writeAll(u);
    }

    // --- Messages au délégué
    const messages = await local.messages.toArray();
    if (messages.length && (await claim(FB.messages))) {
      const u: Record<string, any> = {};
      for (const m of messages) {
        const k = newKey(FB.messages);
        u[`${FB.messages}/${k}`] = {
          id: k, content: m.content, category: m.category || 'autre', anonymous: !!m.anonymous,
          authorName: m.authorName || null, fingerprint: m.fingerprint || null, status: m.status || 'nouveau',
          delegateReply: m.delegateReply || null, repliedAt: m.repliedAt || null,
          responseReadAt: m.responseReadAt || null, createdAt: ts(m.createdAt), updatedAt: ts(m.updatedAt),
        };
      }
      await writeAll(u);
    }

    // --- Élèves et groupes
    const students = await local.students.toArray();
    const studentKeys = new Map<number, string>();
    if (students.length && (await claim(FB.students))) {
      const u: Record<string, any> = {};
      for (const s of students) {
        const k = newKey(FB.students);
        if (s.id != null) studentKeys.set(s.id, k);
        u[`${FB.students}/${k}`] = {
          id: k, firstName: s.firstName, lastName: s.lastName, birthday: s.birthday || '',
          createdAt: ts(s.createdAt), updatedAt: ts(s.createdAt),
        };
      }
      await writeAll(u);
    }
    const groups = await local.studentGroups.toArray();
    if (groups.length && (await claim(FB.studentGroups))) {
      const allMembers = await local.studentGroupMembers.toArray();
      const u: Record<string, any> = {};
      for (const g of groups) {
        const k = newKey(FB.studentGroups);
        const members: Record<string, any> = {};
        for (const m of allMembers.filter((m) => m.groupId === g.id)) {
          members[newKey(FB.studentGroups)] = {
            studentId: (m.studentId != null && studentKeys.get(m.studentId)) || null,
            memberName: m.memberName, memberKey: m.memberKey,
            addedByFingerprint: m.addedByFingerprint || null, addedAt: ts(m.addedAt),
          };
        }
        u[`${FB.studentGroups}/${k}`] = {
          id: k, name: g.name, isPrivate: !!g.isPrivate, status: g.status || 'en_attente',
          createdByFingerprint: g.createdByFingerprint || null, members,
          createdAt: ts(g.createdAt), updatedAt: ts(g.createdAt),
        };
      }
      await writeAll(u);
    }

    // --- Sondages + votes
    const polls = await local.polls.toArray();
    if (polls.length && (await claim(FB.polls))) {
      const options = await local.pollOptions.toArray();
      const votes = await local.pollVotes.toArray();
      const u: Record<string, any> = {};
      for (const p of polls) {
        const k = newKey(FB.polls);
        const optKeys = new Map<number, string>();
        const opts: Record<string, any> = {};
        options.filter((o) => o.pollId === p.id).forEach((o, i) => {
          const ok = `o${i}`;
          if (o.id != null) optKeys.set(o.id, ok);
          opts[ok] = { text: o.text, position: o.position ?? i };
        });
        u[`${FB.polls}/${k}`] = {
          id: k, question: p.question, allowMultiple: !!p.allowMultiple, showResults: p.showResults !== false,
          anonymous: p.anonymous !== false, active: p.active !== false, options: opts,
          createdAt: ts(p.createdAt), updatedAt: ts(p.createdAt),
        };
        for (const v of votes.filter((v) => v.pollId === p.id)) {
          const ok = optKeys.get(v.optionId);
          if (!ok || !v.voterFingerprint) continue;
          u[`${FB.pollVotes}/${k}/${v.voterFingerprint}/options/${ok}`] = true;
          u[`${FB.pollVotes}/${k}/${v.voterFingerprint}/createdAt`] = ts(v.createdAt);
        }
      }
      await writeAll(u);
    }

    // --- Fiches (une par une : les fichiers peuvent être lourds)
    const sheets = await local.sheets.toArray();
    if (sheets.length && (await claim(FB.sheets))) {
      for (const s of sheets) {
        const k = newKey(FB.sheets);
        const hasFile = !!s.fileData && s.fileData.length < 6_000_000;
        try {
          await writeAll({
            [`${FB.sheets}/${k}`]: {
              id: k, title: s.title, subject: s.subject || 'autre', classLevel: s.classLevel || '',
              description: s.description || '', authorName: s.authorName || 'Anonyme',
              authorFingerprint: s.authorFingerprint || null, fileName: s.fileName || null,
              mimeType: s.mimeType || null, fileSize: s.fileSize || 0, kind: s.kind || 'image',
              status: s.status || 'active', hasFile, createdAt: ts(s.createdAt), updatedAt: ts(s.updatedAt),
            },
            ...(hasFile ? { [`${FB.sheetFiles}/${k}`]: { data: s.fileData, mimeType: s.mimeType || '' } } : {}),
          });
        } catch (e) {
          console.warn('[migration] fiche ignorée', s.title, e);
        }
      }
    }

    // --- Réglages de la classe (seulement si jamais enregistrés dans Firebase)
    const settings = await local.settings.get(1);
    if (settings && !(await get(ref(fdb, FB.settings))).exists()) {
      const { id, password_hash, createdAt, ...rest } = settings as any;
      await firebaseUpdate(ref(fdb, FB.settings), clean({ ...rest, updatedAt: ts(settings.updatedAt) }));
    }

    localStorage.setItem(DONE_KEY, '1');
  } catch (e) {
    // Pas de connexion ou règle refusée : on réessaiera au prochain lancement.
    console.warn('[migration] interrompue', e);
  }
}
