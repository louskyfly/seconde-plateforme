import { useEffect, useState } from 'react';

/**
 * Les images du chat et les fichiers des fiches sont stockés dans Firebase en
 * data URL (base64), dans des chemins séparés pour ne pas alourdir les listes.
 * On les charge à la demande et on les convertit en URL « blob: », que Safari
 * (iPad) sait afficher, ouvrir dans un nouvel onglet et télécharger.
 */
const cache = new Map<string, Promise<string | null>>();
/** Borne le cache : un long chat ne doit pas retenir indéfiniment les images. */
const MAX_CACHE = 40;

export function dataUrlToObjectUrl(dataUrl: string): string {
  try {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(5, comma); // ex. "image/webp;base64"
    const mime = header.split(';')[0] || 'application/octet-stream';
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return dataUrl;
  }
}

export function loadFileUrl(key: string, loader: () => Promise<string | null>): Promise<string | null> {
  let p = cache.get(key);
  if (!p) {
    p = loader()
      .then((data) => (data ? dataUrlToObjectUrl(data) : null))
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, p);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
  return p;
}

/** URL affichable d'un fichier stocké dans Firebase (null tant qu'il charge). */
export function useFileUrl(key: string | null, loader: () => Promise<string | null>, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    if (!key || !enabled) return;
    loadFileUrl(key, loader).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return { url, failed };
}
