import type { Position } from '../types';
import type { Tick } from '../binance';
import { paireBinance } from '../binance';
import { formaterCotation } from '../instruments';
import { formaterLots, formaterUsdt, pnlLatent } from '../trading';
import { nomSymbole, ticker } from '../symboles';

interface Groupe {
  symbole: string;
  nb: number;
  lotsLong: number;
  lotsShort: number;
  moyenLong: number | null;
  moyenShort: number | null;
  pnl: number | null;
  marge: number;
}

/** Regroupe les positions par instrument : volumes acheteur et vendeur, prix moyens pondérés, résultat latent. */
export function grouperPositions(positions: Position[], ticks: Record<string, Tick>): Groupe[] {
  const m = new Map<string, { nb: number; lotsLong: number; lotsShort: number; qL: number; qS: number; vL: number; vS: number; pnl: number; cote: boolean; marge: number }>();
  for (const pos of positions) {
    const g = m.get(pos.symbole) ?? { nb: 0, lotsLong: 0, lotsShort: 0, qL: 0, qS: 0, vL: 0, vS: 0, pnl: 0, cote: true, marge: 0 };
    g.nb += 1;
    g.marge += pos.cout;
    if (pos.sens === 'achat') {
      g.lotsLong += pos.lots ?? 0;
      g.qL += pos.quantite;
      g.vL += pos.quantite * pos.prixEntree;
    } else {
      g.lotsShort += pos.lots ?? 0;
      g.qS += pos.quantite;
      g.vS += pos.quantite * pos.prixEntree;
    }
    const prix = ticks[paireBinance(pos.symbole)]?.prix;
    if (prix) g.pnl += pnlLatent(pos, prix, ticks);
    else g.cote = false;
    m.set(pos.symbole, g);
  }
  return [...m.entries()]
    .map(([symbole, g]) => ({
      symbole,
      nb: g.nb,
      lotsLong: Math.round(g.lotsLong * 100) / 100,
      lotsShort: Math.round(g.lotsShort * 100) / 100,
      moyenLong: g.qL > 0 ? g.vL / g.qL : null,
      moyenShort: g.qS > 0 ? g.vS / g.qS : null,
      pnl: g.cote ? g.pnl : null,
      marge: g.marge,
    }))
    .sort((a, b) => b.marge - a.marge);
}

/** Vue des positions groupées par instrument, avec fermeture du groupe. */
export function PositionsGroupees({
  positions,
  ticks,
  ouvrirSymbole,
  fermerSymbole,
}: {
  positions: Position[];
  ticks: Record<string, Tick>;
  ouvrirSymbole: (id: string) => void;
  fermerSymbole: (symbole: string) => void;
}) {
  const groupes = grouperPositions(positions, ticks);
  return (
    <div className="defilement-x">
      <table className="tableau-prix">
        <thead>
          <tr>
            <th>Instrument</th>
            <th className="num">Positions</th>
            <th className="num">Achat (long)</th>
            <th className="num">Vente (short)</th>
            <th className="num">Net</th>
            <th className="num">Actuel</th>
            <th className="num">P&amp;L latent</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groupes.map((g) => {
            const net = Math.round((g.lotsLong - g.lotsShort) * 100) / 100;
            const actuel = ticks[paireBinance(g.symbole)]?.prix;
            return (
              <tr key={g.symbole}>
                <td onClick={() => ouvrirSymbole(g.symbole)}>
                  <strong>{ticker(g.symbole)}</strong> <span className="muet">{nomSymbole(g.symbole)}</span>
                </td>
                <td className="num">{g.nb}</td>
                <td className="num">
                  {g.lotsLong ? formaterLots(g.lotsLong) : '—'}
                  {g.moyenLong !== null && <span className="sous-valeur">moy. {formaterCotation(g.symbole, g.moyenLong)}</span>}
                </td>
                <td className="num">
                  {g.lotsShort ? formaterLots(g.lotsShort) : '—'}
                  {g.moyenShort !== null && <span className="sous-valeur">moy. {formaterCotation(g.symbole, g.moyenShort)}</span>}
                </td>
                <td className={`num ${net > 0 ? 'hausse' : net < 0 ? 'baisse' : 'muet'}`}>
                  {net > 0 ? '+' : ''}
                  {formaterLots(net)}
                </td>
                <td className="num">{actuel ? formaterCotation(g.symbole, actuel) : '…'}</td>
                <td className={`num ${g.pnl === null ? '' : g.pnl >= 0 ? 'hausse' : 'baisse'}`}>{g.pnl === null ? '…' : formaterUsdt(g.pnl, true)}</td>
                <td className="num">
                  <button className="lien" onClick={() => fermerSymbole(g.symbole)}>
                    Fermer {g.nb > 1 ? `les ${g.nb}` : ''}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
