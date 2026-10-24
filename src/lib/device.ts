/**
 * Identité propre à l'appareil (reste en local, jamais partagée comme donnée
 * de classe) : empreinte anonyme et prénom choisi pour le chat.
 */
export function getFingerprint(): string {
  if (typeof window === 'undefined') return crypto.randomUUID();
  let fp = localStorage.getItem('device_fingerprint');
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem('device_fingerprint', fp);
  }
  return fp;
}

const CHAT_NAME_KEY = 'chat_display_name';

export function getLocalDisplayName(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(CHAT_NAME_KEY)) || '';
}

export function setLocalDisplayName(name: string) {
  localStorage.setItem(CHAT_NAME_KEY, name);
}
