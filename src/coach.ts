import type { Operation, Portefeuille } from './types';
import { dateDuJour } from './challenge';
import { ouvertureDe } from './trading';
import { ticker } from './symboles';

export type TonConstat = 'negatif' | 'attention' | 'positif';

export interface Constat {
  id: string;
  ton: TonConstat;
  titre: string;
  detail: string;
  /** Importance, pour trier : à ton égal, les montants les plus lourds d'abord. */
  poids: number;
}

/** Clôtures nécessaires avant de tirer des conclusions. */
export const MIN_CLOTURES_COACH = 10;
/** Délai après une perte sous lequel une nouvelle ouverture compte comme un trade de revanche. */
export const DELAI_REVANCHE_MS = 15 * 60 * 1000;

const dollars = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.round(Math.abs(v)).toLocaleString('fr-FR')} $`;
const pct = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} %`;
const fois = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}×`;
const somme = (l: number[]) => l.reduce((s, v) => s + v, 0);
const mediane = (l: number[]) => {
  if (!l.length) return 0;
  const t = [...l].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
};
const duree = (ms: number) => {
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) return `${(min / 60).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
  return `${Math.round(min / 1440)} j`;
};
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

interface Trade {
  op: Operation;
  net: number;
  ouvertLe: number | null;
}

/**
 * Coach : lit l'historique et en tire des constats concrets (revanche après une perte, pertes gardées trop
 * longtemps, rapport gain/perte insuffisant, surtrading, créneaux et instruments à éviter, gains coupés tôt).
 */
