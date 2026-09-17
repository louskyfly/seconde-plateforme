export const VAPID_CONFIG = {
  subject: 'mailto:admin@seconde-plateforme.local',
  publicKey:
    process.env.VAPID_PUBLIC_KEY ||
    'BObArglH_qVCFXb74n6pSTeRCi12O1AtX75sj-CTRm4NVdXFV56ag8PmFzILvbQ4VWMFkOOJMj3BAeP7RQieKGU',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'tbzB4SJUX9OFkau8CMqEZQ8ImdVijh1-XEbZ5Z1jLjc',
};