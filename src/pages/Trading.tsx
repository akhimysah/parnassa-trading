import { useMemo, useState } from 'react';
import type { Etat, Sens } from '../types';
import type { Tick } from '../binance';
import { estBinance, formaterPrix, paireBinance } from '../binance';
import { CATALOGUE, nomSymbole, normaliser, ticker } from '../symboles';
import {
  annoterOperation,
  annoterPosition,
  annulerOrdre,
  cloturer,
  formaterQuantite,
  formaterUsdt,
  modifierProtections,
  ouvrir,
  placerOrdre,
  pnlLatent,
  montantParRisque,
  realiseTotal,
  reinitialiser,
  statistiques,
  valeurPortefeuille,
} from '../trading';
import { horodatageFichier, telecharger, versCsv } from '../export';
import { CourbeCapital } from '../composants/CourbeCapital';
import { IconeCroix, IconeTelecharger } from '../composants/Icones';

interface Props {
  etat: Etat;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  ouvrirSymbole: (id: string) => void;
}

type TypeOrdre = 'marche' | 'limite' | 'stop';
type Onglet = 'positions' | 'ordres' | 'historique' | 'journal' | 'statistiques';

const CRYPTOS = CATALOGUE.filter((s) => s.id.startsWith('BINANCE:'));
const ORIGINES: Record<string, string> = { marche: 'marché', limite: 'limite', stop: 'stop', 'stop-loss': 'stop-loss', 'take-profit': 'take-profit' };

