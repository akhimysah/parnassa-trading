import type { Position } from './types';
import { devisesInstrument } from './challenge';
import { instrument } from './instruments';

export interface AnnonceSurPositions<E> {
  evenement: E;
  positions: Position[];
  /** Minutes avant l'annonce (négatif : publiée il y a moins de 2 min). */
  minutes: number;
}

/** Devises auxquelles une position est sensible (EURUSD → EUR, USD ; SPX500 → USD ; BTC → USD). */
export function devisesPosition(symbole: string): string[] {
  const i = instrument(symbole);
  return devisesInstrument(i?.code ?? symbole.split(':').pop() ?? '', i?.devise);
}

/**
 * Annonces à fort impact des `horizonMin` prochaines minutes qui touchent une devise des positions ouvertes,
 * de la plus proche à la plus lointaine.
 */
export function annoncesSurPositions<E extends { id: string; date: number; importance: number; devise: string; actuel: number | null }>(
  positions: Position[],
  evenements: E[],
  maintenant = Date.now(),
  horizonMin = 60,
): AnnonceSurPositions<E>[] {
  if (positions.length === 0) return [];
  const devises = new Map(positions.map((p) => [p.id, devisesPosition(p.symbole)]));
  return evenements
    .filter((e) => e.importance >= 1 && e.actuel === null && e.date > maintenant - 2 * 60000 && e.date <= maintenant + horizonMin * 60000)
    .map((e) => ({ evenement: e, positions: positions.filter((p) => devises.get(p.id)!.includes(e.devise)), minutes: Math.round((e.date - maintenant) / 60000) }))
    .filter((a) => a.positions.length > 0)
    .sort((a, b) => a.evenement.date - b.evenement.date);
}
