import { Fragment, lazy, Suspense, useMemo, useState } from 'react';
import type { Etat, Position } from '../types';
import type { Tick } from '../binance';
import { paireBinance } from '../binance';
import { formaterCotation, libelleUnite, tailleContrat, conversionUsd } from '../instruments';

import { PrixAnime } from '../composants/PrixAnime';
import { CalendrierTrades } from '../composants/CalendrierTrades';
import { ClassementTraders } from '../composants/ClassementTraders';
import { VitrineTrophees } from '../composants/VitrineTrophees';
import { RisqueExposition } from '../composants/RisqueExposition';
import { FormulaireOrdre } from '../composants/FormulaireOrdre';
import { dateCourte, OngletHistorique, OngletOrdres, OngletStatistiques, ORIGINES } from '../composants/OngletsTrading';
import { nombre } from '../saisie';
import { marcheFerme } from '../horaires';
import { StatutMarche } from '../composants/StatutMarche';
import { BandeauNewsPositions } from '../composants/BandeauNewsPositions';
import { annoncesSurPositions } from '../newsPositions';

import { PlanDuJour } from '../composants/PlanDuJour';
import { revueSemaine, type RevueSemaine as Revue } from '../semaine';
import { EditeurProtections } from '../composants/EditeurProtections';
import { CartePartage, type SujetPartage } from '../composants/CartePartage';
import { JournalTrades } from '../composants/JournalTrades';
import { PositionsGroupees } from '../composants/PositionsGroupees';
import { genererRapport, ouvrirRapport } from '../rapport';

import { BarreCompte, capitalDemande, FenetreComptes } from '../composants/ComptesTrading';
import type { GestionCompte } from '../comptes';
import { PanneauChallenge } from '../composants/PanneauChallenge';
import { formuleSuivante, reglesCompletes } from '../challenge';
import { useCalendrier } from '../actualites';
import { ouvrirCompte, type Acces } from '../comptes';
import { cloturerPositions } from '../ordre';
import { controleRisqueTrade } from '../discipline';
import { PanneauDiscipline } from '../composants/PanneauDiscipline';
import { nomSymbole, ticker } from '../symboles';
import { annoterOperation, annoterPosition, annulerOrdre, breakEven, cloturer, etiqueterOperation, formaterLots, formaterQuantite, formaterUsdt, modifierProtections, PERTE_CRAME, pnlMarche, programmerCloture, realiseTotal, reinitialiser, statistiques, valeurPortefeuille } from '../trading';
import { horodatageFichier, telecharger, versCsv } from '../export';
import { CourbeCapital } from '../composants/CourbeCapital';
import { Repartition, type Part } from '../composants/Repartition';
import { IconeTelecharger } from '../composants/Icones';

const RevueSemaine = lazy(() => import('../composants/RevueSemaine').then((m) => ({ default: m.RevueSemaine })));

interface Props {
  etat: Etat;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  ouvrirSymbole: (id: string) => void;
  compte: GestionCompte;
  lie: boolean;
  signaler: (m: string) => void;
}

type Onglet = 'positions' | 'ordres' | 'historique' | 'journal' | 'statistiques';

