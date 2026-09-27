import { useCallback, useEffect, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { api } from '@/lib/api';
import { fileToDataUri, readAsDataUri } from '@/lib/image';
import { getRelativeTime, SUBJECTS, generateFingerprint } from '@/lib/utils';
import type { Sheet } from '@/types';
import { Modal } from '@/components/ui/Modal';

const ALL_SUBJECTS = Object.keys(SUBJECTS);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const PAGE_SIZE = 24;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

export default function Sheets() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sheetSubject, setSheetSubject] = useState('maths');
  const [classLevel, setClassLevel] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<{ dataUri: string; name: string; size: number; kind: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');
  const [pseudo, setPseudo] = useState('');

  const [fingerprint] = useState(() => generateFingerprint());
  const [knownPseudo, setKnownPseudo] = useState('');

  useEffect(() => {
    api
      .getChatConversation(fingerprint)
      .then((data) => setKnownPseudo(data.user?.display_name || ''))
      .catch(() => {});
  }, [fingerprint]);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.getSheets({
          subject,
          q: query || null,
          page: targetPage,
          fingerprint,
        });
        setSheets((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setHasMore(data.has_more);
        setPage(data.page);
      } catch (err: any) {
        setError(err.message || 'Chargement impossible');
      } finally {
        setLoading(false);
      }
    },
    [subject, query, fingerprint]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  // Une fiche partagée par le délégué n'apparaissait qu'après rechargement
  // complet de l'onglet.
  useAutoRefresh(() => load(1, false));

  const pickFile = async (selected: File | undefined) => {
    setFileError('');
    if (!selected) return;

    const isPdf = selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');
    const isImage = selected.type.startsWith('image/');

    if (!isPdf && !isImage) {
      setFileError('Formats acceptés : images (JPG, PNG, WEBP, GIF) ou PDF');
      return;
    }
    if (isPdf && selected.size > MAX_PDF_BYTES) {
      setFileError('PDF trop volumineux (4 Mo maximum)');
      return;
    }
    if (isImage && selected.size > MAX_IMAGE_BYTES) {
      setFileError('Image trop volumineuse (15 Mo maximum)');
      return;
    }

    try {
      const dataUri = isPdf ? await readAsDataUri(selected) : await fileToDataUri(selected);
      setFile({ dataUri, name: selected.name, size: selected.size, kind: isPdf ? 'document' : 'image' });
    } catch {
      setFileError('Fichier illisible');
    }
  };

  const resetForm = () => {
    setTitle('');
    setSheetSubject('maths');
    setClassLevel('');
    setDescription('');
    setFile(null);
    setFileError('');
    setFormError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    if (title.trim().length < 2) {
      setFormError('Donne un titre à ta fiche');
      return;
    }
    if (!file) {
      setFormError('Choisis une image ou un PDF');
      return;
    }
    const authorName = knownPseudo || pseudo.trim();
    if (authorName.length < 2) {
      setFormError('Indique ton pseudo pour signer la fiche');
      return;
    }
    setUploading(true);
    setFormError('');
    try {
      await api.createSheet({
        title: title.trim(),
        subject: sheetSubject,
        class_level: classLevel.trim() || undefined,
        description: description.trim(),
        file: file.dataUri,
        fingerprint,
        author_name: authorName,
      });
      setModalOpen(false);
      resetForm();
      setNotice('✅ Fiche publiée');
      setTimeout(() => setNotice(''), 3500);
      load(1, false);
    } catch (err: any) {
      setFormError(err.message || 'Publication impossible');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (sheet: Sheet) => {
    const ok = window.confirm(`Supprimer la fiche « ${sheet.title} » ?\nLe fichier sera définitivement effacé.`);
    if (!ok) return;
    try {
      await api.deleteSheet(sheet.id, fingerprint);
      setSheets((prev) => prev.filter((s) => s.id !== sheet.id));
      setTotal((t) => Math.max(0, t - 1));
      setNotice('✅ Fiche supprimée');
      setTimeout(() => setNotice(''), 3500);
    } catch (err: any) {
      setError(err.message || 'Suppression impossible');
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Fiches de révision</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {total} fiche{total > 1 ? 's' : ''} partagée{total > 1 ? 's' : ''} par la classe
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} className="glass-button-primary text-sm px-4 py-2">
          ＋ Ajouter une fiche
        </button>
      </div>

      {notice && (
        <div className="glass-card border-green-300/40 text-green-600 dark:text-green-400 text-xs py-2 px-3 mb-3">
          {notice}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher une fiche..."
        className="w-full px-4 py-2.5 rounded-xl glass text-sm mb-3 outline-none focus:ring-2 focus:ring-indigo-500/40"
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setSubject(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            subject === null ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'
          }`}
        >
          Toutes
        </button>
        {ALL_SUBJECTS.map((sub) => (
          <button
            key={sub}
            onClick={() => setSubject(subject === sub ? null : sub)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              subject === sub ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'
            }`}
          >
            {SUBJECTS[sub]}
          </button>
        ))}
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm mb-4">{error}</div>
      )}

      {loading && sheets.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse h-44" />
          ))}
        </div>
      )}

      {!loading && sheets.length === 0 && !error && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">📝</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aucune fiche pour le moment. Sois le premier à en déposer une !
          </p>
        </div>
      )}

      {sheets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheets.map((sheet) => (
            <div key={sheet.id} className="glass-card flex flex-col">
              {sheet.kind === 'image' ? (
                <img
                  src={api.sheetFileUrl(sheet.id, true)}
                  alt={sheet.title}
                  loading="lazy"
                  className="w-full h-36 object-cover rounded-t-xl"
                />
              ) : (
                <div className="w-full h-36 rounded-t-xl bg-gradient-to-br from-indigo-500/15 to-indigo-500/5 flex items-center justify-center text-4xl">
                  📄
                </div>
              )}

              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                    {SUBJECTS[sheet.subject] || sheet.subject}
                    {sheet.class_level ? ` · ${sheet.class_level}` : ''}
                  </span>
                  {sheet.status === 'hidden' && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[10px] font-bold">
                      Masquée
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-sm mt-1.5 break-words">{sheet.title}</h3>
                {sheet.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{sheet.description}</p>
                )}

                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                  {sheet.author_name || 'Anonyme'} · {getRelativeTime(sheet.created_at)}
                  {sheet.file_size > 0 ? ` · ${formatSize(sheet.file_size)}` : ''}
                </p>

                <div className="flex items-center gap-2 mt-3 pt-1">
                  <a
                    href={api.sheetFileUrl(sheet.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-button text-xs px-3 py-1.5"
                  >
                    {sheet.kind === 'image' ? '🔍 Voir' : '⬇️ Télécharger'}
                  </a>
                  {sheet.is_mine && (
                    <button onClick={() => remove(sheet)} className="text-xs text-red-500 hover:underline px-1">
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center mt-5">
          <button onClick={() => load(page + 1, true)} disabled={loading} className="glass-button text-sm px-4 py-2">
            {loading ? 'Chargement...' : 'Charger plus de fiches'}
          </button>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => !uploading && setModalOpen(false)} title="Ajouter une fiche">
        <form onSubmit={submit} className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la fiche"
            maxLength={80}
            className="w-full px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={sheetSubject}
              onChange={(e) => setSheetSubject(e.target.value)}
              className="px-3 py-2.5 rounded-xl glass text-sm outline-none"
            >
              {ALL_SUBJECTS.map((sub) => (
                <option key={sub} value={sub}>
                  {SUBJECTS[sub]}
                </option>
              ))}
            </select>
            <input
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              placeholder="Classe (ex. 9A)"
              maxLength={30}
              className="px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (facultatif)"
            maxLength={500}
            rows={2}
            className="w-full px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
          />

          {!knownPseudo && (
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ton pseudo</label>
              <input
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Le pseudo affiché sur la fiche"
                maxLength={30}
                className="w-full mt-1 px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                Ni nom ni email : ce pseudo sera visible par la classe.
              </p>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Fichier (image ou PDF)</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="mt-1 block w-full text-xs text-gray-500 dark:text-gray-400"
            />
          </label>

          {fileError && <p className="text-xs text-red-500">{fileError}</p>}

          {file && (
            <div className="flex items-center gap-3 glass-card p-2">
              {file.kind === 'image' ? (
                <img src={file.dataUri} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <span className="text-2xl">📄</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{file.name}</p>
                <p className="text-[10px] text-gray-400">{formatSize(file.size)}</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-red-500">
                ✕
              </button>
            </div>
          )}

          {formError && <p className="text-xs text-red-500">{formError}</p>}

          <button type="submit" disabled={uploading} className="glass-button-primary w-full py-2.5 text-sm">
            {uploading ? 'Publication...' : 'Publier la fiche'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
