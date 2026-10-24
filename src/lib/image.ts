export function fileToDataUri(
  file: File,
  maxSize = 900,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      if (!raw.startsWith('data:image') || raw.startsWith('data:image/gif') || raw.startsWith('data:image/svg')) {
        resolve(raw);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(raw);
            return;
          }
          // Fond blanc : une image transparente convertie en JPEG resterait lisible.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          // Safari (iPad) ne sait pas toujours encoder le WebP : il renvoie
          // alors un PNG énorme. On retombe sur le JPEG dans ce cas.
          let out = canvas.toDataURL('image/webp', quality);
          if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', quality);
          resolve(out.length < raw.length ? out : raw);
        } catch {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsDataURL(file);
  });
}

/**
 * Lit un fichier tel quel en data URI (PDF, documents).
 * Le contrôle réel du type est refait côté serveur via les magic bytes.
 */
export function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsDataURL(file);
  });
}