export function conseilsCoach(p: Portefeuille): Constat[] {
  const ouverture = ouvertureDe(p.operations);
  const trades: Trade[] = p.operations
    .filter((o) => o.type === 'cloture' && o.resultat !== undefined)
    .sort((a, b) => a.date - b.date)
    .map((op) => ({ op, net: (op.resultat ?? 0) - op.frais, ouvertLe: ouverture(op) }));
  if (trades.length < MIN_CLOTURES_COACH) return [];
  const constats: Constat[] = [];
  const gagnants = trades.filter((t) => t.net > 0);
  const perdants = trades.filter((t) => t.net <= 0);
  const taux = gagnants.length / trades.length;

  // 1. Revanche : positions ouvertes peu après une perte.
  const datesPertes = perdants.map((t) => t.op.date);
  const apresPerte = (debut: number) => {
    let bas = 0;
    let haut = datesPertes.length - 1;
    while (bas <= haut) {
      const m = (bas + haut) >> 1;
      if (datesPertes[m]! <= debut) bas = m + 1;
      else haut = m - 1;
    }
    const derniere = datesPertes[bas - 1];
    return derniere !== undefined && debut - derniere <= DELAI_REVANCHE_MS;
  };
  const revanche = trades.filter((t) => t.ouvertLe !== null && apresPerte(t.ouvertLe));
  const enRevanche = new Set(revanche);
  const autres = trades.filter((t) => !enRevanche.has(t));
  if (revanche.length >= 3) {
    const net = somme(revanche.map((t) => t.net));
    const tauxR = revanche.filter((t) => t.net > 0).length / revanche.length;
    const tauxA = autres.length ? autres.filter((t) => t.net > 0).length / autres.length : 0;
    if (net < 0 && tauxR <= tauxA) {
      constats.push({
        id: 'revanche',
        ton: 'negatif',
        titre: 'Trades de revanche',
        detail: `${revanche.length} positions ouvertes moins de 15 min après une perte : ${dollars(net)} au total, ${pct(tauxR * 100)} de réussite contre ${pct(tauxA * 100)} le reste du temps. Après une perte, faites une pause avant de reprendre.`,
        poids: Math.abs(net),
      });
    }
  }

  // 2. Pertes gardées plus longtemps que les gains.
  const dureesG = gagnants.filter((t) => t.ouvertLe !== null).map((t) => t.op.date - t.ouvertLe!);
  const dureesP = perdants.filter((t) => t.ouvertLe !== null).map((t) => t.op.date - t.ouvertLe!);
  if (dureesG.length >= 5 && dureesP.length >= 5) {
    const mg = mediane(dureesG);
    const mp = mediane(dureesP);
    if (mg > 0 && mp >= 1.5 * mg) {
      constats.push({
        id: 'pertes-longues',
        ton: 'attention',
        titre: 'Vous gardez vos pertes trop longtemps',
        detail: `Une perte reste ouverte ${duree(mp)} en médiane, un gain ${duree(mg)} : ${fois(mp / mg)} plus longtemps. Posez le stop à l'entrée et laissez-le faire son travail.`,
        poids: Math.abs(somme(perdants.map((t) => t.net))) * 0.5,
      });
    }
  }

  // 3. Réussite et rapport gain/perte : l'avantage est-il positif ?
  if (gagnants.length >= 3 && perdants.length >= 3) {
    const gainMoyen = somme(gagnants.map((t) => t.net)) / gagnants.length;
    const perteMoyenne = Math.abs(somme(perdants.map((t) => t.net))) / perdants.length;
    const ratio = perteMoyenne > 0 ? gainMoyen / perteMoyenne : Infinity;
    const requis = (1 - taux) / taux;
    const esperance = taux * gainMoyen - (1 - taux) * perteMoyenne;
    if (ratio < requis) {
      constats.push({
        id: 'avantage',
        ton: 'negatif',
        titre: 'Gains trop petits pour votre taux de réussite',
        detail: `Avec ${pct(taux * 100)} de trades gagnants, il faut un gain moyen d'au moins ${fois(requis)} la perte moyenne ; vous êtes à ${fois(ratio)} (${dollars(esperance)} par trade). Visez des cibles plus lointaines ou des stops plus serrés.`,
        poids: Math.abs(esperance) * trades.length,
      });
    } else {
      constats.push({
        id: 'avantage',
        ton: 'positif',
        titre: 'Votre avantage est positif',
        detail: `${pct(taux * 100)} de réussite avec un gain moyen de ${fois(ratio)} la perte moyenne (seuil : ${fois(requis)}) : ${dollars(esperance)} par trade en moyenne. Gardez la même taille de risque.`,
        poids: esperance * trades.length,
      });
    }
  }

  // 4. Surtrading : les journées les plus chargées rapportent-elles moins ?
  const parJour = new Map<string, Trade[]>();
  for (const t of trades) {
    const j = dateDuJour(t.op.date);
    parJour.set(j, [...(parJour.get(j) ?? []), t]);
  }
  if (parJour.size >= 4) {
    const nombres = [...parJour.values()].map((l) => l.length);
    const seuil = Math.max(2 * mediane(nombres), mediane(nombres) + 3);
    const chargees = [...parJour.values()].filter((l) => l.length >= seuil);
    const normales = [...parJour.values()].filter((l) => l.length < seuil);
    if (chargees.length >= 2 && normales.length >= 2) {
      const moyC = somme(chargees.map((l) => somme(l.map((t) => t.net)))) / chargees.length;
      const moyN = somme(normales.map((l) => somme(l.map((t) => t.net)))) / normales.length;
      if (moyC < 0 && moyC < moyN) {
        constats.push({
          id: 'surtrading',
          ton: 'attention',
          titre: 'Surtrading',
          detail: `Les jours à ${Math.round(seuil)} trades ou plus (${chargees.length} jours) finissent à ${dollars(moyC)} en moyenne, contre ${dollars(moyN)} les autres jours. Fixez un nombre de trades max dans la discipline.`,
          poids: Math.abs(moyC) * chargees.length,
        });
      }
    }
  }

  // 5. Instruments : le pire et le meilleur.
  const parSymbole = new Map<string, Trade[]>();
  for (const t of trades) parSymbole.set(t.op.symbole, [...(parSymbole.get(t.op.symbole) ?? []), t]);
  const symboles = [...parSymbole.entries()].filter(([, l]) => l.length >= 5).map(([s, l]) => ({ s, l, net: somme(l.map((t) => t.net)) }));
  if (symboles.length >= 2) {
    symboles.sort((a, b) => a.net - b.net);
    const pire = symboles[0]!;
    const meilleur = symboles[symboles.length - 1]!;
    if (pire.net < 0) {
      constats.push({
        id: 'instrument-pire',
        ton: 'negatif',
        titre: `${ticker(pire.s)} vous coûte cher`,
        detail: `${dollars(pire.net)} en ${pire.l.length} trades (${pct((pire.l.filter((t) => t.net > 0).length / pire.l.length) * 100)} de réussite). Réduisez la taille ou mettez-le de côté le temps de revoir votre approche.`,
        poids: Math.abs(pire.net),
      });
    }
    if (meilleur.net > 0) {
      constats.push({
        id: 'instrument-meilleur',
        ton: 'positif',
        titre: `${ticker(meilleur.s)} est votre terrain`,
        detail: `${dollars(meilleur.net)} en ${meilleur.l.length} trades (${pct((meilleur.l.filter((t) => t.net > 0).length / meilleur.l.length) * 100)} de réussite). Concentrez-vous sur ce que vous maîtrisez.`,
        poids: meilleur.net,
      });
    }
  }

  // 6. Créneaux : jour de la semaine et heure qui coûtent le plus.
  const creneau = (cle: (t: Trade) => number, libelle: (k: number) => string, id: string) => {
    const g = new Map<number, Trade[]>();
    for (const t of trades) g.set(cle(t), [...(g.get(cle(t)) ?? []), t]);
    const pire = [...g.entries()].filter(([, l]) => l.length >= 5).map(([k, l]) => ({ k, l, net: somme(l.map((t) => t.net)) })).sort((a, b) => a.net - b.net)[0];
    if (pire && pire.net < 0 && g.size >= 2) {
      constats.push({
        id,
        ton: 'attention',
        titre: `Évitez ${libelle(pire.k)}`,
        detail: `${dollars(pire.net)} en ${pire.l.length} trades clôturés ${libelle(pire.k)}, ${pct((pire.l.filter((t) => t.net > 0).length / pire.l.length) * 100)} de réussite.`,
        poids: Math.abs(pire.net) * 0.8,
      });
    }
  };
  creneau((t) => (new Date(t.op.date).getDay() + 6) % 7, (k) => `le ${JOURS[k]}`, 'jour');
  creneau((t) => new Date(t.op.date).getHours(), (k) => `entre ${k} h et ${k + 1} h`, 'heure');

  // 7. Gains coupés à la main bien avant la cible.
  const gainsManuels = gagnants.filter((t) => t.op.origine === 'marche').map((t) => t.net);
  const gainsCible = gagnants.filter((t) => t.op.origine === 'take-profit').map((t) => t.net);
  if (gainsManuels.length >= 5 && gainsCible.length >= 3) {
    const mm = somme(gainsManuels) / gainsManuels.length;
    const mc = somme(gainsCible) / gainsCible.length;
    if (mm < 0.5 * mc) {
      constats.push({
        id: 'gains-coupes',
        ton: 'attention',
        titre: 'Vous coupez vos gains trop tôt',
        detail: `Un gain fermé à la main rapporte ${dollars(mm)} en moyenne, contre ${dollars(mc)} quand le take-profit est touché. Laissez courir jusqu'à la cible, ou utilisez un stop suiveur.`,
        poids: (mc - mm) * gainsManuels.length * 0.5,
      });
    }
  }

  // 8. Stop-out et compte cramé : la marge n'a pas tenu.
  const forcees = trades.filter((t) => t.op.origine === 'stop-out' || t.op.origine === 'crame');
  if (forcees.length) {
    const net = somme(forcees.map((t) => t.net));
    constats.push({
      id: 'stop-out',
      ton: 'negatif',
      titre: 'Positions fermées de force',
      detail: `${forcees.length} position${forcees.length > 1 ? 's' : ''} fermée${forcees.length > 1 ? 's' : ''} par stop-out ou par la règle des 99 % (${dollars(net)}). Le levier était trop fort pour vos stops : réduisez les volumes.`,
      poids: Math.abs(net) * 1.5,
    });
  }

  const ordre: Record<TonConstat, number> = { negatif: 0, attention: 1, positif: 2 };
  return constats.sort((a, b) => ordre[a.ton] - ordre[b.ton] || b.poids - a.poids);
}
