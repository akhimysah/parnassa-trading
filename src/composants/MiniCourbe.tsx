interface Props {
  valeurs: number[];
  largeur?: number;
  hauteur?: number;
}

/** Sparkline SVG : verte si la dernière valeur est au-dessus de la première, rouge sinon. */
export function MiniCourbe({ valeurs, largeur = 96, hauteur = 28 }: Props) {
  if (valeurs.length < 2) return <span className="muet">…</span>;
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min || 1;
  const pas = largeur / (valeurs.length - 1);
  const points = valeurs.map((v, i) => `${(i * pas).toFixed(1)},${(hauteur - 2 - ((v - min) / etendue) * (hauteur - 4)).toFixed(1)}`).join(' ');
  const hausse = valeurs[valeurs.length - 1] >= valeurs[0];
  return (
    <svg className="mini-courbe" width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} aria-hidden>
      <polyline points={points} fill="none" stroke={hausse ? 'var(--hausse)' : 'var(--baisse)'} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