/** Montants très longs (milliards) : chiffres un peu plus petits pour tenir sur une ligne. */
const classeKpi = (texte: string) => (texte.length > 22 ? 'tres-long' : texte.length > 17 ? 'long' : '');

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
  const [clotureEnCours, setClotureEnCours] = useState<string | null>(null);
  const [quantiteCloture, setQuantiteCloture] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('positions');

  // Règle des news du challenge : pas d'ouverture autour des annonces à fort impact sur les devises de l'instrument.
  const minutesNews = etat.challenge?.statut === 'en-cours' ? (reglesCompletes(etat.challenge.regles).newsMinutes ?? 0) : 0;
  // Le calendrier sert aussi à prévenir des annonces qui touchent les positions ouvertes.
  const { evenements } = useCalendrier(minutesNews > 0 || p.positions.length > 0);
  const annoncesPositions = annoncesSurPositions(p.positions, evenements);
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

  const { capital, latent, immobilise, niveauMarge } = useMemo(() => valeurPortefeuille(p, ticks), [p, ticks]);
  const perteCompte = p.capitalInitial > 0 ? Math.max(0, 1 - capital / p.capitalInitial) : 0;
  const realise = useMemo(() => realiseTotal(p), [p]);
  // Recalcul seulement quand les opérations changent (pas à chaque prix, ni à chaque mouvement de stop suiveur).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => statistiques(p), [p.operations, p.archive]);
  /** Lignes de positions affichées : au-delà, un bouton affiche le reste (le tableau reste fluide avec des centaines de positions). */
  const [positionsVisibles, setPositionsVisibles] = useState(100);
  /** Vue des positions par instrument (mémorisée sur l'appareil). */
  const [vueGroupee, setVueGroupee] = useState(() => {
    try {
      return localStorage.getItem('parnassa-trading:vue-positions') === 'groupee';
    } catch {
      return false;
    }
  });
  const changerVue = (groupee: boolean) => {
    setVueGroupee(groupee);
    try {
      localStorage.setItem('parnassa-trading:vue-positions', groupee ? 'groupee' : 'detail');
    } catch {
      // stockage indisponible
    }
  };

  // Répartition : liquidités + valeur actuelle de chaque paire (positions regroupées par symbole).
  const parts = useMemo<Part[]>(() => {
    const COULEURS = ['#2962ff', '#f6a821', '#ab47bc', '#26a69a', '#ef5350', '#42a5f5', '#8d6e63', '#ec407a', '#7e57c2'];
    const parSymbole = new Map<string, number>();
    for (const pos of p.positions) {
      const actuel = ticks[paireBinance(pos.symbole)]?.prix;
      const valeur = pos.cout + (actuel ? pnlMarche(pos, actuel, ticks) : (pos.swap ?? 0));
      parSymbole.set(pos.symbole, (parSymbole.get(pos.symbole) ?? 0) + valeur);
    }
    const lignes = [...parSymbole.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sym, v], i) => ({ libelle: ticker(sym), valeur: v, couleur: COULEURS[i % COULEURS.length] }));
    return [{ libelle: 'Liquidités', valeur: p.solde, couleur: 'var(--texte-muet)' }, ...lignes];
  }, [p, ticks]);

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
    const ferme = marcheFerme(position!.symbole);
    if (ferme) {
      setErreur(`${ferme} Vous pourrez la fermer à la réouverture ; ses stops attendent aussi.`);
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
    const retenue = (pos: Position, pnl: number) => quoi === 'tout' || (quoi === 'gagnantes' ? pnl > 0 : pnl < 0);
    // Marché fermé : ces positions restent ouvertes jusqu'à la réouverture.
    const enAttente = p.positions.filter((x) => marcheFerme(x.symbole) !== null).length;
    const r = cloturerPositions(p, ticks, TAUX_FRAIS, (pos, pnl) => retenue(pos, pnl) && marcheFerme(pos.symbole) === null);
    if (r.fermees === 0) {
      setErreur(
        enAttente
          ? `Marché fermé pour ${enAttente} position${enAttente > 1 ? 's' : ''} : rien à fermer pour le moment.`
          : quoi === 'tout'
            ? 'Aucune position à fermer (prix indisponibles).'
            : `Aucune position ${quoi === 'gagnantes' ? 'gagnante' : 'perdante'} en ce moment.`,
      );
      return;
    }
    maj({ portefeuille: r.portefeuille });
    signaler(`${r.fermees} position${r.fermees > 1 ? 's' : ''} fermée${r.fermees > 1 ? 's' : ''} : ${formaterUsdt(r.resultat, true)}${enAttente ? ` · ${enAttente} sur un marché fermé, gardée${enAttente > 1 ? 's' : ''}` : ''}`);
  };

  const [editionProtections, setEditionProtections] = useState<string | null>(null);
  const [partage, setPartage] = useState<SujetPartage | null>(null);
  const [revue, setRevue] = useState<Revue | null>(null);
  const editerProtections = (positionId: string) => setEditionProtections((x) => (x === positionId ? null : positionId));
  const enregistrerProtections = (positionId: string, prot: Parameters<typeof modifierProtections>[2]) => {
    const pos = p.positions.find((x) => x.id === positionId);
    const r = modifierProtections(p, positionId, prot, pos ? ticks[paireBinance(pos.symbole)]?.prix : undefined);
    if (typeof r === 'string') return setErreur(r);
    const risque = controleRisqueTrade(p, r, etat.parametres.discipline, capital, ticks);
    if (risque) return setErreur(risque);
    setErreur(null);
    maj({ portefeuille: r });
    setEditionProtections(null);
  };
  const mettreBreakEven = (positionId: string) => {
    const pos = p.positions.find((x) => x.id === positionId);
    const prixActuel = pos ? ticks[paireBinance(pos.symbole)]?.prix : undefined;
    if (!pos || !prixActuel) return;
    const r = breakEven(p, positionId, prixActuel);
    if (typeof r === 'string') return setErreur(r);
    setErreur(null);
    maj({ portefeuille: r });
    setEditionProtections(null);
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
      <PanneauDiscipline etat={etat} capital={capital} balance={etat.portefeuille.solde + immobilise} maj={maj} />
      <PlanDuJour portefeuille={p} regles={etat.parametres.discipline} enregistrer={(portefeuille) => maj({ portefeuille })} lecture={lecture} compact />
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
        <FormulaireOrdre
          etat={etat}
          ticks={ticks}
          maj={maj}
          capital={capital}
          lecture={lecture}
          erreur={erreur}
          setErreur={setErreur}
          evenements={evenements}
          minutesNews={minutesNews}
          apresOrdreEnAttente={() => setOnglet('ordres')}
        />

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
              {onglet === 'statistiques' && stats.nbTrades > 0 && (
                <button
                  className="bouton-secondaire"
                  title="Résultat, jours, instruments et plans de la semaine dernière"
                  onClick={() => {
                    const r = revueSemaine(p);
                    if (r) setRevue(r);
                    else signaler('Aucun trade clôturé la semaine dernière.');
                  }}
                >
                  📅 Semaine
                </button>
              )}
              {onglet === 'statistiques' && stats.nbTrades > 0 && (
                <button
                  className="bouton-secondaire avec-icone"
                  title="Rapport de performance imprimable, à enregistrer en PDF"
                  onClick={() => {
                    if (!ouvrirRapport(genererRapport(etat, capital, session?.compte ?? null))) setErreur('Le navigateur a bloqué l’ouverture du rapport : autorisez les fenêtres pour ce site.');
                  }}
                >
                  <IconeTelecharger width={14} height={14} /> Rapport PDF
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
              <BandeauNewsPositions annonces={annoncesPositions} />
              <RisqueExposition positions={p.positions} ticks={ticks} capital={capital} />
              {p.positions.length > 1 && (
                <div className="segmente vue-positions" role="tablist" aria-label="Affichage des positions">
                  <button className={!vueGroupee ? 'actif neutre' : ''} onClick={() => changerVue(false)}>
                    Détail
                  </button>
                  <button className={vueGroupee ? 'actif neutre' : ''} onClick={() => changerVue(true)}>
                    Par instrument
                  </button>
                </div>
              )}
              {p.positions.length > 0 && vueGroupee && (
                <PositionsGroupees
                  positions={p.positions}
                  ticks={ticks}
                  ouvrirSymbole={ouvrirSymbole}
                  fermerSymbole={(sym) => {
                    const ferme = marcheFerme(sym);
                    if (ferme) return setErreur(ferme);
                    const r = cloturerPositions(p, ticks, TAUX_FRAIS, (x) => x.symbole === sym);
                    if (r.fermees === 0) return setErreur('Prix indisponible pour cet instrument.');
                    maj({ portefeuille: r.portefeuille });
                    signaler(`${r.fermees} position${r.fermees > 1 ? 's' : ''} ${ticker(sym)} fermée${r.fermees > 1 ? 's' : ''} : ${formaterUsdt(r.resultat, true)}`);
                  }}
                />
              )}
              {p.positions.length > 0 && !vueGroupee && (
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
                      {p.positions.slice(0, positionsVisibles).map((pos) => {
                        const actuel = ticks[paireBinance(pos.symbole)]?.prix;
                        const pnl = actuel ? pnlMarche(pos, actuel, ticks) : null;
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
                              {pos.fermerLe && (
                                <span className="badge-suiveur" title={`Clôture programmée : ${new Date(pos.fermerLe).toLocaleString('fr-FR')}`}>
                                  ⏰ {new Date(pos.fermerLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                              {marcheFerme(pos.symbole) && (
                                <>
                                  {' '}
                                  <StatutMarche symbole={pos.symbole} compact />
                                </>
                              )}
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
                              {pos.swap ? (
                                <span className="sous-ligne muet" title="Swap cumulé (financement des nuits passées), compris dans le P&L">
                                  dont swap {formaterUsdt(pos.swap, true)}
                                </span>
                              ) : null}
                            </td>
                            <td className="num">
                              <button className="lien discret" onClick={() => editerProtections(pos.id)} title="Modifier stop-loss et take-profit">
                                {pos.stopLoss ? formaterCotation(pos.symbole, pos.stopLoss) : '—'} / {pos.takeProfit ? formaterCotation(pos.symbole, pos.takeProfit) : '—'}
                                {pos.suiveur ? <span className="badge-suiveur" title="Stop suiveur actif">↗ suiveur</span> : null}
                                {pos.paliers?.length ? (
                                  <span className="badge-suiveur" title="Prises de profit partielles">
                                    {pos.paliers.filter((x) => x.fait).length}/{pos.paliers.length} paliers
                                  </span>
                                ) : null}
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
                          {editionProtections === pos.id && (
                            <tr className="ligne-cloture">
                              <td colSpan={9}>
                                <EditeurProtections
                                  position={pos}
                                  prixActuel={actuel}
                                  ticks={ticks}
                                  enregistrer={(prot) => enregistrerProtections(pos.id, prot)}
                                  breakEven={() => mettreBreakEven(pos.id)}
                                  fermer={() => setEditionProtections(null)}
                                  programmer={(fermerLe) => {
                                    const r = programmerCloture(p, pos.id, fermerLe);
                                    if (typeof r === 'string') return setErreur(r);
                                    setErreur(null);
                                    maj({ portefeuille: r });
                                    signaler(fermerLe ? `⏰ ${ticker(pos.symbole)} sera fermée ${new Date(fermerLe).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Clôture programmée annulée');
                                  }}
                                />
                              </td>
                            </tr>
                          )}
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
              {!vueGroupee && p.positions.length > positionsVisibles && (
                <button className="lien discret plus-positions" onClick={() => setPositionsVisibles((n) => n + 200)}>
                  Afficher {Math.min(200, p.positions.length - positionsVisibles)} positions de plus ({p.positions.length - positionsVisibles} masquées)
                </button>
              )}
            </>
          )}

          {onglet === 'ordres' && <OngletOrdres p={p} ticks={ticks} ouvrirSymbole={ouvrirSymbole} annuler={(id) => maj({ portefeuille: annulerOrdre(p, id) })} />}

          {onglet === 'journal' && (
            <JournalTrades
              journal={journal}
              origines={ORIGINES}
              dateCourte={dateCourte}
              ouvrirSymbole={ouvrirSymbole}
              editerNote={editerNoteOperation}
              etiqueter={(id, etiquettes) => maj({ portefeuille: etiqueterOperation(p, id, etiquettes) })}
            />
          )}

          {onglet === 'statistiques' && <OngletStatistiques p={p} stats={stats} challenge={etat.challenge} ouvrirSymbole={ouvrirSymbole} />}

          {onglet === 'historique' && <OngletHistorique p={p} ouvrirSymbole={ouvrirSymbole} partager={(operation) => setPartage({ type: 'trade', operation })} />}
        </div>
      </div>

      <CalendrierTrades operations={p.operations} ouvrirSymbole={ouvrirSymbole} partagerJour={(date, operations) => setPartage({ type: 'jour', date, operations })} />
      {partage && <CartePartage sujet={partage} fermer={() => setPartage(null)} />}
      {revue && (
        <Suspense fallback={null}>
          <RevueSemaine revue={revue} portefeuille={p} fermer={() => setRevue(null)} />
        </Suspense>
      )}
      <ClassementTraders gestion={compte} ouvrirComptes={() => setComptesOuverts(true)} signaler={signaler} />
      <VitrineTrophees trophees={etat.trophees} />
    </div>
  );
}
