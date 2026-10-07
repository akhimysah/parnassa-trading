import { useEffect, useRef } from 'react';
import type { Etat, Rappel } from './types';
import { drapeau, useCalendrier, valeurCalendrier, type EvenementCalendrier } from './actualites';
import { notifier, sonner } from './alertes';

const CLE_ENVOYES = 'parnassa-trading:rappels-envoyes:v1';

function lireEnvoyes(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLE_ENVOYES) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function sauverEnvoyes(s: Set<string>) {
  try {
    // On ne garde que les 300 derniers identifiants.
    localStorage.setItem(CLE_ENVOYES, JSON.stringify([...s].slice(-300)));
  } catch {
    // stockage indisponible
  }
}

export function rappelDepuis(e: EvenementCalendrier): Rappel {
  return { id: e.id, titre: e.titre, titreFr: e.titreFr, pays: e.pays, date: e.date };
}

/**
 * Moteur de rappels, actif sur toutes les pages : notification `delaiMinutes` avant chaque événement
 * suivi (et, en option, avant toutes les annonces à fort impact), puis à la publication du chiffre réel.
 */
export function useMoteurRappels(etat: Etat, maj: (p: Partial<Etat>) => void, signaler: (m: string) => void) {
  const { delaiMinutes, fortImpactAuto } = etat.parametres.rappels;
  const actif = etat.rappels.length > 0 || fortImpactAuto;
  const { evenements } = useCalendrier(actif);
  const refEtat = useRef({ etat, evenements, signaler, maj });
  refEtat.current = { etat, evenements, signaler, maj };

  useEffect(() => {
    if (!actif) return;
    const verifier = () => {
      const { etat: e, evenements: evs, signaler: sig, maj: m } = refEtat.current;
      const envoyes = lireEnvoyes();
      const suivis = new Set(e.rappels.map((r) => r.id));
      const fr = e.parametres.langueActualites !== 'en';
      const maintenant = Date.now();
      let nouveaux = false;
      for (const ev of evs) {
        const concerne = suivis.has(ev.id) || (e.parametres.rappels.fortImpactAuto && ev.importance >= 1);
        if (!concerne) continue;
        const titre = `${drapeau(ev.pays)} ${fr ? (ev.titreFr ?? ev.titre) : ev.titre}`;
        const avant = `${ev.id}:avant`;
        const delai = ev.date - maintenant;
        if (delai > 0 && delai <= e.parametres.rappels.delaiMinutes * 60000 && !envoyes.has(avant)) {
          envoyes.add(avant);
          nouveaux = true;
          const minutes = Math.max(1, Math.round(delai / 60000));
          const corps = `Dans ${minutes} min · prévision ${valeurCalendrier(ev.prevision, ev.unite, ev.echelle)} · précédent ${valeurCalendrier(ev.precedent, ev.unite, ev.echelle)}`;
          sig(`⏰ ${titre} — ${corps}`);
          notifier(`Bientôt : ${titre}`, corps);
          if (e.parametres.son) sonner();
        }
        const publie = `${ev.id}:publie`;
        if (ev.actuel !== null && ev.date <= maintenant && maintenant - ev.date < 3 * 3600000 && !envoyes.has(publie) && (suivis.has(ev.id) || ev.importance >= 1)) {
          envoyes.add(publie);
          nouveaux = true;
          const ecart = ev.prevision !== null ? Math.sign(ev.actuel - ev.prevision) : 0;
          const corps = `Réel ${valeurCalendrier(ev.actuel, ev.unite, ev.echelle)}${ecart > 0 ? ' ▲' : ecart < 0 ? ' ▼' : ''} · prévision ${valeurCalendrier(ev.prevision, ev.unite, ev.echelle)} · précédent ${valeurCalendrier(ev.precedent, ev.unite, ev.echelle)}`;
          sig(`📊 ${titre} — ${corps}`);
          notifier(`Publié : ${titre}`, corps);
          if (e.parametres.son) sonner();
        }
      }
      if (nouveaux) sauverEnvoyes(envoyes);
      // Les rappels de plus de 6 heures sont retirés de la liste.
      const restants = e.rappels.filter((r) => r.date > maintenant - 6 * 3600000);
      if (restants.length !== e.rappels.length) m({ rappels: restants });
    };
    verifier();
    const t = window.setInterval(verifier, 15000);
    return () => window.clearInterval(t);
  }, [actif, evenements, delaiMinutes]);
}
