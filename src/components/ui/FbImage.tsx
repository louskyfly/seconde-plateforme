import { useEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { useFileUrl } from '@/lib/fileUrl';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** Clé de cache unique (ex. « chat:<id> »). */
  fileKey: string;
  load: () => Promise<string | null>;
};

/**
 * Image chargée à la demande depuis Firebase.
 *
 * Le chargement ne démarre que lorsque l'image approche de l'écran : sans cela,
 * une page de 24 fiches téléchargeait 24 fichiers complets d'un coup (jusqu'à
 * plusieurs dizaines de Mo sur iPad).
 */
export function FbImage({ fileKey, load, className, alt, ...rest }: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = holder.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const { url, failed } = useFileUrl(fileKey, load, visible);

  if (failed) {
    return (
      <div className={`${className || ''} flex items-center justify-center text-xs text-gray-400 bg-gray-100/50 dark:bg-gray-800/40 min-h-[4rem]`}>
        Image indisponible
      </div>
    );
  }
  if (!url) {
    return (
      <div
        ref={holder}
        className={`${className || ''} animate-pulse bg-gray-200/60 dark:bg-gray-700/40 min-h-[6rem]`}
        aria-label="Chargement de l'image"
      />
    );
  }
  return <img src={url} alt={alt} className={className} {...rest} />;
}
