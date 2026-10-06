import { useMemo, useState } from 'react';
import type { Etat, Sens } from '../types';
import type { Tick } from '../binance';
import { estBinance, formaterPrix, paireBinance } from '../binance';
import { CATALOGUE, nomSymbole, normaliser, ticker } from '../symboles';
import { TAUX_FRAIS, cloturer, formaterQuantite, formaterUsdt, ouvrir, pnlLatent, realiseTotal, reinitialiser, valeurPortefeuille } from '../trading';

interface Props {
  etat: Etat;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  ouvrirSymbole: (id: string) => void;
}

const CRYPTOS = CATALOGUE.filter((s) => s.id.startsWith('BINANCE:'));

function dateCourte(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function Trading({ etat, ticks, maj, ouvrirSymbole }: Props) {
  const p = etat.portefeuille;
  const [symbole, setSymbole] = useState(estBinance(etat.symbole) ? etat.symbole : 'BINANCE:BTCUSDT');
  const [montant, setMontant] = useState('1000');
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<'positions' | 'historique'>('positions');

  const paire = paireBinance(normaliser(symbole) || symbole);
  const prix = ticks[paire]?.prix;
  const montantNum = Number(montant.replace(/\s/g, '').replace(',', '.'));
  const quantite = prix && montantNum > 0 ? montantNum / prix : 0;
  const frais = montantNum > 0 ? montantNum * TAUX_FRAIS : 0;

  const { capital, latent, immobilise } = useMemo(() => valeurPortefeuille(p, ticks), [p, ticks]);
  const realise = useMemo(() => realiseTotal(p), [p]);
  const performanceBrute = ((capital - p.capitalInitial) / p.capitalInitial) * 100;
  const performance = Math.abs(performanceBrute) < 0.005 ? 0 : performanceBrute;

  const passerOrdre = (sens: Sens) => {
    const id = normaliser(symbole);
    if (!estBinance(id)) {
      setErreur('Le trading papier fonctionne avec les paires Binance (ex. BTCUSDT).');
      return;
    }
    if (!prix) {
      setErreur('Prix en direct indisponible pour cette paire, patientez une seconde.');
      return;
    }
    const resultat = ouvrir(p, id, sens, quantite, prix);
    if (typeof resultat === 'string') {
      setErreur(resultat);
      return;
    }
    setErreur(null);
    maj({ portefeuille: resultat });
  };

  const fermer = (positionId: string) => {
    const position = p.positions.find((x) => x.id === positionId);
    const prixActuel = position ? ticks[paireBinance(position.symbole)]?.prix : undefined;
    if (!prixActuel) {
      setErreur('Prix en direct indisponible, impossible de clôturer pour le moment.');
      return;
    }
    const resultat = cloturer(p, positionId, prixActuel);
    if (typeof resultat === 'string') setErreur(resultat);
    else maj({ portefeuille: resultat });
  };

  const toutFermer = () => {
    let courant = p;
    for (const pos of p.positions) {
      const prixActuel = ticks[paireBinance(pos.symbole)]?.prix;
      if (!prixActuel) continue;
      const r = cloturer(courant, pos.id, prixActuel);
      if (typeof r !== 'string') courant = r;
    }
    maj({ portefeuille: courant });
  };

  const remettreAZero = () => {
    if (window.confirm('Réinitialiser le portefeuille papier à 100 000 USDT ? Positions et historique seront effacés.')) {
      maj({ portefeuille: reinitialiser() });
    }
  };

  return (
    <div className="page defilable trading">
      <div className="kpis">
        <div className="kpi">
          <span>Capital total</span>
          <strong>{formaterUsdt(capital)}</strong>
          <em className={performance >= 0 ? 'hausse' : 'baisse'}>
            {performance >= 0 ? '+' : ''}
            {performance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % depuis le départ
          </em>
        </div>
        <div className="kpi">
          <span>Disponible</span>
          <strong>{formaterUsdt(p.solde)}</strong>
          <em className="muet">{formaterUsdt(immobilise)} en positions</em>
        </div>
        <div className="kpi">
          <span>P&amp;L latent</span>
          <strong className={latent >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(latent, true)}</strong>
          <em className="muet">
            {p.positions.length} position{p.positions.length > 1 ? 's' : ''} ouverte{p.positions.length > 1 ? 's' : ''}
          </em>
        </div>
        <div className="kpi">
          <span>P&amp;L réalisé (frais inclus)</span>
          <strong className={realise >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(realise, true)}</strong>
          <em className="muet">{p.operations.filter((o) => o.type === 'cloture').length} clôture(s)</em>
        </div>
      </div>

      <div className="grille-trading">
        <div className="carte formulaire-ordre">
          <h3>Ordre au marché</h3>
          <label>
            Paire
            <div className="champ-double">
              <input list="paires-trading" value={symbole} onChange={(e) => setSymbole(e.target.value.toUpperCase())} />
              <datalist id="paires-trading">
                {CRYPTOS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </datalist>
              <span className="prix-direct">{prix ? formaterPrix(prix) : '…'}</span>
            </div>
          </label>
          <label>
            Montant (USDT)
            <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
          </label>
          <div className="puces">
            {[100, 500, 1000, 5000].map((m) => (
              <button type="button" key={m} onClick={() => setMontant(String(m))}>
                {m.toLocaleString('fr-FR')}
              </button>
            ))}
            <button type="button" onClick={() => setMontant(String(Math.floor(p.solde / (1 + TAUX_FRAIS))))}>
              Max
            </button>
          </div>
          <dl className="recap-ordre">
            <div>
              <dt>Quantité estimée</dt>
              <dd>
                {quantite ? formaterQuantite(quantite) : '…'} {ticker(paire).replace(/USDT$|USDC$|BUSD$/, '')}
              </dd>
            </div>
            <div>
              <dt>Frais (0,1 %)</dt>
              <dd>{formaterUsdt(frais)}</dd>
            </div>
          </dl>
          {erreur && <p className="erreur">{erreur}</p>}
          <div className="boutons-ordre">
            <button className="bouton-achat" onClick={() => passerOrdre('achat')} disabled={!prix || !(montantNum > 0)}>
              Acheter / Long
            </button>
            <button className="bouton-vente" onClick={() => passerOrdre('vente')} disabled={!prix || !(montantNum > 0)}>
              Vendre / Short
            </button>
          </div>
          <p className="muet petit">Portefeuille virtuel : aucun ordre réel n'est transmis. Prix d'exécution = dernier prix Binance.</p>
        </div>

        <div className="carte">
          <div className="onglets onglets-carte">
            <button className={onglet === 'positions' ? 'actif' : ''} onClick={() => setOnglet('positions')}>
              Positions ({p.positions.length})
            </button>
            <button className={onglet === 'historique' ? 'actif' : ''} onClick={() => setOnglet('historique')}>
              Historique ({p.operations.length})
            </button>
            <div className="outils-onglets">
              {onglet === 'positions' && p.positions.length > 0 && (
                <button className="bouton-secondaire" onClick={toutFermer}>
                  Tout clôturer
                </button>
              )}
              <button className="bouton-secondaire" onClick={remettreAZero}>
                Réinitialiser
              </button>
            </div>
          </div>

          {onglet === 'positions' && (
            <>
              {p.positions.length === 0 && <p className="vide">Aucune position ouverte. Passez un ordre à gauche.</p>}
              {p.positions.length > 0 && (
                <div className="defilement-x">
<table className="tableau-prix">
                  <thead>
                    <tr>
                      <th>Paire</th>
                      <th>Sens</th>
                      <th className="num">Quantité</th>
                      <th className="num">Entrée</th>
                      <th className="num">Actuel</th>
                      <th className="num">P&amp;L</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.positions.map((pos) => {
                      const actuel = ticks[paireBinance(pos.symbole)]?.prix;
                      const pnl = actuel ? pnlLatent(pos, actuel) : null;
                      const pct = pnl !== null ? (pnl / pos.cout) * 100 : null;
                      return (
                        <tr key={pos.id}>
                          <td onClick={() => ouvrirSymbole(pos.symbole)}>
                            <strong>{ticker(pos.symbole)}</strong> <span className="muet">{nomSymbole(pos.symbole)}</span>
                          </td>
                          <td className={pos.sens === 'achat' ? 'hausse' : 'baisse'}>{pos.sens === 'achat' ? 'Long' : 'Short'}</td>
                          <td className="num">{formaterQuantite(pos.quantite)}</td>
                          <td className="num">{formaterPrix(pos.prixEntree)}</td>
                          <td className="num">{actuel ? formaterPrix(actuel) : '…'}</td>
                          <td className={`num ${pnl === null ? '' : pnl >= 0 ? 'hausse' : 'baisse'}`}>
                            {pnl === null ? '…' : `${formaterUsdt(pnl, true)} (${pct! >= 0 ? '+' : ''}${pct!.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`}
                          </td>
                          <td className="num">
                            <button className="lien" onClick={() => fermer(pos.id)}>
                              Clôturer
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
          )}

          {onglet === 'historique' && (
            <>
              {p.operations.length === 0 && <p className="vide">Aucune opération pour l'instant.</p>}
              {p.operations.length > 0 && (
                <div className="defilement-x">
<table className="tableau-prix">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Paire</th>
                      <th>Opération</th>
                      <th className="num">Quantité</th>
                      <th className="num">Prix</th>
                      <th className="num">Frais</th>
                      <th className="num">Résultat</th>
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
                        </td>
                        <td className="num">{formaterQuantite(o.quantite)}</td>
                        <td className="num">{formaterPrix(o.prix)}</td>
                        <td className="num muet">{formaterUsdt(o.frais)}</td>
                        <td className={`num ${o.resultat === undefined ? 'muet' : o.resultat >= 0 ? 'hausse' : 'baisse'}`}>
                          {o.resultat === undefined ? '—' : formaterUsdt(o.resultat, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
