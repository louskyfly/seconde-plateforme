import { useState, useEffect } from 'react';
import { db, getFingerprint } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

export default function Sheets() {
  const fingerprint = useFingerprint();
  const [sheets, setSheets] = useState<any[]>([]);
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

  useEffect(() => {
    loadSheets();
  }, []);

  const loadSheets = async () => {
    const sheets = await db.sheets.orderBy('createdAt').reverse().toArray();
    setSheets(sheets);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setNewSheet({ 
          ...newSheet, 
          fileData: e.target?.result as string, 
          fileName: file.name, 
          mimeType: file.type, 
          fileSize: file.size 
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await db.sheets.add({
      ...newSheet,
      authorName: newSheet.authorName || 'Anonyme',
      authorFingerprint: getFingerprint(),
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const newS = await db.sheets.get(result);
    setSheets([newS, ...sheets]);
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

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette fiche ?')) return;
    await db.sheets.delete(id);
    setSheets(sheets.filter(s => s.id !== id));
  };

  const handleStatusToggle = async (id: number, status: 'active' | 'hidden') => {
    await db.sheets.update(id, { status, updatedAt: Date.now() });
    setSheets(sheets.map(s => s.id === id ? { ...s, status } : s));
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Fichier (image ou PDF, max 12 Mo)</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(e as any)} className="w-full p-3 border border-gray-300 rounded-lg" />
              {newSheet.fileData && <p className="text-sm text-green-600 mt-1">Fichier selectionne : {newSheet.fileName}</p>}
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Publier</button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sheets.map((sheet) => (
          <div key={sheet.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {sheet.fileData && sheet.kind === 'image' && (
              <img src={sheet.fileData} alt={sheet.title} className="w-full h-48 object-cover" />
            )}
            {sheet.fileData && sheet.kind === 'document' && (
              <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-500">
                <span>📄 {sheet.fileName}</span>
              </div>
            )}
            {!sheet.fileData && (
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