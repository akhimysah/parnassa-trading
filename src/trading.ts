import type { Operation, Portefeuille, Position, Sens } from './types';
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

export function ouvrir(p: Portefeuille, symbole: string, sens: Sens, quantite: number, prix: number): Portefeuille | string {
  if (!(quantite > 0) || !(prix > 0)) return 'Quantité ou prix invalide.';
  const cout = quantite * prix;
  const frais = cout * TAUX_FRAIS;
  if (cout + frais > p.solde) return `Solde insuffisant : il faut ${(cout + frais).toFixed(2)} USDT.`;
  const position: Position = { id: identifiant(), symbole, sens, quantite, prixEntree: prix, cout, ouvertLe: Date.now() };
  const operation: Operation = { id: identifiant(), symbole, sens, type: 'ouverture', quantite, prix, frais, date: Date.now() };
  return { ...p, solde: p.solde - cout - frais, positions: [position, ...p.positions], operations: [operation, ...p.operations] };
}

export function cloturer(p: Portefeuille, positionId: string, prix: number): Portefeuille | string {
  const position = p.positions.find((x) => x.id === positionId);
  if (!position) return 'Position introuvable.';
  if (!(prix > 0)) return 'Prix indisponible.';
  const resultat = pnlLatent(position, prix);
  const frais = position.quantite * prix * TAUX_FRAIS;
  const operation: Operation = {
    id: identifiant(),
    symbole: position.symbole,
    sens: position.sens === 'achat' ? 'vente' : 'achat',
    type: 'cloture',
    quantite: position.quantite,
    prix,
    frais,
    resultat,
    date: Date.now(),
  };
  return {
    ...p,
    solde: p.solde + position.cout + resultat - frais,
    positions: p.positions.filter((x) => x.id !== positionId),
    operations: [operation, ...p.operations],
  };
}

export function reinitialiser(capital = 100000): Portefeuille {
  return { capitalInitial: capital, solde: capital, positions: [], operations: [] };
}

export function formaterUsdt(v: number, signe = false): string {
  const texte = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefixe = v < 0 ? '−' : signe && v > 0 ? '+' : '';
  return `${prefixe}${texte} USDT`;
}

export function formaterQuantite(q: number): string {
  return q.toLocaleString('fr-FR', { maximumFractionDigits: q >= 100 ? 2 : q >= 1 ? 4 : 6 });
}
