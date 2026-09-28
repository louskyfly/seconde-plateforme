import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import type { Sheet } from '@/types';

interface SheetViewerProps {
  sheet: Sheet | null;
  onClose: () => void;
}

/**
 * Aperçu d'une fiche sans quitter l'application.
 *
 * Le bouton « Voir » ouvrait jusqu'ici le fichier dans un nouvel onglet : le
 * serveur répondait en `attachment`, donc sur téléphone l'onglet restait blanc.
 * Les images sont désormais servies en `inline` et les PDF sont intégrés via un
 * <iframe>, ce qui laisse l'utilisateur revenir à la liste même en cas d'échec.
 */
export function SheetViewer({ sheet, onClose }: SheetViewerProps) {
  const [broken, setBroken] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Changer de fiche remet le zoom et l'état d'erreur : sans cela, une fiche
  // qui avait échoué restait « cassée » pour toutes les suivantes.
  useEffect(() => {
    setBroken(false);
    setZoom(1);
  }, [sheet?.id]);

  if (!sheet) return null;

  const fileUrl = api.sheetFileUrl(sheet.id, true);
  const isImage = sheet.kind === 'image';
  const isPdf = sheet.mime_type === 'application/pdf';

  return (
    <Modal isOpen onClose={onClose} title={sheet.title} maxWidth="max-w-3xl">
      {sheet.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 whitespace-pre-line">{sheet.description}</p>
      )}

      {broken ? (
        <div className="rounded-xl border border-amber-300/50 bg-amber-500/10 px-4 py-6 text-center">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            L’aperçu n’a pas pu s’afficher sur cet appareil.
          </p>
          <a href={fileUrl} download className="glass-button text-xs px-4 py-2 inline-block">
            Télécharger le fichier
          </a>
        </div>
      ) : isImage ? (
        <>
          <div
            className="rounded-xl overflow-auto overscroll-contain bg-gray-100 dark:bg-gray-800/60"
            style={{ maxHeight: '70dvh' }}
          >
            <img
              src={fileUrl}
              alt={sheet.title}
              onError={() => setBroken(true)}
              onLoad={() => setBroken(false)}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              className="w-full h-auto transition-transform"
            />
          </div>
          <div className="flex items-center justify-between gap-2 mt-3">
            <button
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
              disabled={zoom <= 1}
              className="glass-button text-xs px-3 py-1.5 disabled:opacity-40"
            >
              −
            </button>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{Math.round(zoom * 100)} %</span>
            <button
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(1))))}
              disabled={zoom >= 3}
              className="glass-button text-xs px-3 py-1.5 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </>
      ) : isPdf ? (
        <iframe
          src={fileUrl}
          title={sheet.title}
          onError={() => setBroken(true)}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white"
          style={{ height: '70dvh' }}
        />
      ) : (
        <div className="rounded-xl bg-gray-100 dark:bg-gray-800/60 py-10 text-center">
          <p className="text-3xl mb-2">📄</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Ce format ne peut pas être prévisualisé ici.
          </p>
          <a href={fileUrl} download className="glass-button text-xs px-4 py-2 inline-block">
            Télécharger le fichier
          </a>
        </div>
      )}
    </Modal>
  );
}

/**
 * Bouton d'ouverture d'une fiche : affiche l'aperçu dans l'application, avec un
 * repli vers le téléchargement si le format n'est pas prévisualisable.
 */
export function SheetViewButton({ sheet, className = '' }: { sheet: Sheet; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {sheet.kind === 'image' ? '🔍 Voir' : '👁️ Aperçu'}
      </button>
      {/* Modal se portals déjà sur <body>. */}
      {open && <SheetViewer sheet={sheet} onClose={() => setOpen(false)} />}
    </>
  );
}
