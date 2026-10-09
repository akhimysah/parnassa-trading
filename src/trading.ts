import type { Operation, OrdreEnAttente, Portefeuille, Position, Sens } from './types';
import type { Tick } from './binance';
import { paireBinance } from './binance';
import { conversionUsd, instrument, LOT_MAX, normaliserLots, tailleContrat } from './instruments';

/** Frais par défaut sur la crypto (0,1 % du notionnel, tarif spot standard de Binance). */
export const TAUX_FRAIS = 0.001;
/** Commission des CFD (forex, métaux, indices, énergie, actions) : 0,005 % du notionnel, ≈ 5 $ par 100 000 $. */
export const TAUX_FRAIS_CFD = 0.00005;
/** Sous ce niveau de marge (fonds propres ÷ marge utilisée), toutes les positions sont fermées. */
export const NIVEAU_STOP_OUT = 0.5;
/** Règle du compte cramé : à 99 % de perte du capital de départ, tout est fermé et le compte est bloqué. */
export const PERTE_CRAME = 0.99;
export const MESSAGE_CRAME = 'Compte cramé : 99 % du capital de départ est perdu. Remettez le compte à zéro pour trader à nouveau.';

/** Le compte a-t-il franchi la règle des 99 % ? (fonds propres ≤ 1 % du capital de départ) */
export function franchitCrame(p: Portefeuille, capital: number): boolean {
  return capital <= p.capitalInitial * (1 - PERTE_CRAME);
}

type Ticks = Record<string, Tick>;

