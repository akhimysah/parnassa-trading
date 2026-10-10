import type { Portefeuille, ReglesDiscipline } from './types';
import { dateDuJour } from './challenge';

/** Plans gardés : environ trois mois de séances. */
export const PLANS_MAX = 90;
/** Longueur minimale d'un plan pour qu'il compte (un modèle laissé vide ne suffit pas). */
export const PLAN_MIN_CARACTERES = 30;

export const MODELE_PLAN = `Biais du jour :
Niveaux clés :
Scénario d'achat :
Scénario de vente :
Ce que je ne ferai pas :`;

/** Le plan rédigé pour ce jour, s'il existe. */
export function planDuJour(p: Portefeuille, maintenant = Date.now()) {
  const jour = dateDuJour(maintenant);
  return p.plans?.find((x) => x.date === jour) ?? null;
}

/** Texte utile d'un plan : sans les intitulés du modèle ni les lignes vides. */
export function contenuPlan(texte: string): string {
  const intitules = new Set(MODELE_PLAN.split('\n').map((l) => l.trim()));
  return texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !intitules.has(l))
    .join('\n');
}

/**
 * Enregistre (ou remplace) le plan du jour, sans les intitulés du modèle laissés vides ; un texte vide le supprime.
 * Garde les PLANS_MAX plus récents.
 */
export function enregistrerPlan(p: Portefeuille, texte: string, maintenant = Date.now()): Portefeuille {
  const jour = dateDuJour(maintenant);
  const autres = (p.plans ?? []).filter((x) => x.date !== jour);
  const intitules = new Set(MODELE_PLAN.split('\n').map((l) => l.trim()));
  const propre = texte
    .split('\n')
    .filter((l) => !intitules.has(l.trim()))
    .join('\n')
    .trim();
  const plans = propre ? [{ date: jour, texte: propre, majLe: maintenant }, ...autres] : autres;
  return { ...p, plans: plans.sort((a, b) => b.date.localeCompare(a.date)).slice(0, PLANS_MAX) };
}

/** Règle « plan obligatoire » : message si aucun plan digne de ce nom n'est écrit pour aujourd'hui. */
export function planManquant(p: Portefeuille, regles: ReglesDiscipline | undefined, maintenant = Date.now()): string | null {
  if (!regles?.actif || !regles.planObligatoire) return null;
  const plan = planDuJour(p, maintenant);
  if (plan && contenuPlan(plan.texte).length >= PLAN_MIN_CARACTERES) return null;
  return 'Plan du jour obligatoire : écrivez votre plan (biais, niveaux, scénarios) avant d’ouvrir une position.';
}
