import type { Challenge, Operation, Portefeuille } from '../types';
import type { Tick } from '../binance';
import { paireBinance } from '../binance';
import { formaterCotation } from '../instruments';
import { formaterLots, formaterQuantite, formaterUsdt, type Statistiques } from '../trading';
import { nomSymbole, ticker } from '../symboles';
import { PrixAnime } from './PrixAnime';
import { IconeCroix } from './Icones';
import { CoachTrading } from './CoachTrading';
import { AnalyseAvancee } from './AnalyseAvancee';
import { ProjectionMonteCarlo } from './ProjectionMonteCarlo';

/** Libellé de l'origine d'une opération (historique, journal, exports). */
export const ORIGINES: Record<string, string> = {
  programmee: 'clôture programmée',
  marche: 'marché',
  limite: 'limite',
  stop: 'stop',
  'stop-loss': 'stop-loss',
  'take-profit': 'take-profit',
  'stop-out': 'stop-out',
  crame: 'compte cramé',
  weekend: 'fermeture du week-end',
};

export function dateCourte(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Onglet « Ordres » : ordres en attente, distance au prix, protections, annulation. */
export function OngletOrdres({ p, ticks, ouvrirSymbole, annuler }: { p: Portefeuille; ticks: Record<string, Tick>; ouvrirSymbole: (id: string) => void; annuler: (id: string) => void }) {
  return (
    <>
      {p.ordres.length === 0 && <p className="vide">Aucun ordre en attente. Choisissez « Limite » ou « Stop » dans le formulaire.</p>}
      {p.ordres.length > 0 && (
        <div className="defilement-x">
          <table className="tableau-prix">
            <thead>
              <tr>
                <th>Paire</th>
                <th>Type</th>
                <th className="num">Déclenchement</th>
                <th className="num">Actuel</th>
                <th className="num">Volume</th>
                <th className="num">SL / TP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {p.ordres.map((o) => {
                const actuel = ticks[paireBinance(o.symbole)]?.prix;
                const distance = actuel ? ((o.prix - actuel) / actuel) * 100 : null;
                return (
                  <tr key={o.id}>
                    <td onClick={() => ouvrirSymbole(o.symbole)}>
                      <strong>{ticker(o.symbole)}</strong>
                    </td>
                    <td className={o.sens === 'achat' ? 'hausse' : 'baisse'}>
                      {o.type === 'limite' ? 'Limite' : o.type === 'stop' ? 'Stop' : 'Stop-limite'} · {o.sens === 'achat' ? 'achat' : 'vente'}
                      {o.groupeOco && <span className="badge-suiveur">OCO</span>}
                      {o.expireLe && (
                        <span className="badge-suiveur" title={new Date(o.expireLe).toLocaleString('fr-FR')}>
                          expire {new Date(o.expireLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {formaterCotation(o.symbole, o.prix)}
                      {o.type === 'stop-limite' && o.prixLimite !== undefined && <span className="muet"> → lim. {formaterCotation(o.symbole, o.prixLimite)}</span>}
                      {distance !== null && (
                        <span className="muet"> ({distance > 0 ? '+' : ''}{distance.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)</span>
                      )}
                    </td>
                    <td className="num"><PrixAnime valeur={actuel} texte={actuel ? formaterCotation(o.symbole, actuel) : '…'} /></td>
                    <td className="num">
                      {o.lots !== undefined ? `${formaterLots(o.lots)} · 1:${o.levier ?? 1}` : formaterUsdt(o.montant ?? 0)}
                    </td>
                    <td className="num muet">
                      {o.stopLoss ? formaterCotation(o.symbole, o.stopLoss) : '—'} / {o.takeProfit ? formaterCotation(o.symbole, o.takeProfit) : '—'}
                    </td>
                    <td className="num">
                      <button className="icone petit" aria-label="Annuler l'ordre" onClick={() => annuler(o.id)}>
                        <IconeCroix width={14} height={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Onglet « Statistiques » : coach, indicateurs clés, résultat par paire, analyse avancée et projection. */
export function OngletStatistiques({ p, stats, challenge, ouvrirSymbole }: { p: Portefeuille; stats: Statistiques; challenge: Challenge | null; ouvrirSymbole: (id: string) => void }) {
  return (
    <div className="statistiques">
      {stats.nbTrades === 0 && <p className="vide">Les statistiques apparaîtront après votre première clôture.</p>}
      {stats.nbTrades > 0 && (
        <>
          <CoachTrading portefeuille={p} />
          <div className="grille-stats">
            <div>
              <span>Trades clôturés</span>
              <strong>{stats.nbTrades}</strong>
              <em className="muet">
                {stats.gagnants} gagnant{stats.gagnants > 1 ? 's' : ''} · {stats.perdants} perdant{stats.perdants > 1 ? 's' : ''}
              </em>
            </div>
            <div>
              <span>Taux de réussite</span>
              <strong className={stats.tauxReussite >= 50 ? 'hausse' : 'baisse'}>
                {stats.tauxReussite.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
              </strong>
              <div className="jauge">
                <i style={{ width: `${stats.tauxReussite}%` }} />
              </div>
            </div>
            <div>
              <span>Profit factor</span>
              <strong className={stats.profitFactor === null ? '' : stats.profitFactor >= 1 ? 'hausse' : 'baisse'}>
                {stats.profitFactor === null ? '∞' : stats.profitFactor.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              </strong>
              <em className="muet">gains bruts / pertes brutes</em>
            </div>
            <div>
              <span>Gain moyen / perte moyenne</span>
              <strong>
                <span className="hausse">{formaterUsdt(stats.gainMoyen, true)}</span> / <span className="baisse">{formaterUsdt(-stats.perteMoyenne)}</span>
              </strong>
              <em className="muet">
                ratio {stats.perteMoyenne > 0 ? (stats.gainMoyen / stats.perteMoyenne).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '∞'}
              </em>
            </div>
            <div>
              <span>Meilleur trade</span>
              <strong className="hausse">{stats.meilleur ? formaterUsdt(stats.meilleur.resultat ?? 0, true) : '—'}</strong>
              <em className="muet">{stats.meilleur ? `${ticker(stats.meilleur.symbole)} · ${dateCourte(stats.meilleur.date)}` : ''}</em>
            </div>
            <div>
              <span>Pire trade</span>
              <strong className="baisse">{stats.pire ? formaterUsdt(stats.pire.resultat ?? 0, true) : '—'}</strong>
              <em className="muet">{stats.pire ? `${ticker(stats.pire.symbole)} · ${dateCourte(stats.pire.date)}` : ''}</em>
            </div>
            <div>
              <span>Net frais inclus</span>
              <strong className={stats.netFraisInclus >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(stats.netFraisInclus, true)}</strong>
              <em className="muet">dont {formaterUsdt(stats.fraisTotaux)} de frais</em>
            </div>
            <div>
              <span>Durée moyenne</span>
              <strong>
                {stats.dureeMoyenneMs === null
                  ? '—'
                  : stats.dureeMoyenneMs < 3600000
                    ? `${Math.max(1, Math.round(stats.dureeMoyenneMs / 60000))} min`
                    : stats.dureeMoyenneMs < 86400000
                      ? `${(stats.dureeMoyenneMs / 3600000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`
                      : `${(stats.dureeMoyenneMs / 86400000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`}
              </strong>
              <em className="muet">entre ouverture et clôture</em>
            </div>
          </div>
          <h3>Par paire</h3>
          <div className="defilement-x">
            <table className="tableau-prix">
              <thead>
                <tr>
                  <th>Paire</th>
                  <th className="num">Trades</th>
                  <th className="num">Résultat brut</th>
                </tr>
              </thead>
              <tbody>
                {stats.parPaire.map((l) => (
                  <tr key={l.symbole} onClick={() => ouvrirSymbole(l.symbole)}>
                    <td>
                      <strong>{ticker(l.symbole)}</strong> <span className="muet">{nomSymbole(l.symbole)}</span>
                    </td>
                    <td className="num">{l.nb}</td>
                    <td className={`num ${l.net >= 0 ? 'hausse' : 'baisse'}`}>{formaterUsdt(l.net, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AnalyseAvancee portefeuille={p} />
          <ProjectionMonteCarlo portefeuille={p} challenge={challenge} />
        </>
      )}
    </div>
  );
}

/** Onglet « Historique » : toutes les opérations (ouvertures, clôtures), partage d'un trade en image. */
export function OngletHistorique({ p, ouvrirSymbole, partager }: { p: Portefeuille; ouvrirSymbole: (id: string) => void; partager: (o: Operation) => void }) {
  return (
    <>
      {p.archive && (
        <p className="muet petit archive-operations">
          {p.archive.operations.toLocaleString('fr-FR')} opérations plus anciennes (jusqu'au {new Date(p.archive.jusquAu).toLocaleDateString('fr-FR')}) sont résumées pour
          garder le compte léger : résultat {formaterUsdt(p.archive.resultat - p.archive.frais, true)} frais inclus, compté dans le P&amp;L réalisé.
        </p>
      )}
      {p.operations.length === 0 && <p className="vide">Aucune opération pour l'instant.</p>}
      {p.operations.length > 0 && (
        <div className="defilement-x">
          <table className="tableau-prix">
            <thead>
              <tr>
                <th>Date</th>
                <th>Paire</th>
                <th>Opération</th>
                <th className="num">Volume</th>
                <th className="num">Prix</th>
                <th className="num">Frais</th>
                <th className="num">Résultat</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {p.operations.map((o) => (
                <tr key={o.id} onClick={() => ouvrirSymbole(o.symbole)}>
                  <td className="muet">{dateCourte(o.date)}</td>
                  <td>
                    <strong>{ticker(o.symbole)}</strong>
                  </td>
                  <td className={o.sens === 'achat' ? 'hausse' : 'baisse'}>
                    {o.type === 'ouverture' ? 'Ouverture' : 'Clôture'} · {o.sens === 'achat' ? 'achat' : 'vente'}
                    {o.origine && o.origine !== 'marche' && <span className="note"> {ORIGINES[o.origine]}</span>}
                  </td>
                  <td className="num">{o.lots !== undefined ? formaterLots(o.lots) : formaterQuantite(o.quantite)}</td>
                  <td className="num">{formaterCotation(o.symbole, o.prix)}</td>
                  <td className="num muet">{formaterUsdt(o.frais)}</td>
                  <td className={`num ${o.resultat === undefined ? 'muet' : o.resultat >= 0 ? 'hausse' : 'baisse'}`}>
                    {o.resultat === undefined ? '—' : formaterUsdt(o.resultat, true)}
                    {o.type === 'cloture' && (
                      <button
                        className="lien discret bouton-partage"
                        title="Partager ce trade en image"
                        aria-label="Partager ce trade"
                        onClick={(e) => {
                          e.stopPropagation();
                          partager(o);
                        }}
                      >
                        ↗
                      </button>
                    )}
                  </td>
                  <td className="muet note-cellule" title={o.note}>{o.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
