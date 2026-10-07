import { useState } from 'react';
import { formaterUsdt } from '../trading';

export interface Part {
  libelle: string;
  valeur: number;
  couleur: string;
}

interface Props {
  parts: Part[];
}

const R = 70;
const EPAISSEUR = 22;

/** Anneau de répartition en SVG, avec légende et survol. */
export function Repartition({ parts }: Props) {
  const [survol, setSurvol] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + Math.max(0, p.valeur), 0);
  if (total <= 0) return <p className="vide">Rien à répartir.</p>;

  const circonference = 2 * Math.PI * R;
  let cumul = 0;
  const segments = parts.map((p, i) => {
    const fraction = Math.max(0, p.valeur) / total;
    const seg = { ...p, i, fraction, decalage: cumul };
    cumul += fraction;
    return seg;
  });
  const actif = survol !== null ? segments[survol] : null;

  return (
    <div className="repartition">
      <svg viewBox="0 0 180 180" width="170" height="170" role="img" aria-label="Répartition du portefeuille">
        <g transform="rotate(-90 90 90)">
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--panneau-2)" strokeWidth={EPAISSEUR} />
          {segments.map((s) => (
            <circle
              key={s.i}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={s.couleur}
              strokeWidth={survol === s.i ? EPAISSEUR + 6 : EPAISSEUR}
              strokeDasharray={`${Math.max(0, s.fraction * circonference - (segments.length > 1 ? 2 : 0))} ${circonference}`}
              strokeDashoffset={-s.decalage * circonference}
              onMouseEnter={() => setSurvol(s.i)}
              onMouseLeave={() => setSurvol(null)}
              style={{ transition: 'stroke-width 0.15s' }}
            />
          ))}
        </g>
        <text x="90" y="84" textAnchor="middle" className="repartition-titre">
          {actif ? actif.libelle : 'Total'}
        </text>
        <text x="90" y="104" textAnchor="middle" className="repartition-valeur">
          {actif ? `${(actif.fraction * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : formaterUsdt(total).replace(' USDT', '')}
        </text>
      </svg>
      <ul className="repartition-legende">
        {segments.map((s) => (
          <li key={s.i} onMouseEnter={() => setSurvol(s.i)} onMouseLeave={() => setSurvol(null)} className={survol === s.i ? 'actif' : ''}>
            <i style={{ background: s.couleur }} />
            <span>{s.libelle}</span>
            <strong>{(s.fraction * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</strong>
            <em className="muet">{formaterUsdt(s.valeur)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