function identifiant(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Taux de commission : réglage utilisateur pour la crypto, commission CFD fixe pour le reste. */
export function tauxFrais(symbole: string, tauxCrypto = TAUX_FRAIS): number {
  const i = instrument(symbole);
  return !i || i.categorie === 'crypto' ? tauxCrypto : TAUX_FRAIS_CFD;
}

/** P&L latent en USD (converti si l'instrument est coté en EUR, GBP, JPY…). */
export function pnlLatent(position: Position, prix: number, ticks: Ticks = {}): number {
  return (prix - position.prixEntree) * position.quantite * (position.sens === 'achat' ? 1 : -1) * conversionUsd(position.symbole, ticks);
}

export interface EtatCompte {
  /** Fonds propres : solde + marges immobilisées + P&L latent. */
  capital: number;
  latent: number;
  /** Marge utilisée par les positions ouvertes. */
  immobilise: number;
  /** Fonds propres ÷ marge utilisée (null sans position). */
  niveauMarge: number | null;
}

export function valeurPortefeuille(p: Portefeuille, ticks: Ticks): EtatCompte {
  let latent = 0;
  let immobilise = 0;
  for (const pos of p.positions) {
    immobilise += pos.cout;
    const t = ticks[paireBinance(pos.symbole)];
    if (t) latent += pnlLatent(pos, t.prix, ticks);
  }
  const capital = p.solde + immobilise + latent;
  return { capital, latent, immobilise, niveauMarge: immobilise > 0 ? capital / immobilise : null };
}

export function realiseTotal(p: Portefeuille): number {
  const archive = p.archive ? p.archive.resultat - p.archive.frais : 0;
  return archive + p.operations.reduce((s, o) => s + (o.resultat ?? 0) - o.frais, 0);
}

/** Opérations gardées en détail ; au-delà, les plus anciennes sont résumées (nombre, résultat, frais). */
export const OPERATIONS_MAX = 5000;

const arrondi = (v: number, decimales: number) => Math.round(v * 10 ** decimales) / 10 ** decimales;
/** Prix gardé avec 10 chiffres significatifs : assez pour tous les instruments, sans les décimales parasites. */
const prixCompact = (v: number) => Number(v.toPrecision(10));

/** Ajoute une opération (montants arrondis au centime) et résume les plus anciennes au-delà d'OPERATIONS_MAX. */
export function ajouterOperation(p: Portefeuille, o: Operation): Portefeuille {
  const compacte: Operation = {
    ...o,
    quantite: arrondi(o.quantite, 8),
    prix: prixCompact(o.prix),
    frais: arrondi(o.frais, 2),
    ...(o.resultat !== undefined ? { resultat: arrondi(o.resultat, 2) } : {}),
    ...(o.prixEntree !== undefined ? { prixEntree: prixCompact(o.prixEntree) } : {}),
  };
  if (compacte.note === undefined) delete compacte.note;
  const operations = [compacte, ...p.operations];
  if (operations.length <= OPERATIONS_MAX) return { ...p, operations };
  const anciennes = operations.slice(OPERATIONS_MAX);
  const a = p.archive ?? { operations: 0, clotures: 0, resultat: 0, frais: 0, jusquAu: 0 };
  return {
    ...p,
    operations: operations.slice(0, OPERATIONS_MAX),
    archive: {
      operations: a.operations + anciennes.length,
      clotures: a.clotures + anciennes.filter((x) => x.type === 'cloture').length,
      resultat: arrondi(a.resultat + anciennes.reduce((s, x) => s + (x.resultat ?? 0), 0), 2),
      frais: arrondi(a.frais + anciennes.reduce((s, x) => s + x.frais, 0), 2),
      jusquAu: Math.max(a.jusquAu, ...anciennes.map((x) => x.date)),
    },
  };
}

export interface Protections {
  stopLoss?: number;
  takeProfit?: number;
  /** Stop suiveur : distance en prix ; sans stop-loss, le stop démarre à cette distance du prix d'entrée. */
  suiveur?: number;
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

export interface Engagement {
  unites: number;
  notionnel: number;
  marge: number;
  frais: number;
}

/** Ce qu'engage un ordre de `lots` lots au prix `prix` avec le levier `levier`. */
export function engagement(symbole: string, lots: number, prix: number, levier: number, ticks: Ticks, tauxCrypto = TAUX_FRAIS): Engagement {
  const unites = lots * tailleContrat(symbole);
  const notionnel = unites * prix * conversionUsd(symbole, ticks);
  return { unites, notionnel, marge: notionnel / Math.max(1, levier), frais: notionnel * tauxFrais(symbole, tauxCrypto) };
}

/** Volume maximal (lots) que permet la marge libre. */
export function lotsMax(p: Portefeuille, symbole: string, prix: number, levier: number, ticks: Ticks, tauxCrypto = TAUX_FRAIS, volumeMax = LOT_MAX): number {
  const parLot = engagement(symbole, 1, prix, levier, ticks, tauxCrypto);
  const coutLot = parLot.marge + parLot.frais;
  if (!(coutLot > 0)) return 0;
  return Math.min(volumeMax, Math.floor((p.solde / coutLot) * 100) / 100);
}

export function ouvrir(
  p: Portefeuille,
  symbole: string,
  sens: Sens,
  lots: number,
  prix: number,
  ticks: Ticks,
  options: { levier: number; prot?: Protections; origine?: Operation['origine']; tauxCrypto?: number; volumeMax?: number },
): Portefeuille | string {
  if (p.crameLe) return MESSAGE_CRAME;
  const volumeMax = options.volumeMax ?? LOT_MAX;
  if (!(lots >= 0.01) || lots > volumeMax) return `Volume invalide : entre 0,01 et ${volumeMax.toLocaleString('fr-FR')} lots.`;
  if (!(prix > 0)) return 'Prix invalide.';
  const lotsNet = normaliserLots(lots, volumeMax);
  const prot = options.prot ?? {};
  const erreur = verifierProtections(sens, prix, prot);
  if (erreur) return erreur;
  const e = engagement(symbole, lotsNet, prix, options.levier, ticks, options.tauxCrypto);
  if (e.marge + e.frais > p.solde) {
    return `Marge insuffisante : il faut ${(e.marge + e.frais).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} USDT (marge ${e.marge.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} + frais), marge libre ${p.solde.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} USDT.`;
  }
  const position: Position = {
    id: identifiant(),
    symbole,
    sens,
    quantite: e.unites,
    lots: lotsNet,
    levier: options.levier,
    prixEntree: prix,
    cout: e.marge,
    ouvertLe: Date.now(),
    stopLoss: prot.stopLoss ?? (prot.suiveur && prot.suiveur > 0 ? (sens === 'achat' ? prix - prot.suiveur : prix + prot.suiveur) : undefined),
    takeProfit: prot.takeProfit,
    suiveur: prot.suiveur && prot.suiveur > 0 ? prot.suiveur : undefined,
    note: prot.note?.trim() || undefined,
  };
  const operation: Operation = {
    id: identifiant(),
    symbole,
    sens,
    type: 'ouverture',
    origine: options.origine ?? 'marche',
    quantite: e.unites,
    lots: lotsNet,
    prix,
    frais: e.frais,
    note: position.note,
    date: Date.now(),
  };
  return ajouterOperation({ ...p, solde: p.solde - e.marge - e.frais, positions: [position, ...p.positions] }, operation);
}

/** Ferme tout ou partie d'une position (`quantite` en unités de l'actif). */
export function cloturer(
  p: Portefeuille,
  positionId: string,
  prix: number,
  ticks: Ticks,
  options: { origine?: Operation['origine']; tauxCrypto?: number; quantite?: number } = {},
): Portefeuille | string {
  const position = p.positions.find((x) => x.id === positionId);
  if (!position) return 'Position introuvable.';
  if (!(prix > 0)) return 'Prix indisponible.';
  const q = options.quantite === undefined ? position.quantite : Math.min(options.quantite, position.quantite);
  if (!(q > 0)) return 'Quantité invalide.';
  const part = q / position.quantite;
  const margePart = position.cout * part;
  const conversion = conversionUsd(position.symbole, ticks);
  const resultat = (prix - position.prixEntree) * q * (position.sens === 'achat' ? 1 : -1) * conversion;
  const frais = q * prix * conversion * tauxFrais(position.symbole, options.tauxCrypto);
  const lotsFermes = position.lots !== undefined ? Math.round(position.lots * part * 100) / 100 : undefined;
  const operation: Operation = {
    id: identifiant(),
    symbole: position.symbole,
    sens: position.sens === 'achat' ? 'vente' : 'achat',
    type: 'cloture',
    origine: options.origine ?? 'marche',
    quantite: q,
    lots: lotsFermes,
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
    : p.positions.map((x) =>
        x.id === positionId
          ? { ...x, quantite: reste, cout: position.cout - margePart, lots: x.lots !== undefined ? Math.round((x.lots - (lotsFermes ?? 0)) * 100) / 100 : undefined }
          : x,
      );
  return ajouterOperation({ ...p, solde: p.solde + (totale ? position.cout : margePart) + resultat - frais, positions }, operation);
}

export function annoterPosition(p: Portefeuille, positionId: string, note: string): Portefeuille {
  return { ...p, positions: p.positions.map((x) => (x.id === positionId ? { ...x, note: note.trim() || undefined } : x)) };
}

export function annoterOperation(p: Portefeuille, operationId: string, note: string): Portefeuille {
  return { ...p, operations: p.operations.map((o) => (o.id === operationId ? { ...o, note: note.trim() || undefined } : o)) };
}

/**
 * Protections d'une position ouverte. Elles se jugent par rapport au prix actuel (un stop remonté au-dessus de
 * l'entrée verrouille un gain) ; sans prix connu, par rapport au prix d'entrée.
 */
export function modifierProtections(p: Portefeuille, positionId: string, prot: Protections & { suiveur?: number }, prixActuel?: number): Portefeuille | string {
  const position = p.positions.find((x) => x.id === positionId);
  if (!position) return 'Position introuvable.';
  const reference = prixActuel ?? position.prixEntree;
  if (prot.stopLoss !== undefined) {
    if (position.sens === 'achat' && prot.stopLoss >= reference) return "Le stop-loss d'un long doit être sous le prix actuel.";
    if (position.sens === 'vente' && prot.stopLoss <= reference) return "Le stop-loss d'un short doit être au-dessus du prix actuel.";
  }
  if (prot.takeProfit !== undefined) {
    if (position.sens === 'achat' && prot.takeProfit <= reference) return "Le take-profit d'un long doit être au-dessus du prix actuel.";
    if (position.sens === 'vente' && prot.takeProfit >= reference) return "Le take-profit d'un short doit être sous le prix actuel.";
  }
  if (prot.suiveur !== undefined && !(prot.suiveur > 0)) return 'La distance du stop suiveur doit être positive.';
  let stopLoss = prot.stopLoss;
  // Un stop suiveur sans stop-loss démarre à sa distance du prix actuel.
  if (prot.suiveur && stopLoss === undefined) stopLoss = position.sens === 'achat' ? reference - prot.suiveur : reference + prot.suiveur;
  return {
    ...p,
    positions: p.positions.map((x) => (x.id === positionId ? { ...x, stopLoss, takeProfit: prot.takeProfit, suiveur: prot.suiveur } : x)),
  };
}

/** Break-even : le stop-loss passe au prix d'entrée, possible seulement si la position est en gain. */
export function breakEven(p: Portefeuille, positionId: string, prixActuel: number): Portefeuille | string {
  const position = p.positions.find((x) => x.id === positionId);
  if (!position) return 'Position introuvable.';
  const enGain = position.sens === 'achat' ? prixActuel > position.prixEntree : prixActuel < position.prixEntree;
  if (!enGain) return "Break-even possible seulement quand la position est en gain.";
  return modifierProtections(p, positionId, { stopLoss: position.prixEntree, takeProfit: position.takeProfit, suiveur: position.suiveur }, prixActuel);
}

/**
 * Fait suivre le stop-loss au meilleur prix, comme sur MT5 : le suivi ne commence qu'une fois la position en gain
 * d'au moins la distance (le stop atteint alors l'entrée) ; ensuite il ne recule jamais.
 */
export function suivreStop(pos: Position, prix: number): Position {
  if (!pos.suiveur) return pos;
  const candidat = pos.sens === 'achat' ? prix - pos.suiveur : prix + pos.suiveur;
  const enGainSuffisant = pos.sens === 'achat' ? candidat >= pos.prixEntree : candidat <= pos.prixEntree;
  if (pos.stopLoss !== undefined && !enGainSuffisant) return pos;
  const meilleur = pos.stopLoss === undefined || (pos.sens === 'achat' ? candidat > pos.stopLoss : candidat < pos.stopLoss);
  return meilleur ? { ...pos, stopLoss: candidat } : pos;
}

export function placerOrdre(
  p: Portefeuille,
  ordre: Omit<OrdreEnAttente, 'id' | 'creeLe'> & { lots: number; levier: number },
  prixActuel: number,
  ticks: Ticks,
  tauxCrypto = TAUX_FRAIS,
  volumeMax = LOT_MAX,
): Portefeuille | string {
  if (p.crameLe) return MESSAGE_CRAME;
  if (!(ordre.prix > 0)) return 'Prix invalide.';
  if (!(ordre.lots >= 0.01) || ordre.lots > volumeMax) return `Volume invalide : entre 0,01 et ${volumeMax.toLocaleString('fr-FR')} lots.`;
  const e = engagement(ordre.symbole, ordre.lots, ordre.prix, ordre.levier, ticks, tauxCrypto);
  if (e.marge + e.frais > p.solde) return 'Marge libre insuffisante pour cet ordre.';
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
  return { ...p, ordres: [{ ...ordre, lots: normaliserLots(ordre.lots, volumeMax), id: identifiant(), creeLe: Date.now() }, ...p.ordres] };
}

export function annulerOrdre(p: Portefeuille, ordreId: string): Portefeuille {
  return { ...p, ordres: p.ordres.filter((o) => o.id !== ordreId) };
}

function ordreDeclenchable(o: OrdreEnAttente, prix: number): boolean {
  if (o.type === 'limite') return o.sens === 'achat' ? prix <= o.prix : prix >= o.prix;
  return o.sens === 'achat' ? prix >= o.prix : prix <= o.prix;
}

/** Volume d'un ordre en lots (les anciens ordres en montant USDT sont convertis, sans levier). */
function lotsOrdre(o: OrdreEnAttente, prix: number): { lots: number; levier: number } {
  if (o.lots !== undefined) return { lots: o.lots, levier: o.levier ?? 1 };
  const unites = (o.montant ?? 0) / prix;
  return { lots: Math.max(0.01, Math.round((unites / tailleContrat(o.symbole)) * 100) / 100), levier: 1 };
}

/**
 * Applique le flux de prix : exécute les ordres en attente déclenchés, puis les stop-loss / take-profit,
 * puis le stop-out si le niveau de marge passe sous 50 %. Retourne le portefeuille et les messages.
 */
export function appliquerFlux(p: Portefeuille, ticks: Ticks, tauxCrypto = TAUX_FRAIS): { portefeuille: Portefeuille; messages: string[] } {
  let courant = p;
  const messages: string[] = [];
  const nom = (s: string) => instrument(s)?.code ?? s.split(':').pop();

  for (const o of p.ordres) {
    const tick = ticks[paireBinance(o.symbole)];
    if (!tick || !ordreDeclenchable(o, tick.prix)) continue;
    // Une limite s'exécute à son prix ; un stop au prix du marché qui l'a franchi.
    const prixExecution = o.type === 'limite' ? o.prix : tick.prix;
    const { lots, levier } = lotsOrdre(o, prixExecution);
    const r = ouvrir(courant, o.symbole, o.sens, lots, prixExecution, ticks, { levier, prot: o, origine: o.type, tauxCrypto, volumeMax: Math.max(LOT_MAX, lots) });
    courant = annulerOrdre(typeof r === 'string' ? courant : r, o.id);
    messages.push(
      typeof r === 'string'
        ? `Ordre ${o.type} ${nom(o.symbole)} annulé : ${r}`
        : `Ordre ${o.type} exécuté : ${o.sens === 'achat' ? 'achat' : 'vente'} ${lots.toLocaleString('fr-FR')} lot ${nom(o.symbole)} à ${prixExecution.toLocaleString('fr-FR')}`,
    );
  }

  // Stops suiveurs : ils montent (long) ou descendent (short) avec le prix, avant le contrôle des stops.
  if (courant.positions.some((x) => x.suiveur)) {
    const suivies = courant.positions.map((x) => {
      const t = ticks[paireBinance(x.symbole)];
      return t ? suivreStop(x, t.prix) : x;
    });
    if (suivies.some((x, i) => x !== courant.positions[i])) courant = { ...courant, positions: suivies };
  }

  for (const pos of courant.positions) {
    const tick = ticks[paireBinance(pos.symbole)];
    if (!tick) continue;
    const prix = tick.prix;
    const touchéSL = pos.stopLoss !== undefined && (pos.sens === 'achat' ? prix <= pos.stopLoss : prix >= pos.stopLoss);
    const touchéTP = pos.takeProfit !== undefined && (pos.sens === 'achat' ? prix >= pos.takeProfit : prix <= pos.takeProfit);
    if (!touchéSL && !touchéTP) continue;
    const resultat = pnlLatent(pos, prix, ticks);
    const r = cloturer(courant, pos.id, prix, ticks, { origine: touchéSL ? 'stop-loss' : 'take-profit', tauxCrypto });
    if (typeof r === 'string') continue;
    courant = r;
    messages.push(
      `${touchéSL ? (pos.suiveur ? 'Stop suiveur' : 'Stop-loss') : 'Take-profit'} ${nom(pos.symbole)} : position fermée à ${prix.toLocaleString('fr-FR')} (${resultat >= 0 ? '+' : ''}${resultat.toFixed(2)} USDT)`,
    );
  }

  const toutesCotees = courant.positions.every((pos) => ticks[paireBinance(pos.symbole)]);
  // Règle du compte cramé (avant le stop-out) : à 99 % de perte, on ferme tout, on annule les ordres et on bloque le compte.
  if (!courant.crameLe && toutesCotees && franchitCrame(courant, valeurPortefeuille(courant, ticks).capital)) {
    for (const pos of [...courant.positions]) {
      const r = cloturer(courant, pos.id, ticks[paireBinance(pos.symbole)].prix, ticks, { origine: 'crame', tauxCrypto });
      if (typeof r !== 'string') courant = r;
    }
    courant = { ...courant, ordres: [], crameLe: Date.now() };
    messages.push(`🔥 ${MESSAGE_CRAME}`);
  }

  // Stop-out : seulement si toutes les positions ont un prix (pas de décision sur une valorisation partielle).
  const compte = valeurPortefeuille(courant, ticks);
  if (!courant.crameLe && toutesCotees && compte.niveauMarge !== null && compte.niveauMarge < NIVEAU_STOP_OUT) {
    const niveau = Math.round(compte.niveauMarge * 100);
    for (const pos of [...courant.positions]) {
      const r = cloturer(courant, pos.id, ticks[paireBinance(pos.symbole)].prix, ticks, { origine: 'stop-out', tauxCrypto });
      if (typeof r !== 'string') courant = r;
    }
    messages.push(`⚠️ Stop-out : niveau de marge à ${niveau} % (< ${NIVEAU_STOP_OUT * 100} %), toutes les positions ont été fermées.`);
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
  // Durée : on apparie chaque clôture à l'ouverture la plus récente du même symbole qui la précède
  // (dates d'ouverture triées par symbole, recherche dichotomique : rapide même avec des milliers d'opérations).
  const ouverturesParSymbole = new Map<string, number[]>();
  for (const o of p.operations) {
    if (o.type !== 'ouverture') continue;
    const l = ouverturesParSymbole.get(o.symbole) ?? [];
    l.push(o.date);
    ouverturesParSymbole.set(o.symbole, l);
  }
  for (const l of ouverturesParSymbole.values()) l.sort((a, b) => a - b);
  const durees: number[] = [];
  for (const c of clotures) {
    const l = ouverturesParSymbole.get(c.symbole);
    if (!l?.length) continue;
    let bas = 0;
    let haut = l.length - 1;
    let trouve = -1;
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1;
      if (l[milieu]! <= c.date) {
        trouve = milieu;
        bas = milieu + 1;
      } else haut = milieu - 1;
    }
    if (trouve >= 0) durees.push(c.date - l[trouve]!);
  }
  return {
    nbTrades: clotures.length,
    gagnants: gains.length,
    perdants: pertes.length,
    tauxReussite: clotures.length ? (gains.length / clotures.length) * 100 : 0,
    gainMoyen: gains.length ? sommeGains / gains.length : 0,
    perteMoyenne: pertes.length ? sommePertes / pertes.length : 0,
    profitFactor: sommePertes > 0 ? sommeGains / sommePertes : null,
    meilleur: clotures.reduce<Operation | null>((m, o) => (m === null || (o.resultat ?? 0) > (m.resultat ?? 0) ? o : m), null),
    pire: clotures.reduce<Operation | null>((m, o) => (m === null || (o.resultat ?? 0) < (m.resultat ?? 0) ? o : m), null),
    netFraisInclus: realiseTotal(p),
    fraisTotaux,
    parPaire: [...parPaireMap.entries()].map(([symbole, e]) => ({ symbole, ...e })).sort((a, b) => b.net - a.net),
    dureeMoyenneMs: durees.length ? durees.reduce((s, d) => s + d, 0) / durees.length : null,
  };
}

/** Volume (lots) pour risquer `risque` USDT entre le prix d'entrée et le stop-loss. */
export function lotsParRisque(risque: number, prix: number, stopLoss: number, symbole: string, ticks: Ticks): number | null {
  const ecart = Math.abs(prix - stopLoss);
  if (!(ecart > 0) || !(risque > 0)) return null;
  const perteParLot = ecart * tailleContrat(symbole) * conversionUsd(symbole, ticks);
  return perteParLot > 0 ? risque / perteParLot : null;
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

export function formaterLots(lots: number): string {
  return `${lots.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lot${lots >= 2 ? 's' : ''}`;
}
