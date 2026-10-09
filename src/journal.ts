import type { Operation } from './types';

/** Étiquettes proposées : setups, puis état d'esprit. */
export const ETIQUETTES_SETUP = ['Cassure', 'Rebond', 'Tendance', 'Range', 'News', 'Scalp', 'Swing'];
export const ETIQUETTES_MENTAL = ['Plan respecté', 'Hors plan', 'FOMO', 'Revenge', 'Patience'];

export interface StatEtiquette {
  etiquette: string;
  nb: number;
  gagnants: number;
  net: number;
  esperance: number;
}

/** Performance de chaque étiquette sur les trades clôturés (résultat net de frais de clôture). */
export function statsParEtiquette(operations: Operation[]): StatEtiquette[] {
  const m = new Map<string, { nb: number; gagnants: number; net: number }>();
  for (const o of operations) {
    if (o.type !== 'cloture' || !o.etiquettes?.length) continue;
    const net = (o.resultat ?? 0) - o.frais;
    for (const e of o.etiquettes) {
      const s = m.get(e) ?? { nb: 0, gagnants: 0, net: 0 };
      s.nb += 1;
      s.net += net;
      if (net > 0) s.gagnants += 1;
      m.set(e, s);
    }
  }
  return [...m.entries()].map(([etiquette, s]) => ({ etiquette, ...s, esperance: s.net / s.nb })).sort((a, b) => b.net - a.net);
}
