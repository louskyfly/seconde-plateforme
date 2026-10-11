/**
 * Validation de fichiers déposés par les élèves.
 * Le type MIME déclaré par le navigateur n'est JAMAIS utilisé comme preuve :
 * on décode la donnée puis on vérifie la signature réelle (magic bytes).
 */

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_SHEET_IMAGE_BYTES = 15 * 1024 * 1024;

export type FileKind = 'image' | 'document';

export interface ValidatedFile {
  mime: string;
  ext: string;
  kind: FileKind;
  buffer: Buffer;
  size: number;
}

interface Signature {
  mime: string;
  ext: string;
  kind: FileKind;
  test: (b: Buffer) => boolean;
}

const DATA_URI_HEADER = /^data:([a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+)?;base64$/i;
const BASE64_CHARS = /^[A-Za-z0-9+/]+={0,2}$/;

const SIGNATURES: Signature[] = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    kind: 'image',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    kind: 'image',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    kind: 'image',
    test: (b) =>
      b.length > 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    kind: 'image',
    test: (b) =>
      b.length > 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: 'application/pdf',
    ext: 'pdf',
    kind: 'document',
    test: (b) =>
      b.length > 5 &&
      b[0] === 0x25 &&
      b[1] === 0x50 &&
      b[2] === 0x44 &&
      b[3] === 0x46 &&
      b[4] === 0x2d,
  },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function validateDataUri(
  input: string,
  allowedKinds: FileKind[] = ['image', 'document']
): { ok: boolean; error?: string; file?: ValidatedFile } {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'Aucun fichier reçu' };
  }

  const maxPayloadChars = Math.ceil((Math.max(MAX_IMAGE_BYTES, MAX_DOCUMENT_BYTES) * 4) / 3) + 1024;
  if (input.length > maxPayloadChars) {
    return {
      ok: false,
      error: `Fichier trop volumineux (max ${formatSize(MAX_IMAGE_BYTES)} pour une image, ${formatSize(MAX_DOCUMENT_BYTES)} pour un PDF)`,
    };
  }

  const commaIndex = input.indexOf(',');
  if (commaIndex === -1) {
    return { ok: false, error: 'Fichier invalide' };
  }

  const header = input.slice(0, commaIndex);
  const payload = input.slice(commaIndex + 1).replace(/\s+/g, '');

  if (!DATA_URI_HEADER.test(header)) {
    return { ok: false, error: 'Format de fichier non autorisé' };
  }
  if (payload.length === 0 || !BASE64_CHARS.test(payload)) {
    return { ok: false, error: 'Fichier corrompu' };
  }

  const estimatedBytes = Math.floor((payload.length * 3) / 4);
  const maxBytes = Math.max(MAX_IMAGE_BYTES, MAX_DOCUMENT_BYTES);
  if (estimatedBytes > maxBytes) {
    return { ok: false, error: `Fichier trop volumineux (max ${formatSize(maxBytes)})` };
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    return { ok: false, error: 'Fichier corrompu' };
  }

  const signature = SIGNATURES.find((s) => s.test(buffer));
  if (!signature) {
    return { ok: false, error: 'Type de fichier non autorisé (images JPG/PNG/WEBP/GIF ou PDF uniquement)' };
  }
  if (!allowedKinds.includes(signature.kind)) {
    return {
      ok: false,
      error:
        signature.kind === 'document'
          ? 'Seules les images sont acceptées ici'
          : 'Les documents PDF ne sont pas acceptés ici',
    };
  }

  const limit = signature.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (buffer.length > limit) {
    return {
      ok: false,
      error: `Fichier trop volumineux (max ${formatSize(limit)} pour un ${signature.kind === 'image' ? 'image' : 'PDF'})`,
    };
  }

  return {
    ok: true,
    file: { mime: signature.mime, ext: signature.ext, kind: signature.kind, buffer, size: buffer.length },
  };
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function cleanFirstName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

export function isValidFirstName(value: string): boolean {
  return /^[\p{L}\s'-]{2,30}$/u.test(value);
}

export function safeFileName(title: string, ext: string): string {
  const base = (title || 'fichier')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `${base || 'fichier'}.${ext}`;
}

export function toDataUri(file: ValidatedFile): string {
  return `data:${file.mime};base64,${file.buffer.toString('base64')}`;
}