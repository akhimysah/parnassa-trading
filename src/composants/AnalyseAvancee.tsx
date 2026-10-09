import { useMemo, useRef, useState } from 'react';
import type { Portefeuille } from '../types';
import { analyser, type Groupe } from '../analyse';
import { formaterUsdt } from '../trading';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const L = 640;
const H = 190;
const M = { haut: 12, bas: 22, gauche: 8, droite: 8 };

interface Bulle {
  x: number;
  y: number;
  titre: string;
  lignes: string[];
}

function court(v: number): string {
  const a = Math.abs(v);
  const signe = v > 0 ? '+' : v < 0 ? '−' : '';
  if (a >= 1e9) return `${signe}${(a / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md$`;
  if (a >= 1e6) return `${signe}${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M$`;
  if (a >= 1e4) return `${signe}${(a / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k$`;
  return `${signe}${a.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`;
}

function InfoBulle({ bulle }: { bulle: Bulle | null }) {
  if (!bulle) return null;
  return (
    <div className="aa-bulle" style={{ left: bulle.x, top: bulle.y }} role="status">
      <strong>{bulle.titre}</strong>
      {bulle.lignes.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
}

/** Barres de part et d'autre de zéro (gain au-dessus, perte en dessous), une par jour ou par heure. */
function Barres({ groupes, etiquettes, titre, pasEtiquette = 1 }: { groupes: Groupe[]; etiquettes: string[]; titre: string; pasEtiquette?: number }) {
  const boite = useRef<HTMLDivElement>(null);
  const [bulle, setBulle] = useState<Bulle | null>(null);
  const max = Math.max(1, ...groupes.map((g) => Math.abs(g.net)));
  const hauteur = 120;
  const milieu = hauteur / 2;
  const largeur = L / groupes.length;
  return (
    <div className="aa-barres" ref={boite} onMouseLeave={() => setBulle(null)}>
      <h4>{titre}</h4>
      <svg viewBox={`0 0 ${L} ${hauteur + 18}`} role="img" aria-label={`${titre} : résultat net`}>
        <line x1={0} x2={L} y1={milieu} y2={milieu} className="aa-zero" />
        {groupes.map((g, i) => {
          const h = (Math.abs(g.net) / max) * (milieu - 4);
          const x = i * largeur + largeur * 0.18;
          const w = largeur * 0.64;
          const y = g.net >= 0 ? milieu - h : milieu;
          const montrer = (e: React.MouseEvent | React.FocusEvent) => {
            const r = boite.current?.getBoundingClientRect();
            const cible = (e.currentTarget as SVGElement).getBoundingClientRect();
            if (!r) return;
            setBulle({
              x: cible.left - r.left + cible.width / 2,
              y: cible.top - r.top,
              titre: etiquettes[i]!,
              lignes: g.nb ? [`${formaterUsdt(g.net, true)}`, `${g.nb} trade${g.nb > 1 ? 's' : ''} · ${Math.round((g.gagnants / g.nb) * 100)} % gagnants`] : ['aucun trade'],
            });
          };
          return (
            <g key={i}>
              {/* zone de survol plus grande que la barre */}
              <rect x={i * largeur} y={0} width={largeur} height={hauteur} fill="transparent" onMouseEnter={montrer} onFocus={montrer} tabIndex={g.nb ? 0 : -1} />
              {g.nb > 0 && h > 0.5 && <rect x={x} y={y} width={w} height={Math.max(1, h)} rx={2} className={g.net >= 0 ? 'aa-gain' : 'aa-perte'} pointerEvents="none" />}
              {i % pasEtiquette === 0 && (
                <text x={i * largeur + largeur / 2} y={hauteur + 13} textAnchor="middle" className="aa-axe">
                  {etiquettes[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <InfoBulle bulle={bulle} />
    </div>
  );
}

/** Analyse avancée des trades clôturés : indicateurs clés, courbe du réalisé avec drawdown, achats/ventes, jours, heures. */
export function AnalyseAvancee({ portefeuille }: { portefeuille: Portefeuille }) {
  const a = useMemo(() => analyser(portefeuille), [portefeuille]);
  const boite = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState<number | null>(null);
  if (a.courbe.length === 0) return null;

  const valeurs = [0, ...a.courbe.map((p) => p.cumul)];
  const min = Math.min(...valeurs);
  const maxV = Math.max(...valeurs);
  const ecart = maxV - min || 1;
  const n = a.courbe.length;
  const x = (i: number) => M.gauche + (i / Math.max(1, n)) * (L - M.gauche - M.droite);
  const y = (v: number) => M.haut + (1 - (v - min) / ecart) * (H - M.haut - M.bas);
  const trace = [`M ${x(0)} ${y(0)}`, ...a.courbe.map((p) => `L ${x(p.n)} ${y(p.cumul)}`)].join(' ');
  const point = survol !== null ? a.courbe[survol - 1] : undefined;

  const survoler = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * L;
    const i = Math.round(((rel - M.gauche) / (L - M.gauche - M.droite)) * n);
    setSurvol(Math.min(n, Math.max(1, i)));
  };
  const bulleCourbe: Bulle | null =
    point && boite.current
      ? (() => {
          const svg = boite.current.querySelector('svg')!.getBoundingClientRect();
          const r = boite.current.getBoundingClientRect();
          return {
            x: svg.left - r.left + (x(point.n) / L) * svg.width,
            y: svg.top - r.top + (y(point.cumul) / H) * svg.height,
            titre: `Trade n° ${point.n}`,
            lignes: [new Date(point.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }), `cumul ${formaterUsdt(point.cumul, true)}`],
          };
        })()
      : null;

  const groupeSens = (g: Groupe) => (g.nb ? `${g.nb} trade${g.nb > 1 ? 's' : ''} · ${Math.round((g.gagnants / g.nb) * 100)} % gagnants` : 'aucun trade');

  return (
    <div className="analyse-avancee">
      <div className="grille-stats">
        <div>
          <span>Espérance par trade</span>
          <strong className={a.esperance >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(a.esperance, true)}</strong>
          <em className="muet">résultat net moyen, frais de clôture déduits</em>
        </div>
        <div>
          <span>Drawdown maximal</span>
          <strong className={a.drawdown ? 'baisse' : ''}>{a.drawdown ? `−${court(a.drawdown.montant).replace(/^[−+]/, '')}` : '—'}</strong>
          <em className="muet">
            {a.drawdown ? `${a.drawdown.pct !== null ? `${a.drawdown.pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % · ` : ''}trades ${a.drawdown.debut} → ${a.drawdown.fin}` : 'aucune baisse réalisée'}
          </em>
        </div>
        <div>
          <span>Gain moyen ÷ perte moyenne</span>
          <strong>{a.ratioGainPerte !== null ? a.ratioGainPerte.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}</strong>
          <em className="muet">au-dessus de 1 : les gains pèsent plus que les pertes</em>
        </div>
        <div>
          <span>Séries</span>
          <strong>
            <span className="hausse">{a.series.gainsMax} gains</span> / <span className="baisse">{a.series.pertesMax} pertes</span>
          </strong>
          <em className="muet">
            {a.series.courante ? `en cours : ${a.series.courante.nb} ${a.series.courante.sens === 'gain' ? 'gain' : 'perte'}${a.series.courante.nb > 1 ? 's' : ''} d'affilée` : ''}
          </em>
        </div>
        <div>
          <span>Achats (long)</span>
          <strong className={a.parSens.long.net >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(a.parSens.long.net, true)}</strong>
          <em className="muet">{groupeSens(a.parSens.long)}</em>
        </div>
        <div>
          <span>Ventes (short)</span>
          <strong className={a.parSens.short.net >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(a.parSens.short.net, true)}</strong>
          <em className="muet">{groupeSens(a.parSens.short)}</em>
        </div>
      </div>

      <div className="aa-courbe" ref={boite} onMouseLeave={() => setSurvol(null)}>
        <h4>Résultat réalisé cumulé, trade après trade</h4>
        <svg viewBox={`0 0 ${L} ${H}`} onMouseMove={survoler} role="img" aria-label={`Résultat réalisé cumulé sur ${n} trades : ${formaterUsdt(a.courbe[n - 1]!.cumul, true)}`}>
          {a.drawdown && (
            <g>
              <rect x={x(a.drawdown.debut)} y={M.haut} width={Math.max(2, x(a.drawdown.fin) - x(a.drawdown.debut))} height={H - M.haut - M.bas} className="aa-zone-dd" />
              <text x={x(a.drawdown.debut) + 4} y={M.haut + 12} className="aa-axe">
                drawdown max
              </text>
            </g>
          )}
          <line x1={M.gauche} x2={L - M.droite} y1={y(0)} y2={y(0)} className="aa-zero" />
          <path d={trace} className="aa-ligne" />
          {point && (
            <g pointerEvents="none">
              <line x1={x(point.n)} x2={x(point.n)} y1={M.haut} y2={H - M.bas} className="aa-reticule" />
              <circle cx={x(point.n)} cy={y(point.cumul)} r={4} className="aa-point" />
            </g>
          )}
          <text x={M.gauche} y={H - 6} className="aa-axe">
            trade 1
          </text>
          <text x={L - M.droite} y={H - 6} textAnchor="end" className="aa-axe">
            trade {n}
          </text>
        </svg>
        <InfoBulle bulle={bulleCourbe} />
      </div>

      <div className="aa-deux">
        <Barres groupes={a.parJour} etiquettes={JOURS} titre="Résultat par jour de la semaine" />
        <Barres groupes={a.parHeure} etiquettes={a.parHeure.map((_, h) => `${h} h`)} titre="Résultat par heure de clôture (heure locale)" pasEtiquette={3} />
      </div>
    </div>
  );
}
