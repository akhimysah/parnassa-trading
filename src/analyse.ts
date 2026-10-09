import type { Operation, Portefeuille } from './types';

export interface PointCourbe {
  n: number;
  date: number;
  cumul: number;
}

export interface Groupe {
  nb: number;
  gagnants: number;
  net: number;
}

export interface Analyse {
  /** Résultat net moyen par trade (frais de clôture déduits). */
  esperance: number;
  /** Gain moyen ÷ perte moyenne. */
  ratioGainPerte: number | null;
  /** Courbe du résultat réalisé cumulé, trade après trade. */
  courbe: PointCourbe[];
  /** Plus forte baisse depuis un sommet de la courbe réalisée. */
  drawdown: { montant: number; pct: number | null; debut: number; fin: number } | null;
  series: { gainsMax: number; pertesMax: number; courante: { sens: 'gain' | 'perte'; nb: number } | null };
  /** Positions acheteuses (long) et vendeuses (short). */
  parSens: { long: Groupe; short: Groupe };
  /** Lundi = 0 … dimanche = 6. */
  parJour: Groupe[];
  parHeure: Groupe[];
}

const vide = (): Groupe => ({ nb: 0, gagnants: 0, net: 0 });

/** Indicateurs avancés des trades clôturés : courbe réalisée, drawdown, séries, achats/ventes, jours et heures. */
export function analyser(p: Portefeuille): Analyse {
  const clotures: Operation[] = p.operations.filter((o) => o.type === 'cloture' && o.resultat !== undefined).sort((a, b) => a.date - b.date);
  const nets = clotures.map((o) => (o.resultat ?? 0) - o.frais);

  let cumul = 0;
  const courbe: PointCourbe[] = clotures.map((o, i) => {
    cumul += nets[i]!;
    return { n: i + 1, date: o.date, cumul };
  });

  // Drawdown : plus grand écart entre un sommet (0 compris) et un creux qui le suit.
  let sommet = 0;
  let iSommet = 0;
  let pire: Analyse['drawdown'] = null;
  courbe.forEach((pt, i) => {
    if (pt.cumul > sommet) {
      sommet = pt.cumul;
      iSommet = i + 1;
    }
    const baisse = sommet - pt.cumul;
    if (baisse > 0 && (!pire || baisse > pire.montant)) {
      const base = p.capitalInitial + sommet;
      pire = { montant: baisse, pct: base > 0 ? (baisse / base) * 100 : null, debut: iSommet, fin: i + 1 };
    }
  });

  let gainsMax = 0;
  let pertesMax = 0;
  let suite = 0;
  let sensSuite: 'gain' | 'perte' | null = null;
  for (const n of nets) {
    const s = n > 0 ? 'gain' : 'perte';
    suite = s === sensSuite ? suite + 1 : 1;
    sensSuite = s;
    if (s === 'gain') gainsMax = Math.max(gainsMax, suite);
    else pertesMax = Math.max(pertesMax, suite);
  }

  const gains = nets.filter((n) => n > 0);
  const pertes = nets.filter((n) => n <= 0);
  const gainMoyen = gains.length ? gains.reduce((s, n) => s + n, 0) / gains.length : 0;
  const perteMoyenne = pertes.length ? Math.abs(pertes.reduce((s, n) => s + n, 0)) / pertes.length : 0;

  const parSens = { long: vide(), short: vide() };
  const parJour = Array.from({ length: 7 }, vide);
  const parHeure = Array.from({ length: 24 }, vide);
  clotures.forEach((o, i) => {
    const net = nets[i]!;
    // Une clôture a le sens inverse de la position : clôturer un achat est une vente.
    const g = o.sens === 'vente' ? parSens.long : parSens.short;
    const d = new Date(o.date);
    for (const groupe of [g, parJour[(d.getDay() + 6) % 7]!, parHeure[d.getHours()]!]) {
      groupe.nb += 1;
      groupe.net += net;
      if (net > 0) groupe.gagnants += 1;
    }
  });

  return {
    esperance: nets.length ? nets.reduce((s, n) => s + n, 0) / nets.length : 0,
    ratioGainPerte: perteMoyenne > 0 ? gainMoyen / perteMoyenne : null,
    courbe,
    drawdown: pire,
    series: { gainsMax, pertesMax, courante: sensSuite ? { sens: sensSuite, nb: suite } : null },
    parSens,
    parJour,
    parHeure,
  };
}
