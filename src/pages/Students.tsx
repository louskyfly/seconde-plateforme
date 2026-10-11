import { useState, useEffect } from 'react';
import { db, getFingerprint } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

export default function Students() {
  const fingerprint = useFingerprint();
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', birthday: '' });
  const [newGroup, setNewGroup] = useState({ name: '', isPrivate: false, studentIds: [] as number[], memberNames: [] as string[] });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [students, groups] = await Promise.all([
      db.students.toArray(),
      db.studentGroups.toArray(),
    ]);
    const groupsWithMembers = await Promise.all(groups.map(async (g) => {
      const members = await db.studentGroupMembers.where('groupId').equals(g.id!).toArray();
      return { ...g, members };
    }));
    setStudents(students);
    setGroups(groupsWithMembers);
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await db.students.add({ ...newStudent, createdAt: Date.now() });
    const student = await db.students.get(result);
    setStudents([student, ...students]);
    setNewStudent({ firstName: '', lastName: '', birthday: '' });
    setShowStudentForm(false);
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fp = getFingerprint();
    const isPrivate = newGroup.isPrivate;
    const result = await db.studentGroups.add({
      name: newGroup.name.trim(),
      isPrivate,
      status: 'en_attente',
      createdByFingerprint: isPrivate ? fp : null,
      createdAt: Date.now(),
    });
    const groupId = result;

    for (const studentId of newGroup.studentIds) {
      const student = await db.students.get(studentId);
      if (student) {
        await db.studentGroupMembers.add({
          groupId,
          studentId,
          memberName: `${student.firstName} ${student.lastName}`,
          memberKey: `${student.firstName} ${student.lastName}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(),
          addedByFingerprint: fp,
        });
      }
    }
    for (const name of newGroup.memberNames) {
      if (!name.trim()) continue;
      const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
      const exists = await db.studentGroupMembers.where('groupId').equals(groupId).and(m => m.memberKey === key).first();
      if (!exists) {
        await db.studentGroupMembers.add({
          groupId,
          studentId: null,
          memberName: name.trim(),
          memberKey: key,
          addedByFingerprint: fp,
        });
      }
    }

    loadData();
    setNewGroup({ name: '', isPrivate: false, studentIds: [], memberNames: [] });
    setShowGroupForm(false);
  };

  const handleDeleteStudent = async (id: number) => {
    if (!confirm('Supprimer cet eleve ?')) return;
    await db.students.delete(id);
    setStudents(students.filter(s => s.id !== id));
  };

  const handleDeleteGroup = async (id: number) => {
    if (!confirm('Supprimer ce groupe ?')) return;
    await db.studentGroups.delete(id);
    await db.studentGroupMembers.where('groupId').equals(id).delete();
    setGroups(groups.filter(g => g.id !== id));
  };

  const handleDeleteMember = async (groupId: number, memberId: number) => {
    await db.studentGroupMembers.delete(memberId);
    setGroups(groups.map(g => g.id === groupId ? { ...g, members: g.members.filter((m: any) => m.id !== memberId) } : g));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des eleves et groupes</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowStudentForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
            + Eleve
          </button>
          <button onClick={() => setShowGroupForm(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700">
            + Groupe
          </button>
        </div>
      </div>

      {/* Student form */}
      {showStudentForm && (
        <form onSubmit={handleStudentSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouvel eleve</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prenom</label>
              <input type="text" value={newStudent.firstName} onChange={(e) => setNewStudent({...newStudent, firstName: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input type="text" value={newStudent.lastName} onChange={(e) => setNewStudent({...newStudent, lastName: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anniversaire (optionnel)</label>
              <input type="date" value={newStudent.birthday} onChange={(e) => setNewStudent({...newStudent, birthday: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowStudentForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Ajouter</button>
          </div>
        </form>
      )}

      {/* Group form */}
      {showGroupForm && (
        <form onSubmit={handleGroupSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouveau groupe</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom du groupe</label>
              <input type="text" value={newGroup.name} onChange={(e) => setNewGroup({...newGroup, name: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPrivate" checked={newGroup.isPrivate} onChange={(e) => setNewGroup({...newGroup, isPrivate: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="isPrivate" className="text-sm text-gray-700">Groupe prive (seul le createur ou le delegue peut modifier)</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eleves (choisir dans la liste)</label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {students.filter(s => !newGroup.studentIds.includes(s.id!)).map(student => (
                  <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                    <input type="checkbox" checked={newGroup.studentIds.includes(student.id!)} onChange={(e) => setNewGroup({...newGroup, studentIds: e.target.checked ? [...newGroup.studentIds, student.id!] : newGroup.studentIds.filter((id: number) => id !== student.id)})} className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm">{student.firstName} {student.lastName}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ou noms libres (un par ligne)</label>
              <textarea value={newGroup.memberNames.join('\n')} onChange={(e) => setNewGroup({...newGroup, memberNames: e.target.value.split('\n').map(n => n.trim()).filter(Boolean)})} rows={3} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="Un nom par ligne..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={() => setShowGroupForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
            <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700">Creer</button>
          </div>
        </form>
      )}

      {/* Students list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Eleves ({students.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-500">
                <th className="p-3 font-medium">Prenom</th>
                <th className="p-3 font-medium">Nom</th>
                <th className="p-3 font-medium">Anniversaire</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(student => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="p-3">{student.firstName}</td>
                  <td className="p-3">{student.lastName}</td>
                  <td className="p-3">{student.birthday || '-'}</td>
                  <td className="p-3">
                    <button onClick={() => handleDeleteStudent(student.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Groups list */}
      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{group.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                  <span className={`px-2 py-0.5 text-xs rounded ${group.status === 'valide' ? 'bg-green-100 text-green-700' : group.status === 'en_attente' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {group.status}
                  </span>
                  {group.isPrivate && <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Prive</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {group.members?.length > 0 && (
                  <span className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">{group.members.length} membre(s)</span>
                )}
                <button onClick={() => handleDeleteGroup(group.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Supprimer</button>
              </div>
            </div>
            {group.members?.length > 0 && (
              <div className="p-4 border-t border-gray-100">
                <h4 className="font-medium text-gray-700 mb-2">Membres</h4>
                <div className="flex flex-wrap gap-2">
                  {group.members.map((member: any) => (
                    <div key={member.id} className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg">
                      <span className="font-medium">{member.memberName}</span>
                      {member.studentId && <span className="text-xs text-gray-500">(dans le tableau)</span>}
                      <button onClick={() => handleDeleteMember(group.id, member.id)} className="text-red-500 hover:text-red-700 text-xs ml-2">x</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}