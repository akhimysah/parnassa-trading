/** Jauge d'une règle : objectif (plein = atteint) ou limite de perte (orange à 50 %, rouge à 80 %). */
export function Jauge({ libelle, valeur, max, texte, sens }: { libelle: string; valeur: number; max: number; texte: string; sens: 'objectif' | 'limite' }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, valeur / max)) : 0;
  // Objectif : plus c'est plein, mieux c'est. Limite de perte : orange à 50 %, rouge à 80 %.
  const classe = sens === 'objectif' ? (ratio >= 1 ? 'ok' : 'progres') : ratio >= 0.8 ? 'danger' : ratio >= 0.5 ? 'attention' : 'calme';
  return (
    <div className="jauge-challenge">
      <div className="jc-entete">
        <span>{libelle}</span>
        <strong>{texte}</strong>
      </div>
      <div className={`jc-barre ${classe}`}>
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
