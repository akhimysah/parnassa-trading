import type { Operation, OrdreEnAttente, Portefeuille, Position, Sens } from './types';
import type { Tick } from './binance';
import { paireBinance } from './binance';

/** Frais simulés par ordre (0,1 %, comme le tarif spot standard de Binance). */
export const TAUX_FRAIS = 0.001;

function identifiant(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function pnlLatent(position: Position, prix: number): number {
  return (prix - position.prixEntree) * position.quantite * (position.sens === 'achat' ? 1 : -1);
}

export function valeurPortefeuille(p: Portefeuille, ticks: Record<string, Tick>): { capital: number; latent: number; immobilise: number } {
  let latent = 0;
  let immobilise = 0;
  for (const pos of p.positions) {
    immobilise += pos.cout;
    const t = ticks[paireBinance(pos.symbole)];
    if (t) latent += pnlLatent(pos, t.prix);
  }
  return { capital: p.solde + immobilise + latent, latent, immobilise };
}

export function realiseTotal(p: Portefeuille): number {
  return p.operations.reduce((s, o) => s + (o.resultat ?? 0) - o.frais, 0);
}

export interface Protections {
  stopLoss?: number;
  takeProfit?: number;
  note?: string;
}

export function verifierProtections(sens: Sens, prix: number, prot: Protections): string | null {
  if (prot.stopLoss !== undefined) {
    if (sens === 'achat' && prot.stopLoss >= prix) return 'Le stop-loss d\'un long doit être sous le prix d\'entrée.';
    if (sens === 'vente' && prot.stopLoss <= prix) return 'Le stop-loss d\'un short doit être au-dessus du prix d\'entrée.';
  }
  if (prot.takeProfit !== undefined) {
    if (sens === 'achat' && prot.takeProfit <= prix) return 'Le take-profit d\'un long doit être au-dessus du prix d\'entrée.';
    if (sens === 'vente' && prot.takeProfit >= prix) return 'Le take-profit d\'un short doit être sous le prix d\'entrée.';
  }
  return null;
}

export function ouvrir(
  p: Portefeuille,
  symbole: string,
  sens: Sens,
  quantite: number,
  prix: number,
  prot: Protections = {},
  origine: Operation['origine'] = 'marche',
  taux = TAUX_FRAIS,
): Portefeuille | string {
  if (!(quantite > 0) || !(prix > 0)) return 'Quantité ou prix invalide.';
  const erreur = verifierProtections(sens, prix, prot);
  if (erreur) return erreur;
  const cout = quantite * prix;
  const frais = cout * taux;
  if (cout + frais > p.solde) return `Solde insuffisant : il faut ${(cout + frais).toFixed(2)} USDT.`;
  const position: Position = {
    id: identifiant(),
    symbole,
    sens,
    quantite,
    prixEntree: prix,
    cout,
    ouvertLe: Date.now(),
    stopLoss: prot.stopLoss,
    takeProfit: prot.takeProfit,
    note: prot.note?.trim() || undefined,
  };
  const operation: Operation = { id: identifiant(), symbole, sens, type: 'ouverture', origine, quantite, prix, frais, note: position.note, date: Date.now() };
  return { ...p, solde: p.solde - cout - frais, positions: [position, ...p.positions], operations: [operation, ...p.operations] };
}

export function cloturer(
  p: Portefeuille,
  positionId: string,
  prix: number,
  origine: Operation['origine'] = 'marche',
  taux = TAUX_FRAIS,
  quantite?: number,
): Portefeuille | string {
  const position = p.positions.find((x) => x.id === positionId);
  if (!position) return 'Position introuvable.';
  if (!(prix > 0)) return 'Prix indisponible.';
  const q = quantite === undefined ? position.quantite : Math.min(quantite, position.quantite);
  if (!(q > 0)) return 'Quantité invalide.';
  const part = q / position.quantite;
  const coutPart = position.cout * part;
  const resultat = (prix - position.prixEntree) * q * (position.sens === 'achat' ? 1 : -1);
  const frais = q * prix * taux;
  const operation: Operation = {
    id: identifiant(),
    symbole: position.symbole,
    sens: position.sens === 'achat' ? 'vente' : 'achat',
    type: 'cloture',
    origine,
    quantite: q,
    prix,
    frais,
    resultat,
    prixEntree: position.prixEntree,
    note: position.note,
    date: Date.now(),
  };
  const reste = position.quantite - q;
  // En dessous d'un millionième, on considère la position entièrement fermée (arrondis).
  const totale = reste <= position.quantite * 1e-6;
  const positions = totale
    ? p.positions.filter((x) => x.id !== positionId)
    : p.positions.map((x) => (x.id === positionId ? { ...x, quantite: reste, cout: position.cout - coutPart } : x));
  return {
    ...p,
    solde: p.solde + (totale ? position.cout : coutPart) + resultat - frais,
    positions,
    operations: [operation, ...p.operations],
  };
}

export function annoterPosition(p: Portefeuille, positionId: string, note: string): Portefeuille {
  return { ...p, positions: p.positions.map((x) => (x.id === positionId ? { ...x, note: note.trim() || undefined } : x)) };
}

export function annoterOperation(p: Portefeuille, operationId: string, note: string): Portefeuille {
  return { ...p, operations: p.operations.map((o) => (o.id === operationId ? { ...o, note: note.trim() || undefined } : o)) };
}

export function modifierProtections(p: Portefeuille, positionId: string, prot: Protections): Portefeuille | string {
  const position = p.positions.find((x) => x.id === positionId);
  if (!position) return 'Position introuvable.';
  const erreur = verifierProtections(position.sens, position.prixEntree, prot);
  if (erreur) return erreur;
  return { ...p, positions: p.positions.map((x) => (x.id === positionId ? { ...x, stopLoss: prot.stopLoss, takeProfit: prot.takeProfit } : x)) };
}

export function placerOrdre(
  p: Portefeuille,
  ordre: Omit<OrdreEnAttente, 'id' | 'creeLe'>,
  prixActuel: number,
  taux = TAUX_FRAIS,
): Portefeuille | string {
  if (!(ordre.prix > 0) || !(ordre.montant > 0)) return 'Prix ou montant invalide.';
  if (ordre.montant * (1 + taux) > p.solde) return 'Solde insuffisant pour cet ordre.';
  const erreur = verifierProtections(ordre.sens, ordre.prix, ordre);
  if (erreur) return erreur;
  // Un ordre déjà déclenchable serait exécuté immédiatement : on refuse pour éviter la confusion.
  if (ordre.type === 'limite') {
    if (ordre.sens === 'achat' && ordre.prix >= prixActuel) return 'Une limite d\'achat doit être sous le prix actuel (sinon passez un ordre au marché).';
    if (ordre.sens === 'vente' && ordre.prix <= prixActuel) return 'Une limite de vente doit être au-dessus du prix actuel.';
  } else {
    if (ordre.sens === 'achat' && ordre.prix <= prixActuel) return 'Un stop d\'achat doit être au-dessus du prix actuel.';
    if (ordre.sens === 'vente' && ordre.prix >= prixActuel) return 'Un stop de vente doit être sous le prix actuel.';
  }
  return { ...p, ordres: [{ ...ordre, id: identifiant(), creeLe: Date.now() }, ...p.ordres] };
}

export function annulerOrdre(p: Portefeuille, ordreId: string): Portefeuille {
  return { ...p, ordres: p.ordres.filter((o) => o.id !== ordreId) };
}

function ordreDeclenchable(o: OrdreEnAttente, prix: number): boolean {
  if (o.type === 'limite') return o.sens === 'achat' ? prix <= o.prix : prix >= o.prix;
  return o.sens === 'achat' ? prix >= o.prix : prix <= o.prix;
}

/**
 * Applique le flux de prix : exécute les ordres en attente déclenchés, puis les stop-loss / take-profit.
 * Retourne le portefeuille mis à jour et les messages à afficher.
 */
export function appliquerFlux(p: Portefeuille, ticks: Record<string, Tick>, taux = TAUX_FRAIS): { portefeuille: Portefeuille; messages: string[] } {
  let courant = p;
  const messages: string[] = [];

  for (const o of p.ordres) {
    const tick = ticks[paireBinance(o.symbole)];
    if (!tick || !ordreDeclenchable(o, tick.prix)) continue;
    // Une limite s'exécute à son prix ; un stop au prix du marché qui l'a franchi.
    const prixExecution = o.type === 'limite' ? o.prix : tick.prix;
    const quantite = o.montant / prixExecution;
    const r = ouvrir(courant, o.symbole, o.sens, quantite, prixExecution, o, o.type, taux);
    courant = annulerOrdre(typeof r === 'string' ? courant : r, o.id);
    messages.push(
      typeof r === 'string'
        ? `Ordre ${o.type} ${o.symbole.split(':').pop()} annulé : ${r}`
        : `Ordre ${o.type} exécuté : ${o.sens === 'achat' ? 'achat' : 'vente'} ${o.symbole.split(':').pop()} à ${prixExecution.toLocaleString('fr-FR')}`,
    );
  }

  for (const pos of courant.positions) {
    const tick = ticks[paireBinance(pos.symbole)];
    if (!tick) continue;
    const prix = tick.prix;
    const touchéSL = pos.stopLoss !== undefined && (pos.sens === 'achat' ? prix <= pos.stopLoss : prix >= pos.stopLoss);
    const touchéTP = pos.takeProfit !== undefined && (pos.sens === 'achat' ? prix >= pos.takeProfit : prix <= pos.takeProfit);
    if (!touchéSL && !touchéTP) continue;
    const r = cloturer(courant, pos.id, prix, touchéSL ? 'stop-loss' : 'take-profit', taux);
    if (typeof r === 'string') continue;
    courant = r;
    const resultat = pnlLatent(pos, prix);
    messages.push(
      `${touchéSL ? 'Stop-loss' : 'Take-profit'} ${pos.symbole.split(':').pop()} : position fermée à ${prix.toLocaleString('fr-FR')} (${resultat >= 0 ? '+' : ''}${resultat.toFixed(2)} USDT)`,
    );
  }

  return { portefeuille: courant, messages };
}

/** Ajoute un point à la courbe de capital au plus toutes les 60 s (2 000 points max, soit ~33 h en continu). */
export function enregistrerCapital(p: Portefeuille, capital: number, force = false): Portefeuille {
  const dernier = p.historiqueCapital[p.historiqueCapital.length - 1];
  const maintenant = Date.now();
  if (!force && dernier && maintenant - dernier.t < 60000) return p;
  const historique = [...p.historiqueCapital, { t: maintenant, v: Math.round(capital * 100) / 100 }].slice(-2000);
  return { ...p, historiqueCapital: historique };
}

export interface Statistiques {
  nbTrades: number;
  gagnants: number;
  perdants: number;
  tauxReussite: number;
  gainMoyen: number;
  perteMoyenne: number;
  profitFactor: number | null;
  meilleur: Operation | null;
  pire: Operation | null;
  netFraisInclus: number;
  fraisTotaux: number;
  parPaire: { symbole: string; nb: number; net: number }[];
  dureeMoyenneMs: number | null;
}

/** Statistiques des trades clôturés (résultat brut par trade, frais comptés séparément). */
export function statistiques(p: Portefeuille): Statistiques {
  const clotures = p.operations.filter((o) => o.type === 'cloture' && o.resultat !== undefined);
  const gains = clotures.filter((o) => (o.resultat ?? 0) > 0);
  const pertes = clotures.filter((o) => (o.resultat ?? 0) <= 0);
  const sommeGains = gains.reduce((s, o) => s + (o.resultat ?? 0), 0);
  const sommePertes = Math.abs(pertes.reduce((s, o) => s + (o.resultat ?? 0), 0));
  const fraisTotaux = p.operations.reduce((s, o) => s + o.frais, 0);
  const parPaireMap = new Map<string, { nb: number; net: number }>();
  for (const o of clotures) {
    const e = parPaireMap.get(o.symbole) ?? { nb: 0, net: 0 };
    e.nb += 1;
    e.net += o.resultat ?? 0;
    parPaireMap.set(o.symbole, e);
  }
  // Durée : on apparie chaque clôture à l'ouverture la plus récente du même symbole qui la précède.
  const ouvertures = p.operations.filter((o) => o.type === 'ouverture').slice().sort((a, b) => a.date - b.date);
  const durees: number[] = [];
  for (const c of clotures) {
    const o = [...ouvertures].reverse().find((x) => x.symbole === c.symbole && x.date <= c.date);
    if (o) durees.push(c.date - o.date);
  }
  return {
    nbTrades: clotures.length,
    gagnants: gains.length,
    perdants: pertes.length,
    tauxReussite: clotures.length ? (gains.length / clotures.length) * 100 : 0,
    gainMoyen: gains.length ? sommeGains / gains.length : 0,
    perteMoyenne: pertes.length ? sommePertes / pertes.length : 0,
    profitFactor: sommePertes > 0 ? sommeGains / sommePertes : clotures.length ? null : null,
    meilleur: clotures.reduce<Operation | null>((m, o) => (m === null || (o.resultat ?? 0) > (m.resultat ?? 0) ? o : m), null),
    pire: clotures.reduce<Operation | null>((m, o) => (m === null || (o.resultat ?? 0) < (m.resultat ?? 0) ? o : m), null),
    netFraisInclus: realiseTotal(p),
    fraisTotaux,
    parPaire: [...parPaireMap.entries()].map(([symbole, e]) => ({ symbole, ...e })).sort((a, b) => b.net - a.net),
    dureeMoyenneMs: durees.length ? durees.reduce((s, d) => s + d, 0) / durees.length : null,
  };
}

/** Montant à engager pour risquer `risque` USDT entre le prix d'entrée et le stop-loss. */
export function montantParRisque(risque: number, prix: number, stopLoss: number): number | null {
  const ecart = Math.abs(prix - stopLoss);
  if (!(ecart > 0) || !(prix > 0) || !(risque > 0)) return null;
  return (risque / ecart) * prix;
}

export function reinitialiser(capital = 100000): Portefeuille {
  return { capitalInitial: capital, solde: capital, positions: [], operations: [], ordres: [], historiqueCapital: [{ t: Date.now(), v: capital }] };
}

export function formaterUsdt(v: number, signe = false): string {
  const texte = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefixe = v < 0 ? '−' : signe && v > 0 ? '+' : '';
  return `${prefixe}${texte} USDT`;
}

export function formaterQuantite(q: number): string {
  return q.toLocaleString('fr-FR', { maximumFractionDigits: q >= 100 ? 2 : q >= 1 ? 4 : 6 });
}
