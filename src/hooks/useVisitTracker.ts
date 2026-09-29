import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';

/**
 * Enregistre une visite à chaque changement de page.
 *
 * Le compteur d'élèves est basé sur l'empreinte appareil, donc recharger ou
 * naviguer ne crée jamais de doublon : seule la page courante et l'heure de
 * dernière visite sont mises à jour. L'appel est volontairement silencieux :
 * une statistique manquée ne doit jamais gêner l'élève.
 */
export function useVisitTracker(): void {
  const location = useLocation();

  useEffect(() => {
    const fingerprint = generateFingerprint();
    api.recordVisit(fingerprint, location.pathname).catch(() => {
      // Ignoré : la visite est un indicateur, pas une donnée critique.
    });
  }, [location.pathname]);
}
