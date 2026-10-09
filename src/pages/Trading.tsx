import { Fragment, useMemo, useState } from 'react';
import type { Etat, Sens } from '../types';
import type { Tick } from '../binance';
import { estBinance, paireBinance, useFluxBinance } from '../binance';
import {
  LEVIERS,
  LOT_MAX,
  VOLUMES_MAX,
  LOT_MIN,
  cleCotation,
  estNegociable,
  formaterCotation,
  instrument,
  libelleUnite,
  normaliserLots,
  pasDePrix,
  symbolesConversion,
  tailleContrat,
  useCotationsScanner,
  conversionUsd,
} from '../instruments';
import { SelecteurInstrument } from '../composants/SelecteurInstrument';
import { PrixAnime } from '../composants/PrixAnime';
import { CalendrierTrades } from '../composants/CalendrierTrades';
import { ClassementTraders } from '../composants/ClassementTraders';
import { BarreCompte, capitalDemande, FenetreComptes } from '../composants/ComptesTrading';
import type { GestionCompte } from '../comptes';
import { PanneauChallenge } from '../composants/PanneauChallenge';
import { annonceBloquante, devisesInstrument, formuleSuivante, reglesCompletes } from '../challenge';
import { useCalendrier } from '../actualites';
import { ouvrirCompte, type Acces } from '../comptes';
import { cloturerPositions } from '../ordre';
import { nomSymbole, ticker } from '../symboles';
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
  engagement,
  formaterLots,
  lotsMax,
  lotsParRisque,
  tauxFrais,
  realiseTotal,
  reinitialiser,
  PERTE_CRAME,
  statistiques,
  valeurPortefeuille,
} from '../trading';
import { horodatageFichier, telecharger, versCsv } from '../export';
import { CourbeCapital } from '../composants/CourbeCapital';
import { Repartition, type Part } from '../composants/Repartition';
import { IconeCroix, IconeTelecharger } from '../composants/Icones';

interface Props {
  etat: Etat;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  ouvrirSymbole: (id: string) => void;
  compte: GestionCompte;
  lie: boolean;
  signaler: (m: string) => void;
}

type TypeOrdre = 'marche' | 'limite' | 'stop';
type Onglet = 'positions' | 'ordres' | 'historique' | 'journal' | 'statistiques';

/** Montants très longs (milliards) : chiffres un peu plus petits pour tenir sur une ligne. */
const classeKpi = (texte: string) => (texte.length > 22 ? 'tres-long' : texte.length > 17 ? 'long' : '');

const ORIGINES: Record<string, string> = { marche: 'marché', limite: 'limite', stop: 'stop', 'stop-loss': 'stop-loss', 'take-profit': 'take-profit', 'stop-out': 'stop-out', crame: 'compte cramé' };

