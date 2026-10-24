import type { ImgHTMLAttributes } from 'react';
import { useFileUrl } from '@/lib/fileUrl';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** Clé de cache unique (ex. « chat:<id> »). */
  fileKey: string;
  load: () => Promise<string | null>;
};

/** Image chargée à la demande depuis Firebase. */
export function FbImage({ fileKey, load, className, alt, ...rest }: Props) {
  const { url, failed } = useFileUrl(fileKey, load);
  if (failed) {
    return <div className={`${className || ''} flex items-center justify-center text-xs text-gray-400 bg-gray-100/50 dark:bg-gray-800/40 min-h-[4rem]`}>Image indisponible</div>;
  }
  if (!url) {
    return <div className={`${className || ''} animate-pulse bg-gray-200/60 dark:bg-gray-700/40 min-h-[6rem]`} aria-label="Chargement de l'image" />;
  }
  return <img src={url} alt={alt} className={className} {...rest} />;
}
