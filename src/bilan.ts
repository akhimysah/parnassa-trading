import type { Operation } from './types';

export interface BilanJour {
  date: Date;
  operations: Operation[];
  net: number;
  trades: number;
  gagnants: number;
  meilleur: Operation | null;
  pire: Operation | null;
  /** Résultat de la séance précédente (dernier jour tradé avant celui-ci), s'il y en a une. */
  precedent: number | null;
  /** Jours gagnants consécutifs jusqu'à ce jour inclus. */
  serieGagnante: number;
}

const cle = (ms: number) => new Date(ms).toDateString();
const net = (o: Operation) => (o.resultat ?? 0) - o.frais;

/** Bilan du dernier jour tradé avant aujourd'hui (la « veille » de trading), ou null. */
export function bilanVeille(operations: Operation[], maintenant = Date.now()): BilanJour | null {
  const aujourdhui = cle(maintenant);
  const parJour = new Map<string, Operation[]>();
  for (const o of operations) {
    const k = cle(o.date);
    if (k === aujourdhui) continue;
    parJour.set(k, [...(parJour.get(k) ?? []), o]);
  }
  const jours = [...parJour.entries()]
    .map(([k, ops]) => ({ k, date: new Date(k), ops, clotures: ops.filter((o) => o.type === 'cloture') }))
    .filter((j) => j.clotures.length > 0)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const dernier = jours[0];
  if (!dernier) return null;
  const totalJour = (j: (typeof jours)[number]) => j.ops.reduce((s, o) => s + (o.type === 'cloture' ? net(o) : -o.frais), 0);
  let serie = 0;
  for (const j of jours) {
    if (totalJour(j) > 0) serie += 1;
    else break;
  }
  const tri = [...dernier.clotures].sort((a, b) => net(b) - net(a));
  return {
    date: dernier.date,
    operations: dernier.ops,
    net: totalJour(dernier),
    trades: dernier.clotures.length,
    gagnants: dernier.clotures.filter((o) => net(o) > 0).length,
    meilleur: tri[0] ?? null,
    pire: tri.length > 1 ? tri[tri.length - 1]! : null,
    precedent: jours[1] ? totalJour(jours[1]) : null,
    serieGagnante: serie,
  };
}
