import { useMemo, useState } from 'react';
import type { Tick } from '../binance';
import type { Position } from '../types';
import { expositionParActif, risqueOuvert } from '../exposition';
import { formaterUsdt } from '../trading';
import { ticker } from '../symboles';

const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

function court(v: number): string {
  const a = Math.abs(v);
  const signe = v < 0 ? '−' : '';
  if (a >= 1e9) return `${signe}${(a / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md$`;
  if (a >= 1e6) return `${signe}${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M$`;
  if (a >= 1e4) return `${signe}${(a / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k$`;
  return `${signe}${a.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`;
}

/** Risque des positions ouvertes (stops, cibles, positions sans stop) et exposition nette par devise et par actif. */
export function RisqueExposition({ positions, ticks, capital }: { positions: Position[]; ticks: Record<string, Tick>; capital: number }) {
  const [exposition, setExposition] = useState(false);
  const r = risqueOuvert(positions, ticks);
  // L'exposition bouge avec chaque tick : on ne la calcule qu'affichée.
  const lignes = useMemo(() => (exposition ? expositionParActif(positions, ticks) : []), [exposition, positions, ticks]);
  if (positions.length === 0) return null;
  const part = (v: number) => (capital > 0 ? pct((Math.abs(v) / capital) * 100) : '—');
  const maxNet = Math.max(1, ...lignes.map((l) => Math.abs(l.net)));
  const sansStop = r.sansStop.map((p) => ticker(p.symbole));

  return (
    <div className="risque-exposition">
      <div className="re-chiffres">
        <div>
          <span>Si tous les stops sont touchés</span>
          <strong className={r.perteAuxStops < 0 ? 'baisse' : ''}>{formaterUsdt(r.perteAuxStops + r.verrouille, true)}</strong>
          <em className="muet">
            {r.perteAuxStops < 0 ? `risque ${part(r.perteAuxStops)} du capital` : 'aucune perte possible aux stops'}
            {r.verrouille > 0 ? ` · ${formaterUsdt(r.verrouille, true)} verrouillés` : ''}
          </em>
        </div>
        <div>
          <span>Si toutes les cibles sont touchées</span>
          <strong className={r.gainAuxCibles > 0 ? 'hausse' : ''}>{r.avecCible ? formaterUsdt(r.gainAuxCibles, true) : '—'}</strong>
          <em className="muet">{r.avecCible ? `${part(r.gainAuxCibles)} du capital · ${r.avecCible} position${r.avecCible > 1 ? 's' : ''} avec TP` : 'aucun take-profit posé'}</em>
        </div>
        <div className={sansStop.length ? 're-alerte' : ''}>
          <span>Sans stop-loss</span>
          <strong>{sansStop.length ? `⚠️ ${sansStop.length}` : '✓ 0'}</strong>
          <em className="muet">{sansStop.length ? `risque non borné : ${[...new Set(sansStop)].slice(0, 4).join(', ')}` : 'toutes les positions sont protégées'}</em>
        </div>
        <button className="lien discret" onClick={() => setExposition((x) => !x)} aria-expanded={exposition}>
          {exposition ? 'Masquer l’exposition' : 'Exposition par devise →'}
        </button>
      </div>
      {exposition && (
        <ul className="re-exposition" aria-label="Exposition nette par devise et par actif">
          {lignes.map((l) => (
            <li key={l.actif}>
              <strong>{l.actif}</strong>
              <span className="re-barre">
                <i className={l.net >= 0 ? 'long' : 'short'} style={{ width: `${(Math.abs(l.net) / maxNet) * 50}%` }} />
              </span>
              <span className={`num ${l.net >= 0 ? 'hausse' : 'baisse'}`}>
                {l.net >= 0 ? 'Long' : 'Short'} {court(Math.abs(l.net))}
              </span>
              <span className="num muet">{part(l.net)}</span>
            </li>
          ))}
          <li className="muet petit re-note">Notionnel net au prix actuel, en USD. Une paire de change compte pour ses deux devises (long EURUSD = long EUR, short USD).</li>
        </ul>
      )}
    </div>
  );
}