function dateCourte(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function nombre(texte: string): number | undefined {
  const propre = texte.replace(/\s/g, '').replace(',', '.');
  if (!propre) return undefined;
  const v = Number(propre);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function Trading({ etat, ticks, maj, ouvrirSymbole }: Props) {
  const p = etat.portefeuille;
  const TAUX_FRAIS = etat.parametres.frais;
  const [risque, setRisque] = useState('1');
  const [note, setNote] = useState('');
  const [clotureEnCours, setClotureEnCours] = useState<string | null>(null);
  const [quantiteCloture, setQuantiteCloture] = useState('');
  const [symbole, setSymbole] = useState(estBinance(etat.symbole) ? etat.symbole : 'BINANCE:BTCUSDT');
  const [typeOrdre, setTypeOrdre] = useState<TypeOrdre>('marche');
  const [prixOrdre, setPrixOrdre] = useState('');
  const [montant, setMontant] = useState('1000');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [protections, setProtections] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('positions');

  const paire = paireBinance(normaliser(symbole) || symbole);
  const prix = ticks[paire]?.prix;
  const montantNum = nombre(montant) ?? 0;
  const prixReference = typeOrdre === 'marche' ? prix : nombre(prixOrdre);
  const quantite = prixReference && montantNum > 0 ? montantNum / prixReference : 0;
  const frais = montantNum > 0 ? montantNum * TAUX_FRAIS : 0;

  const { capital, latent, immobilise } = useMemo(() => valeurPortefeuille(p, ticks), [p, ticks]);
  const realise = useMemo(() => realiseTotal(p), [p]);
  const stats = useMemo(() => statistiques(p), [p]);

  const slNum = protections ? nombre(stopLoss) : undefined;
  const risqueNum = nombre(risque);
  const prixEntreePrevu = typeOrdre === 'marche' ? prix : nombre(prixOrdre);
  const perteSiStop = slNum && prixEntreePrevu && quantite ? Math.abs(prixEntreePrevu - slNum) * quantite : null;
  const montantConseille = slNum && prixEntreePrevu && risqueNum ? montantParRisque((risqueNum / 100) * capital, prixEntreePrevu, slNum) : null;

  const exporterHistorique = () => {
    const lignes = p.operations
      .slice()
      .reverse()
      .map((o) => [
        new Date(o.date).toLocaleString('fr-FR'),
        ticker(o.symbole),
        o.type === 'ouverture' ? 'Ouverture' : 'Clôture',
        o.sens,
        ORIGINES[o.origine ?? 'marche'],
        o.quantite,
        o.prix,
        o.frais,
        o.resultat ?? '',
      ]);
    telecharger(
      `parnassa-trading-historique-${horodatageFichier()}.csv`,
      versCsv(['Date', 'Paire', 'Opération', 'Sens', 'Origine', 'Quantité', 'Prix', 'Frais (USDT)', 'Résultat (USDT)'], lignes),
      'text/csv;charset=utf-8',
    );
  };
  const performanceBrute = ((capital - p.capitalInitial) / p.capitalInitial) * 100;
  const performance = Math.abs(performanceBrute) < 0.005 ? 0 : performanceBrute;

  const prot = () => ({
    stopLoss: protections ? nombre(stopLoss) : undefined,
    takeProfit: protections ? nombre(takeProfit) : undefined,
    note: note.trim() || undefined,
  });

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
    let resultat;
    if (typeOrdre === 'marche') {
      resultat = ouvrir(p, id, sens, quantite, prix, prot(), 'marche', TAUX_FRAIS);
    } else {
      const prixCible = nombre(prixOrdre);
      if (!prixCible) {
        setErreur('Indiquez le prix de déclenchement.');
        return;
      }
      resultat = placerOrdre(p, { symbole: id, sens, type: typeOrdre, prix: prixCible, montant: montantNum, ...prot() }, prix, TAUX_FRAIS);
    }
    if (typeof resultat === 'string') {
      setErreur(resultat);
      return;
    }
    setErreur(null);
    maj({ portefeuille: resultat });
    setNote('');
    if (typeOrdre !== 'marche') setOnglet('ordres');
  };

  const appliquer = (resultat: ReturnType<typeof cloturer>) => {
    if (typeof resultat === 'string') setErreur(resultat);
    else {
      setErreur(null);
      maj({ portefeuille: resultat });
    }
  };

  const fermer = (positionId: string, quantite?: number) => {
    const position = p.positions.find((x) => x.id === positionId);
    const prixActuel = position ? ticks[paireBinance(position.symbole)]?.prix : undefined;
    if (!prixActuel) {
      setErreur('Prix en direct indisponible, impossible de clôturer pour le moment.');
      return;
    }
    appliquer(cloturer(p, positionId, prixActuel, 'marche', TAUX_FRAIS, quantite));
    setClotureEnCours(null);
    setQuantiteCloture('');
  };

  const editerNotePosition = (positionId: string) => {
    const position = p.positions.find((x) => x.id === positionId);
    if (!position) return;
    const n = window.prompt('Note de journal pour cette position :', position.note ?? '');
    if (n === null) return;
    maj({ portefeuille: annoterPosition(p, positionId, n) });
  };

  const editerNoteOperation = (operationId: string) => {
    const o = p.operations.find((x) => x.id === operationId);
    if (!o) return;
    const n = window.prompt('Note de journal pour ce trade :', o.note ?? '');
    if (n === null) return;
    maj({ portefeuille: annoterOperation(p, operationId, n) });
  };

  const journal = p.operations.filter((o) => o.type === 'cloture');
  const exporterJournal = () => {
    telecharger(
      `parnassa-trading-journal-${horodatageFichier()}.csv`,
      versCsv(
        ['Date', 'Paire', 'Sens', 'Quantité', 'Entrée', 'Sortie', 'Résultat (USDT)', 'Frais (USDT)', 'Origine', 'Note'],
        journal
          .slice()
          .reverse()
          .map((o) => [
            new Date(o.date).toLocaleString('fr-FR'),
            ticker(o.symbole),
            o.sens === 'vente' ? 'Long' : 'Short',
            o.quantite,
            o.prixEntree ?? '',
            o.prix,
            o.resultat ?? '',
            o.frais,
            ORIGINES[o.origine ?? 'marche'],
            o.note ?? '',
          ]),
      ),
      'text/csv;charset=utf-8',
    );
  };

  const toutFermer = () => {
    let courant = p;
    for (const pos of p.positions) {
      const prixActuel = ticks[paireBinance(pos.symbole)]?.prix;
      if (!prixActuel) continue;
      const r = cloturer(courant, pos.id, prixActuel, 'marche', TAUX_FRAIS);
      if (typeof r !== 'string') courant = r;
    }
    maj({ portefeuille: courant });
  };

  const editerProtections = (positionId: string) => {
    const position = p.positions.find((x) => x.id === positionId);
    if (!position) return;
    const sl = window.prompt('Stop-loss (vide pour aucun) :', position.stopLoss ? String(position.stopLoss) : '');
    if (sl === null) return;
    const tp = window.prompt('Take-profit (vide pour aucun) :', position.takeProfit ? String(position.takeProfit) : '');
    if (tp === null) return;
    appliquer(modifierProtections(p, positionId, { stopLoss: nombre(sl), takeProfit: nombre(tp) }));
  };

  const remettreAZero = () => {
    if (window.confirm('Réinitialiser le portefeuille papier à 100 000 USDT ? Positions, ordres et historique seront effacés.')) {
      maj({ portefeuille: reinitialiser(p.capitalInitial) });
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
            {p.positions.length} position{p.positions.length > 1 ? 's' : ''} · {p.ordres.length} ordre{p.ordres.length > 1 ? 's' : ''} en attente
          </em>
        </div>
        <div className="kpi">
          <span>P&amp;L réalisé (frais inclus)</span>
          <strong className={realise >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(realise, true)}</strong>
          <em className="muet">{p.operations.filter((o) => o.type === 'cloture').length} clôture(s)</em>
        </div>
      </div>

      <div className="carte">
        <h3>Évolution du capital</h3>
        <CourbeCapital points={p.historiqueCapital} capitalInitial={p.capitalInitial} courant={capital} />
      </div>

      <div className="grille-trading">
        <div className="carte formulaire-ordre">
          <h3>Nouvel ordre</h3>
          <div className="segmente trois">
            {(['marche', 'limite', 'stop'] as TypeOrdre[]).map((t) => (
              <button key={t} type="button" className={typeOrdre === t ? 'actif neutre' : ''} onClick={() => setTypeOrdre(t)}>
                {t === 'marche' ? 'Marché' : t === 'limite' ? 'Limite' : 'Stop'}
              </button>
            ))}
          </div>
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
          {typeOrdre !== 'marche' && (
            <label>
              {typeOrdre === 'limite' ? 'Prix limite' : 'Prix de déclenchement (stop)'}
              <input inputMode="decimal" value={prixOrdre} onChange={(e) => setPrixOrdre(e.target.value)} placeholder={prix ? formaterPrix(prix) : ''} />
              <span className="aide">
                {typeOrdre === 'limite'
                  ? 'Achat sous le prix actuel, vente au-dessus : exécuté au prix limite.'
                  : 'Achat au-dessus du prix actuel, vente en dessous : exécuté au marché au franchissement.'}
              </span>
            </label>
          )}
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
          <label className="case">
            <input type="checkbox" checked={protections} onChange={(e) => setProtections(e.target.checked)} />
            Stop-loss / take-profit
          </label>
          {protections && (
            <>
              <div className="champs-protection">
                <label>
                  Stop-loss
                  <input inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="prix" />
                </label>
                <label>
                  Take-profit
                  <input inputMode="decimal" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="prix" />
                </label>
              </div>
              <div className="dimensionnement">
                <label>
                  Risque par trade
                  <span className="champ-unite">
                    <input inputMode="decimal" value={risque} onChange={(e) => setRisque(e.target.value)} />
                    % du capital
                  </span>
                </label>
                <button
                  type="button"
                  className="bouton-secondaire"
                  disabled={!montantConseille}
                  onClick={() => montantConseille && setMontant(String(Math.floor(Math.min(montantConseille, p.solde / (1 + TAUX_FRAIS)))))}
                  title="Calcule le montant pour que la perte au stop-loss corresponde au risque choisi"
                >
                  Dimensionner
                </button>
                <span className="aide">
                  {perteSiStop !== null
                    ? `Perte si stop touché : ${formaterUsdt(perteSiStop)} (${((perteSiStop / capital) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % du capital)`
                    : 'Renseignez un stop-loss pour calculer la taille de position.'}
                </span>
              </div>
            </>
          )}
          <label>
            Note de journal (facultatif)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. cassure de résistance, objectif 2R" />
          </label>
          <dl className="recap-ordre">
            <div>
              <dt>Quantité estimée</dt>
              <dd>
                {quantite ? formaterQuantite(quantite) : '…'} {ticker(paire).replace(/USDT$|USDC$|BUSD$/, '')}
              </dd>
            </div>
            <div>
              <dt>Frais ({(TAUX_FRAIS * 100).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %)</dt>
              <dd>{formaterUsdt(frais)}</dd>
            </div>
          </dl>
          {erreur && <p className="erreur">{erreur}</p>}
          <div className="boutons-ordre">
            <button className="bouton-achat" onClick={() => passerOrdre('achat')} disabled={!prix || !(montantNum > 0)}>
              {typeOrdre === 'marche' ? 'Acheter / Long' : 'Ordre d’achat'}
            </button>
            <button className="bouton-vente" onClick={() => passerOrdre('vente')} disabled={!prix || !(montantNum > 0)}>
              {typeOrdre === 'marche' ? 'Vendre / Short' : 'Ordre de vente'}
            </button>
          </div>
          <p className="muet petit">Portefeuille virtuel : aucun ordre réel n'est transmis. Les ordres en attente et les protections sont surveillés tant que l'application est ouverte.</p>
        </div>

        <div className="carte">
          <div className="onglets onglets-carte">
            <button className={onglet === 'positions' ? 'actif' : ''} onClick={() => setOnglet('positions')}>
              Positions ({p.positions.length})
            </button>
            <button className={onglet === 'ordres' ? 'actif' : ''} onClick={() => setOnglet('ordres')}>
              Ordres ({p.ordres.length})
            </button>
            <button className={onglet === 'historique' ? 'actif' : ''} onClick={() => setOnglet('historique')}>
              Historique ({p.operations.length})
            </button>
            <button className={onglet === 'journal' ? 'actif' : ''} onClick={() => setOnglet('journal')}>
              Journal ({journal.length})
            </button>
            <button className={onglet === 'statistiques' ? 'actif' : ''} onClick={() => setOnglet('statistiques')}>
              Statistiques
            </button>
            <div className="outils-onglets">
              {onglet === 'journal' && journal.length > 0 && (
                <button className="bouton-secondaire avec-icone" onClick={exporterJournal} title="Exporter le journal en CSV">
                  <IconeTelecharger width={14} height={14} /> CSV
                </button>
              )}
              {onglet === 'historique' && p.operations.length > 0 && (
                <button className="bouton-secondaire avec-icone" onClick={exporterHistorique} title="Exporter l'historique en CSV">
                  <IconeTelecharger width={14} height={14} /> CSV
                </button>
              )}
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
                        <th className="num">SL / TP</th>
                        <th>Note</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.positions.map((pos) => {
                        const actuel = ticks[paireBinance(pos.symbole)]?.prix;
                        const pnl = actuel ? pnlLatent(pos, actuel) : null;
                        const pct = pnl !== null ? (pnl / pos.cout) * 100 : null;
                        const enCloture = clotureEnCours === pos.id;
                        const qCloture = nombre(quantiteCloture);
                        return (
                          <>
                          <tr key={pos.id} className={enCloture ? 'selectionnee' : ''}>
                            <td onClick={() => ouvrirSymbole(pos.symbole)}>
                              <strong>{ticker(pos.symbole)}</strong> <span className="muet">{nomSymbole(pos.symbole)}</span>
                            </td>
                            <td className={pos.sens === 'achat' ? 'hausse' : 'baisse'}>{pos.sens === 'achat' ? 'Long' : 'Short'}</td>
                            <td className="num">{formaterQuantite(pos.quantite)}</td>
                            <td className="num">{formaterPrix(pos.prixEntree)}</td>
                            <td className="num">{actuel ? formaterPrix(actuel) : '…'}</td>
                            <td className={`num ${pnl === null ? '' : pnl >= 0 ? 'hausse' : 'baisse'}`}>
                              {pnl === null
                                ? '…'
                                : `${formaterUsdt(pnl, true)} (${pct! >= 0 ? '+' : ''}${pct!.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`}
                            </td>
                            <td className="num">
                              <button className="lien discret" onClick={() => editerProtections(pos.id)} title="Modifier stop-loss et take-profit">
                                {pos.stopLoss ? formaterPrix(pos.stopLoss) : '—'} / {pos.takeProfit ? formaterPrix(pos.takeProfit) : '—'}
                              </button>
                            </td>
                            <td>
                              <button className="lien discret note-cellule" onClick={() => editerNotePosition(pos.id)} title={pos.note ?? 'Ajouter une note'}>
                                {pos.note ? pos.note : '＋ note'}
                              </button>
                            </td>
                            <td className="num">
                              <button
                                className="lien"
                                onClick={() => {
                                  setClotureEnCours(enCloture ? null : pos.id);
                                  setQuantiteCloture('');
                                }}
                              >
                                {enCloture ? 'Annuler' : 'Clôturer'}
                              </button>
                            </td>
                          </tr>
                          {enCloture && (
                            <tr key={`${pos.id}-cloture`} className="ligne-cloture">
                              <td colSpan={9}>
                                <div className="panneau-cloture">
                                  <span className="muet">Clôturer</span>
                                  {[25, 50, 75].map((pct) => (
                                    <button key={pct} className="bouton-secondaire" onClick={() => fermer(pos.id, (pos.quantite * pct) / 100)}>
                                      {pct} %
                                    </button>
                                  ))}
                                  <button className="bouton-principal" onClick={() => fermer(pos.id)}>
                                    Tout (100 %)
                                  </button>
                                  <span className="muet">ou</span>
                                  <input
                                    inputMode="decimal"
                                    value={quantiteCloture}
                                    onChange={(e) => setQuantiteCloture(e.target.value)}
                                    placeholder={`quantité ≤ ${formaterQuantite(pos.quantite)}`}
                                  />
                                  <button className="bouton-secondaire" disabled={!qCloture || qCloture > pos.quantite} onClick={() => qCloture && fermer(pos.id, qCloture)}>
                                    Clôturer la quantité
                                  </button>
                                  {actuel && qCloture && qCloture <= pos.quantite && (
                                    <span className="muet">
                                      ≈ {formaterUsdt(qCloture * actuel)} · P&amp;L {formaterUsdt((actuel - pos.prixEntree) * qCloture * (pos.sens === 'achat' ? 1 : -1), true)}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {onglet === 'ordres' && (
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
                        <th className="num">Montant</th>
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
                              {o.type === 'limite' ? 'Limite' : 'Stop'} · {o.sens === 'achat' ? 'achat' : 'vente'}
                            </td>
                            <td className="num">
                              {formaterPrix(o.prix)}
                              {distance !== null && (
                                <span className="muet"> ({distance > 0 ? '+' : ''}{distance.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)</span>
                              )}
                            </td>
                            <td className="num">{actuel ? formaterPrix(actuel) : '…'}</td>
                            <td className="num">{formaterUsdt(o.montant)}</td>
                            <td className="num muet">
                              {o.stopLoss ? formaterPrix(o.stopLoss) : '—'} / {o.takeProfit ? formaterPrix(o.takeProfit) : '—'}
                            </td>
                            <td className="num">
                              <button className="icone petit" aria-label="Annuler l'ordre" onClick={() => maj({ portefeuille: annulerOrdre(p, o.id) })}>
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
          )}

          {onglet === 'journal' && (
            <>
              {journal.length === 0 && <p className="vide">Le journal se remplit à chaque clôture : résultat, prix d'entrée et de sortie, et vos notes.</p>}
              {journal.length > 0 && (
                <ul className="journal">
                  {journal.map((o) => {
                    const pct = o.prixEntree ? ((o.resultat ?? 0) / (o.prixEntree * o.quantite)) * 100 : null;
                    return (
                      <li key={o.id}>
                        <div className="journal-entete">
                          <button className="lien" onClick={() => ouvrirSymbole(o.symbole)}>
                            <strong>{ticker(o.symbole)}</strong>
                          </button>
                          <span className={o.sens === 'vente' ? 'hausse' : 'baisse'}>{o.sens === 'vente' ? 'Long' : 'Short'}</span>
                          <span className="muet">{dateCourte(o.date)}</span>
                          {o.origine && o.origine !== 'marche' && <span className="note">{ORIGINES[o.origine]}</span>}
                          <div className="espace" />
                          <strong className={(o.resultat ?? 0) >= 0 ? 'hausse' : 'baisse'}>
                            {formaterUsdt(o.resultat ?? 0, true)}
                            {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`}
                          </strong>
                        </div>
                        <div className="journal-detail muet">
                          {formaterQuantite(o.quantite)} · entrée {o.prixEntree ? formaterPrix(o.prixEntree) : '—'} → sortie {formaterPrix(o.prix)} · frais {formaterUsdt(o.frais)}
                        </div>
                        <button className="journal-note" onClick={() => editerNoteOperation(o.id)}>
                          {o.note ? o.note : 'Ajouter une note de journal…'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {onglet === 'statistiques' && (
            <div className="statistiques">
              {stats.nbTrades === 0 && <p className="vide">Les statistiques apparaîtront après votre première clôture.</p>}
              {stats.nbTrades > 0 && (
                <>
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
                </>
              )}
            </div>
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
                          <td className="num">{formaterQuantite(o.quantite)}</td>
                          <td className="num">{formaterPrix(o.prix)}</td>
                          <td className="num muet">{formaterUsdt(o.frais)}</td>
                          <td className={`num ${o.resultat === undefined ? 'muet' : o.resultat >= 0 ? 'hausse' : 'baisse'}`}>
                            {o.resultat === undefined ? '—' : formaterUsdt(o.resultat, true)}
                          </td>
                          <td className="muet note-cellule" title={o.note}>{o.note ?? ''}</td>
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
