import type { Operation, Portefeuille } from './types';
import { dateDuJour } from './challenge';

const JOUR = 24 * 3600 * 1000;
const net = (o: Operation) => (o.type === 'cloture' ? (o.resultat ?? 0) : 0) - o.frais;

/** Lundi 0 h (heure locale) de la semaine qui contient cet instant. */
export function debutSemaine(ms = Date.now()): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Identifiant de semaine (date de son lundi), pour ne montrer la revue qu'une fois. */
export function cleSemaine(ms = Date.now()): string {
  return dateDuJour(debutSemaine(ms));
}

export interface RevueSemaine {
  debut: number;
  fin: number;
  net: number;
  trades: number;
  gagnants: number;
  /** Résultat de chaque jour, du lundi au dimanche. */
  jours: number[];
  /** Résultat de la semaine d'avant (null si rien n'y a été tradé). */
  precedente: number | null;
  meilleur: Operation | null;
  pire: Operation | null;
  /** Résultat par instrument, du meilleur au pire. */
  instruments: { symbole: string; net: number; trades: number }[];
  /** Jours tradés et, parmi eux, ceux qui avaient un plan écrit. */
  joursTrades: number;
  joursAvecPlan: number;
  operations: Operation[];
}

/** Revue de la semaine calendaire précédente (lundi → dimanche), ou null si aucun trade n'y a été clôturé. */
export function revueSemaine(p: Portefeuille, maintenant = Date.now()): RevueSemaine | null {
  const fin = debutSemaine(maintenant);
  // Lundi précédent : 7 jours avant, recalé au lundi (changement d'heure compris).
  const debut = debutSemaine(fin - 3 * JOUR);
  const avant = debutSemaine(debut - 3 * JOUR);
  const operations = p.operations.filter((o) => o.date >= debut && o.date < fin);
  const clotures = operations.filter((o) => o.type === 'cloture' && o.resultat !== undefined);
  if (clotures.length === 0) return null;

  const jours = Array.from({ length: 7 }, () => 0);
  for (const o of operations) jours[(new Date(o.date).getDay() + 6) % 7]! += net(o);
  const parSymbole = new Map<string, { net: number; trades: number }>();
  for (const o of operations) {
    const e = parSymbole.get(o.symbole) ?? { net: 0, trades: 0 };
    e.net += net(o);
    if (o.type === 'cloture') e.trades += 1;
    parSymbole.set(o.symbole, e);
  }
  const tri = [...clotures].sort((a, b) => net(b) - net(a));
  const precedentes = p.operations.filter((o) => o.date >= avant && o.date < debut);
  const datesTradees = new Set(clotures.map((o) => dateDuJour(o.date)));
  const plans = new Set((p.plans ?? []).map((x) => x.date));

  return {
    debut,
    fin,
    net: operations.reduce((s, o) => s + net(o), 0),
    trades: clotures.length,
    gagnants: clotures.filter((o) => net(o) > 0).length,
    jours,
    precedente: precedentes.some((o) => o.type === 'cloture') ? precedentes.reduce((s, o) => s + net(o), 0) : null,
    meilleur: tri[0] ?? null,
    pire: tri.length > 1 ? tri[tri.length - 1]! : null,
    instruments: [...parSymbole.entries()].map(([symbole, e]) => ({ symbole, ...e })).filter((e) => e.trades > 0).sort((a, b) => b.net - a.net),
    joursTrades: datesTradees.size,
    joursAvecPlan: [...datesTradees].filter((d) => plans.has(d)).length,
    operations,
  };
}