function dateCourte(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function nombre(texte: string): number | undefined {
  const propre = texte.replace(/\s/g, '').replace(',', '.');
  if (!propre) return undefined;
  const v = Number(propre);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function Trading({ etat, ticks, maj: majBrut, ouvrirSymbole, compte, lie, signaler }: Props) {
  // Un lien ?capital=… ouvre directement « Comptes et accès » avec ce montant.
  const [comptesOuverts, setComptesOuverts] = useState(() => capitalDemande() !== null);
  const session = compte.session;
  const lecture = Boolean(session?.lecture);
  // Accès investisseur : on regarde le compte, sans pouvoir y toucher.
  const maj = (p: Partial<Etat>) => {
    if (lecture && ('portefeuille' in p || 'challenge' in p)) {
      setErreur('Accès investisseur : lecture seule, aucun ordre ni modification possible.');
      return;
    }
    majBrut(p);
  };
  const p = etat.portefeuille;
  const TAUX_FRAIS = etat.parametres.frais;
  const [risque, setRisque] = useState('1');
  const [note, setNote] = useState('');
  const [clotureEnCours, setClotureEnCours] = useState<string | null>(null);
  const [quantiteCloture, setQuantiteCloture] = useState('');
  const [symbole, setSymbole] = useState(estNegociable(etat.symbole) ? etat.symbole : 'OANDA:XAUUSD');
  const [typeOrdre, setTypeOrdre] = useState<TypeOrdre>('marche');
  const [prixOrdre, setPrixOrdre] = useState('');
  const [lots, setLots] = useState('0.10');
  const levier = etat.parametres.levier;
  /** Volume maximal par ordre : 500 lots par défaut, plus pour les très gros comptes (Paramètres de l'ordre). */
  const volumeMax = etat.parametres.volumeMax ?? LOT_MAX;
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [protections, setProtections] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('positions');

  const paire = cleCotation(symbole);
  // Prix de l'instrument choisi, même s'il n'est encore dans aucune position.
  const fluxLocal = useFluxBinance(estBinance(symbole) ? [paire] : []);
  const scannerLocal = useCotationsScanner([symbole, ...symbolesConversion([symbole])]);
  const prix = (ticks[paire] ?? fluxLocal[paire] ?? scannerLocal[paire])?.prix;
  const infoInstrument = instrument(symbole);

  // Règle des news du challenge : pas d'ouverture autour des annonces à fort impact sur les devises de l'instrument.
  const minutesNews = etat.challenge?.statut === 'en-cours' ? (reglesCompletes(etat.challenge.regles).newsMinutes ?? 0) : 0;
  const { evenements } = useCalendrier(minutesNews > 0);
  const devisesOrdre = devisesInstrument(infoInstrument?.code ?? symbole.split(':').pop() ?? '', infoInstrument?.devise);
  const annonceEnCours = minutesNews > 0 ? annonceBloquante(evenements, devisesOrdre, minutesNews) : undefined;
  const annonceProche =
    minutesNews > 0 ? evenements.filter((e) => e.importance >= 1 && devisesOrdre.includes(e.devise) && e.date > Date.now() && e.date - Date.now() < 30 * 60000).sort((a, b) => a.date - b.date)[0] : undefined;
  const [accesPhase, setAccesPhase] = useState<{ acces: Acces & { serveur: string }; nom: string } | null>(null);

  /** Compte challenge réussi en phase 1 : ouverture du compte de la phase 2, accès affichés, connexion directe. */
  const ouvrirPhaseSuivante = async () => {
    const actuel = session?.compte;
    const suivante = actuel?.regles ? formuleSuivante(actuel.regles.formule) : undefined;
    if (!actuel || !suivante) return;
    if (!window.confirm(`Ouvrir votre compte ${suivante.nom} de ${actuel.capital.toLocaleString('fr-FR')} $ ?\n\nVous recevez de nouveaux accès et êtes connecté directement.`)) return;
    const r = await ouvrirCompte({ type: 'challenge', capital: actuel.capital, nom: `${suivante.nom}`, regles: { formule: suivante.nom, ...suivante.regles } });
    if (typeof r === 'string') {
      window.alert(r);
      return;
    }
    const err = await compte.connecterProprietaire(r.compte.login);
    if (err) window.alert(err);
    setAccesPhase({ acces: { ...r.acces, serveur: r.compte.serveur }, nom: r.compte.nom });
    setComptesOuverts(true);
  };
  const ticksSelecteur = useMemo(() => ({ ...scannerLocal, ...fluxLocal, ...ticks }), [scannerLocal, fluxLocal, ticks]);
  const lotsNum = nombre(lots.replace(',', '.')) ?? 0;
  const lotsValides = lotsNum >= LOT_MIN && lotsNum <= volumeMax;
  const prixReference = typeOrdre === 'marche' ? prix : nombre(prixOrdre);
  const calcul = prixReference && lotsValides ? engagement(symbole, lotsNum, prixReference, levier, ticksSelecteur, TAUX_FRAIS) : null;
  const quantite = calcul?.unites ?? 0;
  const pas = prixReference ? pasDePrix(symbole, prixReference) : null;
  const valeurPas = pas && lotsValides ? pas.pas * lotsNum * tailleContrat(symbole) * conversionUsd(symbole, ticksSelecteur) : null;
  const maxLots = prix ? lotsMax(p, symbole, prixReference ?? prix, levier, ticksSelecteur, TAUX_FRAIS, volumeMax) : 0;
  const ajusterLots = (delta: number) => setLots(normaliserLots((lotsNum || 0) + delta, volumeMax).toFixed(2));

  const { capital, latent, immobilise, niveauMarge } = useMemo(() => valeurPortefeuille(p, ticks), [p, ticks]);
  const perteCompte = p.capitalInitial > 0 ? Math.max(0, 1 - capital / p.capitalInitial) : 0;
  const realise = useMemo(() => realiseTotal(p), [p]);
  const stats = useMemo(() => statistiques(p), [p]);

  // Répartition : liquidités + valeur actuelle de chaque paire (positions regroupées par symbole).
  const parts = useMemo<Part[]>(() => {
    const COULEURS = ['#2962ff', '#f6a821', '#ab47bc', '#26a69a', '#ef5350', '#42a5f5', '#8d6e63', '#ec407a', '#7e57c2'];
    const parSymbole = new Map<string, number>();
    for (const pos of p.positions) {
      const actuel = ticks[paireBinance(pos.symbole)]?.prix;
      const valeur = pos.cout + (actuel ? pnlLatent(pos, actuel, ticks) : 0);
      parSymbole.set(pos.symbole, (parSymbole.get(pos.symbole) ?? 0) + valeur);
    }
    const lignes = [...parSymbole.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sym, v], i) => ({ libelle: ticker(sym), valeur: v, couleur: COULEURS[i % COULEURS.length] }));
    return [{ libelle: 'Liquidités', valeur: p.solde, couleur: 'var(--texte-muet)' }, ...lignes];
  }, [p, ticks]);

  const slNum = protections ? nombre(stopLoss) : undefined;
  const risqueNum = nombre(risque);
  const prixEntreePrevu = typeOrdre === 'marche' ? prix : nombre(prixOrdre);
  const perteSiStop = slNum && prixEntreePrevu && quantite ? Math.abs(prixEntreePrevu - slNum) * quantite * conversionUsd(symbole, ticksSelecteur) : null;
  const lotsConseilles = slNum && prixEntreePrevu && risqueNum ? lotsParRisque((risqueNum / 100) * capital, prixEntreePrevu, slNum, symbole, ticksSelecteur) : null;

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
        o.lots ?? '',
        o.quantite,
        o.prix,
        o.frais,
        o.resultat ?? '',
      ]);
    telecharger(
      `parnassa-trading-historique-${horodatageFichier()}.csv`,
      versCsv(['Date', 'Paire', 'Opération', 'Sens', 'Origine', 'Lots', 'Unités', 'Prix', 'Frais (USDT)', 'Résultat (USDT)'], lignes),
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
    const id = symbole;
    if (!estNegociable(id)) {
      setErreur('Choisissez un instrument dans la liste.');
      return;
    }
    if (!prix) {
      setErreur('Prix en direct indisponible pour cette paire, patientez une seconde.');
      return;
    }
    if (etat.challenge && etat.challenge.statut !== 'en-cours') {
      setErreur('Challenge terminé : démarrez-en un nouveau ou quittez le mode challenge (en haut de la page).');
      return;
    }
    if (annonceEnCours) {
      setErreur(`Règle des news : annonce à fort impact ${annonceEnCours.devise} à ${new Date(annonceEnCours.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (« ${annonceEnCours.titreFr ?? annonceEnCours.titre} »). Ouverture bloquée ${minutesNews} min avant et après.`);
      return;
    }
    if (!lotsValides) {
      setErreur(`Volume invalide : de ${LOT_MIN.toLocaleString('fr-FR')} à ${volumeMax.toLocaleString('fr-FR')} lots, par pas de 0,01.`);
      return;
    }
    let resultat;
    if (typeOrdre === 'marche') {
      resultat = ouvrir(p, id, sens, lotsNum, prix, ticksSelecteur, { levier, prot: prot(), origine: 'marche', tauxCrypto: TAUX_FRAIS, volumeMax });
    } else {
      const prixCible = nombre(prixOrdre);
      if (!prixCible) {
        setErreur('Indiquez le prix de déclenchement.');
        return;
      }
      resultat = placerOrdre(p, { symbole: id, sens, type: typeOrdre, prix: prixCible, lots: lotsNum, levier, ...prot() }, prix, ticksSelecteur, TAUX_FRAIS, volumeMax);
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
    appliquer(cloturer(p, positionId, prixActuel, ticks, { tauxCrypto: TAUX_FRAIS, quantite }));
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

  /** Fermeture groupée : toutes les positions, seulement les gagnantes ou seulement les perdantes. */
  const fermerGroupe = (quoi: 'tout' | 'gagnantes' | 'perdantes') => {
    const r = cloturerPositions(p, ticks, TAUX_FRAIS, (_pos, pnl) => quoi === 'tout' || (quoi === 'gagnantes' ? pnl > 0 : pnl < 0));
    if (r.fermees === 0) {
      setErreur(quoi === 'tout' ? 'Aucune position à fermer (prix indisponibles).' : `Aucune position ${quoi === 'gagnantes' ? 'gagnante' : 'perdante'} en ce moment.`);
      return;
    }
    maj({ portefeuille: r.portefeuille });
    signaler(`${r.fermees} position${r.fermees > 1 ? 's' : ''} fermée${r.fermees > 1 ? 's' : ''} : ${formaterUsdt(r.resultat, true)}`);
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
    if (session?.compte.type === 'challenge') {
      window.alert('Compte challenge : il ne peut pas repartir à zéro. Ouvrez un nouveau compte challenge dans « Comptes et accès ».');
      return;
    }
    if (window.confirm(`Réinitialiser le portefeuille papier à ${p.capitalInitial.toLocaleString('fr-FR')} USDT ? Positions, ordres et historique seront effacés.`)) {
      maj({ portefeuille: reinitialiser(p.capitalInitial) });
    }
  };

  return (
    <div className="page defilable trading">
      <BarreCompte gestion={compte} ouvrir={() => setComptesOuverts(true)} />
      <FenetreComptes
        ouvert={comptesOuverts}
        fermer={() => {
          setComptesOuverts(false);
          setAccesPhase(null);
        }}
        gestion={compte}
        lie={lie}
        signaler={signaler}
        accesInitial={accesPhase}
      />
      <PanneauChallenge etat={etat} capital={capital} marges={immobilise} maj={maj} compte={session?.compte ?? null} ouvrirPhaseSuivante={() => void ouvrirPhaseSuivante()} />
      {p.crameLe ? (
        <div className="bandeau-crame" role="alert">
          <strong>🔥 Compte cramé</strong>
          <span>
            Le {new Date(p.crameLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}, le compte a perdu {Math.round(PERTE_CRAME * 100)} % de son capital de
            départ ({formaterUsdt(p.capitalInitial)}). Toutes les positions ont été fermées et les ordres annulés. Plus aucun ordre n'est accepté.
          </span>
          <button className="bouton-principal" onClick={remettreAZero}>
            Repartir à zéro
          </button>
        </div>
      ) : (
        perteCompte >= 0.8 && (
          <div className="bandeau-crame alerte" role="status">
            <strong>⚠️ Compte presque cramé</strong>
            <span>
              {Math.round(perteCompte * 100)} % du capital de départ est perdu. À {Math.round(PERTE_CRAME * 100)} %, le compte crame : tout est fermé et bloqué
              (reste {formaterUsdt(Math.max(0, capital - p.capitalInitial * (1 - PERTE_CRAME)))}).
            </span>
          </div>
        )
      )}
      <div className="kpis">
        <div className="kpi">
          <span>Capital total</span>
          <strong className={classeKpi(formaterUsdt(capital))}>{formaterUsdt(capital)}</strong>
          <em className={performance >= 0 ? 'hausse' : 'baisse'}>
            {performance >= 0 ? '+' : ''}
            {performance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % depuis le départ
          </em>
        </div>
        <div className="kpi">
          <span>Marge libre</span>
          <strong className={classeKpi(formaterUsdt(p.solde))}>{formaterUsdt(p.solde)}</strong>
          <em className={niveauMarge !== null && niveauMarge < 1 ? 'baisse' : 'muet'}>
            {formaterUsdt(immobilise)} de marge utilisée
            {niveauMarge !== null && ` · niveau ${Math.round(niveauMarge * 100).toLocaleString('fr-FR')} %`}
          </em>
        </div>
        <div className="kpi">
          <span>P&amp;L latent</span>
          <strong className={`${latent >= 0 ? 'hausse' : 'baisse'} ${classeKpi(formaterUsdt(latent, true))}`}>{formaterUsdt(latent, true)}</strong>
          <em className="muet">
            {p.positions.length} position{p.positions.length > 1 ? 's' : ''} · {p.ordres.length} ordre{p.ordres.length > 1 ? 's' : ''} en attente
          </em>
        </div>
        <div className="kpi">
          <span>P&amp;L réalisé (frais inclus)</span>
          <strong className={`${realise >= 0 ? 'hausse' : 'baisse'} ${classeKpi(formaterUsdt(realise, true))}`}>{formaterUsdt(realise, true)}</strong>
          <em className="muet">{p.operations.filter((o) => o.type === 'cloture').length + (p.archive?.clotures ?? 0)} clôture(s)</em>
        </div>
      </div>

      <div className="grille-capital">
        <div className="carte">
          <h3>Évolution du capital</h3>
          <CourbeCapital points={p.historiqueCapital} capitalInitial={p.capitalInitial} courant={capital} />
        </div>
        <div className="carte">
          <h3>Répartition</h3>
          <Repartition parts={parts} />
        </div>
      </div>

      <div className="grille-trading">
        <div className="carte formulaire-ordre">
          <h3>Nouvel ordre</h3>
          {(annonceEnCours || annonceProche) && (
            <p className={`alerte-news ${annonceEnCours ? 'bloquee' : ''}`}>
              {annonceEnCours ? '⛔ ' : '📰 '}
              {(annonceEnCours ?? annonceProche)!.devise} · {(annonceEnCours ?? annonceProche)!.titreFr ?? (annonceEnCours ?? annonceProche)!.titre} à{' '}
              {new Date((annonceEnCours ?? annonceProche)!.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              {annonceEnCours ? ` : ouverture bloquée (règle des news, ±${minutesNews} min).` : ` : ouverture bloquée de ${minutesNews} min avant à ${minutesNews} min après.`}
            </p>
          )}
          <div className="segmente trois">
            {(['marche', 'limite', 'stop'] as TypeOrdre[]).map((t) => (
              <button key={t} type="button" className={typeOrdre === t ? 'actif neutre' : ''} onClick={() => setTypeOrdre(t)}>
                {t === 'marche' ? 'Marché' : t === 'limite' ? 'Limite' : 'Stop'}
              </button>
            ))}
          </div>
          <label>
            Paire
            <SelecteurInstrument valeur={symbole} onChange={setSymbole} ticks={ticksSelecteur} />
            {infoInstrument && infoInstrument.differe > 0 && (
              <span className="aide">Cotation gratuite différée d'environ {infoInstrument.differe} min : les ordres s'exécutent à ce prix.</span>
            )}
          </label>
          {typeOrdre !== 'marche' && (
            <label>
              {typeOrdre === 'limite' ? 'Prix limite' : 'Prix de déclenchement (stop)'}
              <input inputMode="decimal" value={prixOrdre} onChange={(e) => setPrixOrdre(e.target.value)} placeholder={prix ? formaterCotation(symbole, prix) : ''} />
              <span className="aide">
                {typeOrdre === 'limite'
                  ? 'Achat sous le prix actuel, vente au-dessus : exécuté au prix limite.'
                  : 'Achat au-dessus du prix actuel, vente en dessous : exécuté au marché au franchissement.'}
              </span>
            </label>
          )}
          <div className="ligne-volume">
            <label>
              Volume (lots)
              <span className="champ-lots">
                <button type="button" onClick={() => ajusterLots(-0.01)} aria-label="Diminuer de 0,01 lot">
                  −
                </button>
                <input
                  inputMode="decimal"
                  value={lots}
                  onChange={(e) => setLots(e.target.value)}
                  onBlur={() => lotsNum > 0 && setLots(normaliserLots(lotsNum, volumeMax).toFixed(2))}
                  aria-invalid={!lotsValides}
                />
                <button type="button" onClick={() => ajusterLots(0.01)} aria-label="Augmenter de 0,01 lot">
                  +
                </button>
              </span>
            </label>
            <label>
              Levier
              <select
                className="selecteur"
                value={levier}
                onChange={(e) => maj({ parametres: { ...etat.parametres, levier: Number(e.target.value) } })}
              >
                {LEVIERS.map((l) => (
                  <option key={l} value={l}>
                    1:{l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Max par ordre
              <select
                className="selecteur"
                value={volumeMax}
                title="Volume maximal d'un ordre. 500 lots par défaut ; plus pour les très gros comptes."
                onChange={(e) => maj({ parametres: { ...etat.parametres, volumeMax: Number(e.target.value) } })}
              >
                {VOLUMES_MAX.map((v) => (
                  <option key={v} value={v}>
                    {v.toLocaleString('fr-FR')} lots
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="puces">
            {(volumeMax > LOT_MAX ? [0.1, 1, 10, 100, 500, 1000, 5000, 10000, 50000].filter((m) => m <= volumeMax) : [0.01, 0.1, 0.5, 1, 5, 10, 50]).map((m) => (
              <button type="button" key={m} onClick={() => setLots(m.toFixed(2))}>
                {m.toLocaleString('fr-FR')}
              </button>
            ))}
            <button type="button" disabled={!(maxLots >= LOT_MIN)} onClick={() => setLots(maxLots.toFixed(2))} title="Volume maximal permis par la marge libre">
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
                  disabled={!lotsConseilles}
                  onClick={() => lotsConseilles && setLots(normaliserLots(Math.min(lotsConseilles, maxLots || lotsConseilles), volumeMax).toFixed(2))}
                  title="Calcule le volume pour que la perte au stop-loss corresponde au risque choisi"
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
              <dt>Taille du contrat</dt>
              <dd>1 lot = {libelleUnite(symbole, tailleContrat(symbole))}</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>{lotsValides ? `${formaterLots(lotsNum)} = ${libelleUnite(symbole, quantite)}` : `de 0,01 à ${volumeMax.toLocaleString('fr-FR')} lots`}</dd>
            </div>
            <div>
              <dt>Valeur notionnelle</dt>
              <dd>{calcul ? formaterUsdt(calcul.notionnel) : '…'}</dd>
            </div>
            <div>
              <dt>Marge requise (1:{levier})</dt>
              <dd className={calcul && calcul.marge + calcul.frais > p.solde ? 'baisse' : ''}>{calcul ? formaterUsdt(calcul.marge) : '…'}</dd>
            </div>
            {pas && valeurPas !== null && (
              <div>
                <dt>
                  Valeur du {pas.libelle} ({pas.pas.toLocaleString('fr-FR', { maximumFractionDigits: 8 })})
                </dt>
                <dd>{formaterUsdt(valeurPas)}</dd>
              </div>
            )}
            <div>
              <dt>Commission ({(tauxFrais(symbole, TAUX_FRAIS) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %)</dt>
              <dd>{calcul ? formaterUsdt(calcul.frais) : '…'}</dd>
            </div>
            <div>
              <dt>Volume max (marge libre)</dt>
              <dd>{maxLots >= LOT_MIN ? formaterLots(maxLots) : 'insuffisant'}</dd>
            </div>
          </dl>
          {erreur && <p className="erreur">{erreur}</p>}
          <div className="boutons-ordre">
            <button className="bouton-achat" onClick={() => passerOrdre('achat')} disabled={!prix || !lotsValides || Boolean(p.crameLe) || lecture}>
              {typeOrdre === 'marche' ? 'Acheter / Long' : 'Ordre d’achat'}
            </button>
            <button className="bouton-vente" onClick={() => passerOrdre('vente')} disabled={!prix || !lotsValides || Boolean(p.crameLe) || lecture}>
              {typeOrdre === 'marche' ? 'Vendre / Short' : 'Ordre de vente'}
            </button>
          </div>
          <p className="muet petit">Compte papier avec effet de levier : aucun ordre réel n'est transmis. Stop-out automatique si le niveau de marge passe sous 50 %. Le compte crame à 99 % de perte : tout est fermé et bloqué jusqu'à la remise à zéro. Ordres en attente et protections surveillés tant que l'application est ouverte.</p>
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
                <>
                  <button className="bouton-secondaire" onClick={() => fermerGroupe('gagnantes')} title="Fermer seulement les positions en gain">
                    Gagnantes
                  </button>
                  <button className="bouton-secondaire" onClick={() => fermerGroupe('perdantes')} title="Fermer seulement les positions en perte">
                    Perdantes
                  </button>
                  <button className="bouton-secondaire" onClick={() => fermerGroupe('tout')}>
                    Tout clôturer
                  </button>
                </>
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
                        <th className="num">Volume</th>
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
                        const pnl = actuel ? pnlLatent(pos, actuel, ticks) : null;
                        // Rendement sur la marge immobilisée, comme sur les plateformes à effet de levier.
                        const pct = pnl !== null ? (pnl / pos.cout) * 100 : null;
                        const enCloture = clotureEnCours === pos.id;
                        // Saisie en lots (ou en unités pour les anciennes positions sans lots).
                        const enLots = pos.lots !== undefined;
                        const saisie = nombre(quantiteCloture.replace(',', '.'));
                        const qCloture = saisie === undefined ? undefined : enLots ? saisie * tailleContrat(pos.symbole) : saisie;
                        return (
                          <Fragment key={pos.id}>
                          <tr className={enCloture ? 'selectionnee' : ''}>
                            <td onClick={() => ouvrirSymbole(pos.symbole)}>
                              <strong>{ticker(pos.symbole)}</strong> <span className="muet">{nomSymbole(pos.symbole)}</span>
                            </td>
                            <td className={pos.sens === 'achat' ? 'hausse' : 'baisse'}>{pos.sens === 'achat' ? 'Long' : 'Short'}</td>
                            <td className="num">
                              {pos.lots !== undefined ? formaterLots(pos.lots) : formaterQuantite(pos.quantite)}
                              <span className="sous-valeur">
                                {libelleUnite(pos.symbole, pos.quantite)}
                                {pos.levier && pos.levier > 1 ? ` · 1:${pos.levier}` : ''}
                              </span>
                            </td>
                            <td className="num">{formaterCotation(pos.symbole, pos.prixEntree)}</td>
                            <td className="num"><PrixAnime valeur={actuel} texte={actuel ? formaterCotation(pos.symbole, actuel) : '…'} /></td>
                            <td className={`num ${pnl === null ? '' : pnl >= 0 ? 'hausse' : 'baisse'}`}>
                              {pnl === null
                                ? '…'
                                : `${formaterUsdt(pnl, true)} (${pct! >= 0 ? '+' : ''}${pct!.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`}
                            </td>
                            <td className="num">
                              <button className="lien discret" onClick={() => editerProtections(pos.id)} title="Modifier stop-loss et take-profit">
                                {pos.stopLoss ? formaterCotation(pos.symbole, pos.stopLoss) : '—'} / {pos.takeProfit ? formaterCotation(pos.symbole, pos.takeProfit) : '—'}
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
                                    placeholder={enLots ? `lots ≤ ${(pos.lots ?? 0).toLocaleString('fr-FR')}` : `quantité ≤ ${formaterQuantite(pos.quantite)}`}
                                  />
                                  <button
                                    className="bouton-secondaire"
                                    disabled={!qCloture || qCloture > pos.quantite * 1.000001}
                                    onClick={() => qCloture && fermer(pos.id, Math.min(qCloture, pos.quantite))}
                                  >
                                    {enLots ? 'Clôturer ces lots' : 'Clôturer la quantité'}
                                  </button>
                                  {actuel && qCloture && qCloture <= pos.quantite * 1.000001 && (
                                    <span className="muet">
                                      P&amp;L {formaterUsdt((actuel - pos.prixEntree) * qCloture * (pos.sens === 'achat' ? 1 : -1) * conversionUsd(pos.symbole, ticks), true)}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
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
                              {o.type === 'limite' ? 'Limite' : 'Stop'} · {o.sens === 'achat' ? 'achat' : 'vente'}
                            </td>
                            <td className="num">
                              {formaterCotation(o.symbole, o.prix)}
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
                          {o.lots !== undefined ? formaterLots(o.lots) : formaterQuantite(o.quantite)} · entrée {o.prixEntree ? formaterCotation(o.symbole, o.prixEntree) : '—'} → sortie {formaterCotation(o.symbole, o.prix)} · frais {formaterUsdt(o.frais)}
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

      <CalendrierTrades operations={p.operations} ouvrirSymbole={ouvrirSymbole} />
      <ClassementTraders gestion={compte} ouvrirComptes={() => setComptesOuverts(true)} signaler={signaler} />
    </div>
  );
}
