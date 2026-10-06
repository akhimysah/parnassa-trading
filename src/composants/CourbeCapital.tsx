import { useMemo, useState } from 'react';
import type { PointCapital } from '../types';
import { formaterUsdt } from '../trading';

interface Props {
  points: PointCapital[];
  capitalInitial: number;
  /** Valeur en direct ajoutée en fin de courbe. */
  courant: number;
}

const LARGEUR = 800;
const HAUTEUR = 180;
const MARGE = { haut: 12, bas: 22, gauche: 8, droite: 72 };

function dateAxe(ms: number, etendue: number): string {
  const d = new Date(ms);
  if (etendue > 2 * 86400000) return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Courbe d'évolution du capital, dessinée en SVG (aucune dépendance). */
export function CourbeCapital({ points, capitalInitial, courant }: Props) {
  const [survol, setSurvol] = useState<number | null>(null);
  const serie = useMemo(() => {
    const base = points.length ? points : [{ t: Date.now() - 60000, v: capitalInitial }];
    return [...base, { t: Date.now(), v: courant }];
  }, [points, capitalInitial, courant]);

  const { chemin, aire, x, y, min, max, t0, t1 } = useMemo(() => {
    const valeurs = serie.map((p) => p.v);
    let min = Math.min(...valeurs, capitalInitial);
    let max = Math.max(...valeurs, capitalInitial);
    if (max - min < capitalInitial * 0.002) {
      const centre = (max + min) / 2;
      min = centre - capitalInitial * 0.001;
      max = centre + capitalInitial * 0.001;
    }
    const t0 = serie[0].t;
    const t1 = serie[serie.length - 1].t;
    const largeurUtile = LARGEUR - MARGE.gauche - MARGE.droite;
    const hauteurUtile = HAUTEUR - MARGE.haut - MARGE.bas;
    const x = (t: number) => MARGE.gauche + (t1 === t0 ? largeurUtile : ((t - t0) / (t1 - t0)) * largeurUtile);
    const y = (v: number) => MARGE.haut + (1 - (v - min) / (max - min)) * hauteurUtile;
    const chemin = serie.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const aire = `${chemin} L${x(t1).toFixed(1)},${(HAUTEUR - MARGE.bas).toFixed(1)} L${x(t0).toFixed(1)},${(HAUTEUR - MARGE.bas).toFixed(1)} Z`;
    return { chemin, aire, x, y, min, max, t0, t1 };
  }, [serie, capitalInitial]);

  const positif = courant >= capitalInitial;
  const couleur = positif ? 'var(--hausse)' : 'var(--baisse)';
  const pointSurvol = survol !== null ? serie[survol] : null;

  const surMouvement = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * LARGEUR;
    let meilleur = 0;
    let distance = Infinity;
    serie.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < distance) {
        distance = d;
        meilleur = i;
      }
    });
    setSurvol(meilleur);
  };

  const graduations = [max, (max + min) / 2, min];

  return (
    <div className="courbe-capital">
      <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} preserveAspectRatio="none" onMouseMove={surMouvement} onMouseLeave={() => setSurvol(null)} role="img" aria-label="Évolution du capital">
        <defs>
          <linearGradient id="degrade-capital" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={couleur} stopOpacity="0.28" />
            <stop offset="100%" stopColor={couleur} stopOpacity="0" />
          </linearGradient>
        </defs>
        {graduations.map((g, i) => (
          <g key={i}>
            <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={y(g)} y2={y(g)} className="grille" />
            <text x={LARGEUR - MARGE.droite + 6} y={y(g) + 4} className="etiquette">
              {g.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}
        <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={y(capitalInitial)} y2={y(capitalInitial)} className="ligne-base" />
        <path d={aire} fill="url(#degrade-capital)" />
        <path d={chemin} fill="none" stroke={couleur} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <text x={MARGE.gauche} y={HAUTEUR - 6} className="etiquette">
          {dateAxe(t0, t1 - t0)}
        </text>
        <text x={LARGEUR - MARGE.droite} y={HAUTEUR - 6} className="etiquette" textAnchor="end">
          {dateAxe(t1, t1 - t0)}
        </text>
        {pointSurvol && (
          <g>
            <line x1={x(pointSurvol.t)} x2={x(pointSurvol.t)} y1={MARGE.haut} y2={HAUTEUR - MARGE.bas} className="curseur" />
            <circle cx={x(pointSurvol.t)} cy={y(pointSurvol.v)} r="4" fill={couleur} />
          </g>
        )}
      </svg>
      <div className="courbe-legende">
        {pointSurvol ? (
          <>
            <strong>{formaterUsdt(pointSurvol.v)}</strong>
            <span className="muet">{new Date(pointSurvol.t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </>
        ) : (
          <>
            <strong className={positif ? 'hausse' : 'baisse'}>{formaterUsdt(courant - capitalInitial, true)}</strong>
            <span className="muet">depuis le départ · {serie.length} point{serie.length > 1 ? 's' : ''}</span>
          </>
        )}
      </div>
    </div>
  );
}
