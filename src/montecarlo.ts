import type { Portefeuille } from './types';

/** Générateur pseudo-aléatoire reproductible (mulberry32) : mêmes simulations pour une même graine. */
export function generateur(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rendement de chaque trade clôturé, en fraction des fonds réalisés juste avant lui
 * (résultat net, frais de clôture déduits) : c'est ce qu'on rejoue dans les simulations.
 */
export function rendementsTrades(p: Portefeuille): number[] {
  const clotures = p.operations.filter((o) => o.type === 'cloture' && o.resultat !== undefined).sort((a, b) => a.date - b.date);
  let base = p.capitalInitial + (p.archive ? p.archive.resultat - p.archive.frais : 0);
  const r: number[] = [];
  for (const o of clotures) {
    const net = (o.resultat ?? 0) - o.frais;
    if (base > 0) r.push(net / base);
    base += net;
  }
  return r;
}

export interface OptionsMonteCarlo {
  simulations?: number;
  /** Nombre de trades rejoués par simulation. */
  trades: number;
  /** Gain visé en % (atteint avant la perte max = réussite). */
  objectifPct?: number;
  /** Perte en % du départ qui arrête la simulation (ruine). */
  perteMaxPct: number;
  /** Perte max suiveuse (prop firm) : le plancher monte avec le plus haut, sans dépasser le départ. */
  suiveuse?: boolean;
  /** Perte du jour (en % du départ) qui arrête aussi la simulation, avec `tradesParJour` trades par jour. */
  perteJourPct?: number;
  tradesParJour?: number;
  graine?: number;
}

export interface BandeMonteCarlo {
  n: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface ResultatMonteCarlo {
  simulations: number;
  trades: number;
  /** Probabilité d'atteindre l'objectif avant la perte max (null sans objectif). */
  probaObjectif: number | null;
  /** Probabilité de toucher la perte max. */
  probaRuine: number;
  /** Fonds finaux en multiple du départ (1 = inchangé) : 5e, 50e et 95e centiles. */
  final: { p5: number; p50: number; p95: number };
  /** Drawdown maximal (en % depuis un sommet) : médiane et 95e centile. */
  drawdown: { p50: number; p95: number };
  /** Éventail des trajectoires, trade après trade (multiple du départ). */
  bandes: BandeMonteCarlo[];
}

function centile(trie: Float64Array | number[], q: number): number {
  if (trie.length === 0) return 0;
  const i = Math.min(trie.length - 1, Math.max(0, Math.round(q * (trie.length - 1))));
  return trie[i]!;
}

/**
 * Simulations de Monte-Carlo : chaque trajectoire tire au hasard (avec remise) parmi les rendements réels
 * et les compose. Une trajectoire s'arrête à la perte max (elle y reste figée) ; l'objectif est compté
 * s'il est touché avant. Retourne probabilités, centiles et l'éventail des trajectoires.
 */
export function monteCarlo(rendements: number[], o: OptionsMonteCarlo): ResultatMonteCarlo {
  const simulations = o.simulations ?? 1000;
  const aleatoire = generateur(o.graine ?? 42);
  const perteMax = o.perteMaxPct / 100;
  const perteJour = o.perteJourPct !== undefined ? o.perteJourPct / 100 : null;
  const parJour = Math.max(1, Math.round(o.tradesParJour ?? 1));
  const cible = o.objectifPct !== undefined ? 1 + o.objectifPct / 100 : null;
  // Colonnes par trade : valeurs de toutes les simulations après le trade n.
  const colonnes = Array.from({ length: o.trades + 1 }, () => new Float64Array(simulations));
  const finals = new Float64Array(simulations);
  const drawdowns = new Float64Array(simulations);
  let objectifs = 0;
  let ruines = 0;

  for (let s = 0; s < simulations; s++) {
    let v = 1;
    let sommet = 1;
    let pireDd = 0;
    let fini = false;
    let atteint = false;
    let debutJour = 1;
    colonnes[0]![s] = 1;
    for (let n = 1; n <= o.trades; n++) {
      if (!fini && rendements.length > 0) {
        if ((n - 1) % parJour === 0) debutJour = v;
        v *= 1 + rendements[Math.floor(aleatoire() * rendements.length)]!;
        // Plancher : fixe, ou suiveur (plus haut − perte max, plafonné au départ) jugé sur le plus haut déjà atteint.
        const plancher = o.suiveuse ? Math.min(1, sommet - perteMax) : 1 - perteMax;
        if (v > sommet) sommet = v;
        pireDd = Math.max(pireDd, (sommet - v) / sommet);
        const jourPerdu = perteJour !== null && debutJour - v >= perteJour;
        if (cible !== null && !atteint && v >= cible && v > plancher && !jourPerdu) atteint = true;
        if (v <= plancher || jourPerdu) {
          v = Math.max(0, v);
          fini = true;
          ruines++;
        }
      }
      colonnes[n]![s] = v;
    }
    if (atteint) objectifs++;
    finals[s] = v;
    drawdowns[s] = pireDd * 100;
  }

  finals.sort();
  drawdowns.sort();
  // Au plus ~60 points pour l'éventail : assez pour une courbe lisse, léger à dessiner.
  const pas = Math.max(1, Math.ceil(o.trades / 60));
  const bandes: BandeMonteCarlo[] = [];
  for (let n = 0; n <= o.trades; n += pas) bandes.push(bande(colonnes[n]!, n));
  if (bandes[bandes.length - 1]!.n !== o.trades) bandes.push(bande(colonnes[o.trades]!, o.trades));

  return {
    simulations,
    trades: o.trades,
    probaObjectif: cible !== null ? objectifs / simulations : null,
    probaRuine: ruines / simulations,
    final: { p5: centile(finals, 0.05), p50: centile(finals, 0.5), p95: centile(finals, 0.95) },
    drawdown: { p50: centile(drawdowns, 0.5), p95: centile(drawdowns, 0.95) },
    bandes,
  };
}

function bande(colonne: Float64Array, n: number): BandeMonteCarlo {
  const t = Float64Array.from(colonne).sort();
  return { n, p5: centile(t, 0.05), p25: centile(t, 0.25), p50: centile(t, 0.5), p75: centile(t, 0.75), p95: centile(t, 0.95) };
}
