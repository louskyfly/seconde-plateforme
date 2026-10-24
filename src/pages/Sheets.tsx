import { useState, useMemo } from 'react';
import { ref, set as firebaseSet, remove as firebaseRemove, get } from 'firebase/database';
import { getFingerprint } from '../lib/device';
import { useFingerprint } from '../hooks/useFingerprint';
import { useFirebaseSync, useFirebaseValue } from '../hooks/useFirebaseSync';
import { db as fdb, FB } from '../lib/firebase';
import { compressImage, readAsDataUri } from '../lib/image';

/** Taille max d'un document (PDF...) stocke en base64 dans Firebase. */
const MAX_DOC_BYTES = 4 * 1024 * 1024;

/**
 * Les fichiers sont stockes a part (sheetFiles/{id}) pour que la liste des
 * fiches reste legere ; chaque vignette charge seulement son image.
 */
function SheetImage({ sheet }: { sheet: any }) {
  const inline = sheet.fileData as string | undefined;
  const { value } = useFirebaseValue<{ data: string }>(`${FB.sheetFiles}/${sheet.id}`, !inline && !!sheet.hasFile);
  const src = inline || value?.data;
  if (!src) {
    return (
      <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">
        <span>Chargement...</span>
      </div>
    );
  }
  return <img src={src} alt={sheet.title} className="w-full h-48 object-cover" />;
}

async function openSheetFile(sheet: any) {
  let data: string | undefined = sheet.fileData;
  if (!data) {
    const snap = await get(ref(fdb, `${FB.sheetFiles}/${sheet.id}`));
    data = snap.val()?.data;
  }
  if (!data) return alert('Fichier introuvable');
  const blob = await (await fetch(data)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.download = sheet.fileName || 'fiche';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function Sheets() {
  const fingerprint = useFingerprint();
  const { items, create, update, remove } = useFirebaseSync<any>(FB.sheets);
  const sheets = useMemo(() => [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [items]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newSheet, setNewSheet] = useState({ 
    title: '', 
    subject: 'autre', 
    classLevel: '', 
    description: '', 
    fileData: null as string | null,
    fileName: null as string | null,
    mimeType: null as string | null,
    fileSize: 0,
    kind: 'image' as 'image' | 'document',
    authorName: ''
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    if (!isImage && file.size > MAX_DOC_BYTES) {
      alert('Document trop volumineux (max 4 Mo)');
      e.target.value = '';
      return;
    }
    try {
      // Les images sont compressees (max 1600 px) pour rester legeres dans Firebase.
      const data = isImage ? await compressImage(file, 1600, 0.8) : await readAsDataUri(file);
      if (data.length > 6_000_000) {
        alert('Fichier trop volumineux');
        e.target.value = '';
        return;
      }
      setNewSheet((prev) => ({
        ...prev,
        fileData: data,
        fileName: file.name,
        mimeType: isImage ? data.slice(5, data.indexOf(';')) : file.type,
        fileSize: Math.round((data.length * 3) / 4),
        kind: isImage ? 'image' : 'document',
      }));
    } catch {
      alert('Impossible de lire le fichier');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const { fileData, ...meta } = newSheet;
      const id = await create({
        ...meta,
        hasFile: !!fileData,
        authorName: newSheet.authorName || 'Anonyme',
        authorFingerprint: getFingerprint(),
        status: 'active',
      });
      if (fileData) {
        await firebaseSet(ref(fdb, `${FB.sheetFiles}/${id}`), { data: fileData, mimeType: newSheet.mimeType || '' });
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la publication (fichier trop lourd ou pas de connexion).');
      return;
    } finally {
      setSaving(false);
    }
    setNewSheet({ 
      title: '', 
      subject: 'autre', 
      classLevel: '', 
      description: '', 
      fileData: null, 
      fileName: null, 
      mimeType: null, 
      fileSize: 0,
      kind: 'image',
      authorName: ''
    });
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette fiche ?')) return;
    await remove(id);
    await firebaseRemove(ref(fdb, `${FB.sheetFiles}/${id}`));
  };

  const handleStatusToggle = async (id: string, status: 'active' | 'hidden') => {
    await update(id, { status });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fiches de revision</h1>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
          + Nouvelle fiche
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouvelle fiche</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                <input type="text" value={newSheet.title} onChange={(e) => setNewSheet({...newSheet, title: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Matiere</label>
                <select value={newSheet.subject} onChange={(e) => setNewSheet({...newSheet, subject: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg">
                  <option value="maths">Mathematiques</option>
                  <option value="francais">Francais</option>
                  <option value="anglais">Anglais</option>
                  <option value="histoire">Histoire</option>
                  <option value="geo">Geographie</option>
                  <option value="svt">SVT</option>
                  <option value="physique">Physique-Chimie</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
                <input type="text" value={newSheet.classLevel} onChange={(e) => setNewSheet({...newSheet, classLevel: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="ex: Seconde 9" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={newSheet.kind} onChange={(e) => setNewSheet({...newSheet, kind: e.target.value as 'image' | 'document'})} className="w-full p-3 border border-gray-300 rounded-lg">
                  <option value="image">Image (photo, scan)</option>
                  <option value="document">Document (PDF, doc)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={newSheet.description} onChange={(e) => setNewSheet({...newSheet, description: e.target.value})} rows={3} className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auteur</label>
              <input type="text" value={newSheet.authorName} onChange={(e) => setNewSheet({...newSheet, authorName: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="Votre nom" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fichier (image ou PDF, max 4 Mo pour un PDF)</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(e as any)} className="w-full p-3 border border-gray-300 rounded-lg" />
              {newSheet.fileData && <p className="text-sm text-green-600 mt-1">Fichier selectionne : {newSheet.fileName}</p>}
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? 'Publication...' : 'Publier'}</button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sheets.map((sheet) => (
          <div key={sheet.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {(sheet.hasFile || sheet.fileData) && sheet.kind === 'image' && (
              <button type="button" onClick={() => openSheetFile(sheet)} className="block w-full">
                <SheetImage sheet={sheet} />
              </button>
            )}
            {(sheet.hasFile || sheet.fileData) && sheet.kind === 'document' && (
              <button type="button" onClick={() => openSheetFile(sheet)} className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <span>📄 {sheet.fileName}</span>
              </button>
            )}
            {!(sheet.hasFile || sheet.fileData) && (
              <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">
                <span>Pas de fichier</span>
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 line-clamp-1">{sheet.title}</h3>
                <span className={`px-2 py-0.5 text-xs rounded ${sheet.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {sheet.status}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{sheet.description}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{sheet.subject}</span>
                <span>{sheet.classLevel}</span>
                <span>{sheet.kind === 'image' ? 'Image' : 'Document'}</span>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                <button onClick={() => handleStatusToggle(sheet.id, sheet.status === 'active' ? 'hidden' : 'active')}
                  className={`px-3 py-1 text-xs rounded ${sheet.status === 'active' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'}`}
                >
                  {sheet.status === 'active' ? 'Masquer' : 'Afficher'}
                </button>
                <button onClick={() => handleDelete(sheet.id)} className="px-3 py-1 text-xs text-red-600 hover:text-red-800 border border-red-200 rounded">
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}