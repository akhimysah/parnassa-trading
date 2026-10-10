import { useMemo, useState } from 'react';
import type { Etat, Sens } from '../types';
import type { Tick } from '../binance';
import { estBinance, useFluxBinance } from '../binance';
import type { EvenementCalendrier } from '../actualites';
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
import { SelecteurInstrument } from './SelecteurInstrument';
import { StatutMarche } from './StatutMarche';
import { marcheFerme } from '../horaires';
import { categorieDe, coteEntree, fourchette, LEVIER_MAX, levierEffectif, SWAP_ANNUEL_PCT } from '../couts';
import { planManquant } from '../plan';
import { annonceBloquante, devisesInstrument } from '../challenge';
import { blocageDiscipline, controleRisqueTrade, finDuBlocage, pauseApresPerte } from '../discipline';
import { fermeAuWeekend, regleWeekendActive, reouverture } from '../weekend';
import { echeance, engagement, formaterLots, formaterUsdt, lotsMax, lotsParRisque, ouvrir, placerCassure, placerOrdre, tauxFrais } from '../trading';
import { jouer } from '../sons';
import { nombre } from '../saisie';
import { LienLegal } from './InfosLegales';

type TypeOrdre = 'marche' | 'limite' | 'stop' | 'stop-limite' | 'cassure';

interface Props {
  etat: Etat;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  /** Fonds propres actuels (pour le risque et la discipline). */
  capital: number;
  /** Accès investisseur : lecture seule. */
  lecture: boolean;
  /** Message d'erreur partagé avec les actions sur les positions. */
  erreur: string | null;
  setErreur: (m: string | null) => void;
  /** Annonces du calendrier, pour la règle des news du challenge. */
  evenements: EvenementCalendrier[];
  minutesNews: number;
  /** Un ordre en attente vient d'être posé (la page montre l'onglet des ordres). */
  apresOrdreEnAttente: () => void;
}

/**
 * Formulaire « Nouvel ordre » : instrument, type (marché, limite, stop, stop-limite, cassure), volume, levier,
 * protections et dimensionnement au risque, récapitulatif des coûts, puis contrôles (marché, discipline, news, risque).
 */
export function FormulaireOrdre({ etat, ticks, maj, capital, lecture, erreur, setErreur, evenements, minutesNews, apresOrdreEnAttente }: Props) {
  const p = etat.portefeuille;
  const TAUX_FRAIS = etat.parametres.frais;
  const [risque, setRisque] = useState('1');
  const [note, setNote] = useState('');
  const [symbole, setSymbole] = useState(estNegociable(etat.symbole) ? etat.symbole : 'OANDA:XAUUSD');
  const [typeOrdre, setTypeOrdre] = useState<TypeOrdre>('marche');
  const [prixLimite, setPrixLimite] = useState('');
  const [borneHaute, setBorneHaute] = useState('');
  const [borneBasse, setBorneBasse] = useState('');
  const [rrCassure, setRrCassure] = useState('2');
  const [expiration, setExpiration] = useState<'jamais' | '1h' | '4h' | 'jour'>('jamais');
  const [prixOrdre, setPrixOrdre] = useState('');
  const [lots, setLots] = useState('0.10');
  const levier = etat.parametres.levier;
  /** Volume maximal par ordre : 500 lots par défaut, plus pour les très gros comptes (Paramètres de l'ordre). */
  const volumeMax = etat.parametres.volumeMax ?? LOT_MAX;
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [protections, setProtections] = useState(false);

  const paire = cleCotation(symbole);
  // Prix de l'instrument choisi, même s'il n'est encore dans aucune position.
  const fluxLocal = useFluxBinance(estBinance(symbole) ? [paire] : []);
  const scannerLocal = useCotationsScanner([symbole, ...symbolesConversion([symbole])]);
  const prix = (ticks[paire] ?? fluxLocal[paire] ?? scannerLocal[paire])?.prix;
  const infoInstrument = instrument(symbole);
  const devisesOrdre = devisesInstrument(infoInstrument?.code ?? symbole.split(':').pop() ?? '', infoInstrument?.devise);
  const annonceEnCours = minutesNews > 0 ? annonceBloquante(evenements, devisesOrdre, minutesNews) : undefined;
  const annonceProche =
    minutesNews > 0 ? evenements.filter((e) => e.importance >= 1 && devisesOrdre.includes(e.devise) && e.date > Date.now() && e.date - Date.now() < 30 * 60000).sort((a, b) => a.date - b.date)[0] : undefined;
  const ticksSelecteur = useMemo(() => ({ ...scannerLocal, ...fluxLocal, ...ticks }), [scannerLocal, fluxLocal, ticks]);
  const lotsNum = nombre(lots.replace(',', '.')) ?? 0;
  const lotsValides = lotsNum >= LOT_MIN && lotsNum <= volumeMax;
  const prixReference = typeOrdre === 'marche' ? prix : typeOrdre === 'cassure' ? nombre(borneHaute) : nombre(prixOrdre);
  const calcul = prixReference && lotsValides ? engagement(symbole, lotsNum, prixReference, levier, ticksSelecteur, TAUX_FRAIS) : null;
  const quantite = calcul?.unites ?? 0;
  const pas = prixReference ? pasDePrix(symbole, prixReference) : null;
  const valeurPas = pas && lotsValides ? pas.pas * lotsNum * tailleContrat(symbole) * conversionUsd(symbole, ticksSelecteur) : null;
  const maxLots = prix ? lotsMax(p, symbole, prixReference ?? prix, levier, ticksSelecteur, TAUX_FRAIS, volumeMax) : 0;
  const ajusterLots = (delta: number) => setLots(normaliserLots((lotsNum || 0) + delta, volumeMax).toFixed(2));

  const slNum = protections ? nombre(stopLoss) : undefined;
  const risqueNum = nombre(risque);
  // Au marché, l'entrée se fait à l'ask (achat, stop sous le prix) ou au bid (vente) : le spread compte dans le risque.
  const prixEntreePrevu = typeOrdre === 'marche' ? (prix && slNum ? coteEntree(symbole, slNum < prix ? 'achat' : 'vente', prix) : prix) : nombre(prixOrdre);
  const perteSiStop = slNum && prixEntreePrevu && quantite ? Math.abs(prixEntreePrevu - slNum) * quantite * conversionUsd(symbole, ticksSelecteur) : null;
  const lotsConseilles = slNum && prixEntreePrevu && risqueNum ? lotsParRisque((risqueNum / 100) * capital, prixEntreePrevu, slNum, symbole, ticksSelecteur) : null;

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
    const ferme = marcheFerme(id);
    if (ferme) {
      setErreur(ferme);
      return;
    }
    if (regleWeekendActive(etat) && fermeAuWeekend(id)) {
      setErreur(`Marché fermé le week-end : réouverture ${reouverture()} (la crypto reste ouverte).`);
      return;
    }
    const discipline = blocageDiscipline(p, etat.parametres.discipline);
    if (discipline) {
      setErreur(`Discipline du jour : ${discipline} Nouveaux ordres bloqués ${finDuBlocage(p)}.`);
      return;
    }
    const pause = pauseApresPerte(p, etat.parametres.discipline);
    if (pause) {
      setErreur(pause);
      return;
    }
    const plan = planManquant(p, etat.parametres.discipline);
    if (plan) {
      setErreur(plan);
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
    if (typeOrdre === 'cassure') {
      const haut = nombre(borneHaute);
      const bas = nombre(borneBasse);
      if (!haut || !bas) {
        setErreur('Indiquez les deux bornes du range.');
        return;
      }
      resultat = placerCassure(p, { symbole: id, haut, bas, lots: lotsNum, levier, rr: Number(rrCassure) || undefined, expireLe: echeance(expiration) }, prix, ticksSelecteur, TAUX_FRAIS, volumeMax);
    } else if (typeOrdre === 'marche') {
      resultat = ouvrir(p, id, sens, lotsNum, prix, ticksSelecteur, { levier, prot: prot(), origine: 'marche', tauxCrypto: TAUX_FRAIS, volumeMax });
    } else {
      const prixCible = nombre(prixOrdre);
      if (!prixCible) {
        setErreur('Indiquez le prix de déclenchement.');
        return;
      }
      resultat = placerOrdre(
        p,
        { symbole: id, sens, type: typeOrdre, prix: prixCible, prixLimite: typeOrdre === 'stop-limite' ? nombre(prixLimite) : undefined, lots: lotsNum, levier, ...prot() },
        prix,
        ticksSelecteur,
        TAUX_FRAIS,
        volumeMax,
      );
      const expireLe = echeance(expiration);
      if (typeof resultat !== 'string' && expireLe) resultat = { ...resultat, ordres: resultat.ordres.map((o, i) => (i === 0 ? { ...o, expireLe } : o)) };
    }
    if (typeof resultat === 'string') {
      setErreur(resultat);
      return;
    }
    const risque = controleRisqueTrade(p, resultat, etat.parametres.discipline, capital, ticksSelecteur);
    if (risque) {
      setErreur(risque);
      return;
    }
    setErreur(null);
    maj({ portefeuille: resultat });
    if (etat.parametres.son && typeOrdre === 'marche') jouer(sens === 'achat' ? 'achat' : 'vente');
    setNote('');
    if (typeOrdre !== 'marche') apresOrdreEnAttente();
  };

  return (
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
        {(['marche', 'limite', 'stop', 'stop-limite', 'cassure'] as TypeOrdre[]).map((t) => (
          <button
            key={t}
            type="button"
            className={typeOrdre === t ? 'actif neutre' : ''}
            onClick={() => {
              setTypeOrdre(t);
              // Range de départ autour du prix (±0,15 %), à ajuster.
              if (t === 'cassure' && prix && !borneHaute && !borneBasse) {
                setBorneHaute(String(Number((prix * 1.0015).toPrecision(8))));
                setBorneBasse(String(Number((prix * 0.9985).toPrecision(8))));
              }
            }}
            title={
              t === 'cassure'
                ? 'Achat stop au-dessus et vente stop en dessous, liés : le premier déclenché annule l’autre (OCO)'
                : t === 'stop-limite'
                  ? 'Au franchissement du stop, un ordre limite est posé : pas d’exécution au-delà de votre prix limite'
                  : undefined
            }
          >
            {t === 'marche' ? 'Marché' : t === 'limite' ? 'Limite' : t === 'stop' ? 'Stop' : t === 'stop-limite' ? 'Stop lim.' : 'Cassure'}
          </button>
        ))}
      </div>
      <label>
        Paire
        <SelecteurInstrument valeur={symbole} onChange={setSymbole} ticks={ticksSelecteur} />
        <StatutMarche symbole={symbole} />
        {infoInstrument && infoInstrument.differe > 0 && (
          <span className="aide">Cotation gratuite différée d'environ {infoInstrument.differe} min : les ordres s'exécutent à ce prix.</span>
        )}
      </label>
      {typeOrdre === 'cassure' && (
        <div className="bloc-cassure">
          <label>
            Borne haute (achat stop)
            <input inputMode="decimal" value={borneHaute} onChange={(e) => setBorneHaute(e.target.value)} />
          </label>
          <label>
            Borne basse (vente stop)
            <input inputMode="decimal" value={borneBasse} onChange={(e) => setBorneBasse(e.target.value)} />
          </label>
          <label>
            Take-profit
            <select className="selecteur" value={rrCassure} onChange={(e) => setRrCassure(e.target.value)}>
              <option value="0">aucun</option>
              <option value="1">1R</option>
              <option value="2">2R</option>
              <option value="3">3R</option>
            </select>
          </label>
          <span className="aide">
            Le premier ordre déclenché annule l'autre (OCO). Stop-loss à l'autre borne
            {nombre(borneHaute) && nombre(borneBasse) ? ` (risque ${formaterCotation(symbole, nombre(borneHaute)! - nombre(borneBasse)!)} par unité)` : ''}.
          </span>
        </div>
      )}
      {typeOrdre !== 'marche' && (
        <label>
          Expiration
          <select className="selecteur" value={expiration} onChange={(e) => setExpiration(e.target.value as typeof expiration)}>
            <option value="jamais">Jusqu'à annulation</option>
            <option value="1h">Dans 1 heure</option>
            <option value="4h">Dans 4 heures</option>
            <option value="jour">Fin de journée</option>
          </select>
        </label>
      )}
      {(typeOrdre === 'limite' || typeOrdre === 'stop' || typeOrdre === 'stop-limite') && (
        <label>
          {typeOrdre === 'limite' ? 'Prix limite' : 'Prix de déclenchement (stop)'}
          <input inputMode="decimal" value={prixOrdre} onChange={(e) => setPrixOrdre(e.target.value)} placeholder={prix ? formaterCotation(symbole, prix) : ''} />
          <span className="aide">
            {typeOrdre === 'limite'
              ? 'Achat sous le prix actuel, vente au-dessus : exécuté au prix limite.'
              : typeOrdre === 'stop'
                ? 'Achat au-dessus du prix actuel, vente en dessous : exécuté au marché au franchissement.'
                : 'Achat au-dessus du prix actuel, vente en dessous : au franchissement, un ordre limite est posé.'}
          </span>
        </label>
      )}
      {typeOrdre === 'stop-limite' && (
        <label>
          Prix limite
          <input inputMode="decimal" value={prixLimite} onChange={(e) => setPrixLimite(e.target.value)} placeholder={prixOrdre || (prix ? formaterCotation(symbole, prix) : '')} />
          <span className="aide">Le plus haut accepté à l'achat (au moins le stop), le plus bas à la vente : si le marché saute au-delà, l'ordre attend au lieu de glisser.</span>
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
      {typeOrdre !== 'cassure' && (
      <label className="case">
        <input type="checkbox" checked={protections} onChange={(e) => setProtections(e.target.checked)} />
        Stop-loss / take-profit
      </label>
      )}
      {protections && typeOrdre !== 'cassure' && (
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
          <dt title={levierEffectif(symbole, levier) < levier ? `Levier plafonné à 1:${LEVIER_MAX[categorieDe(symbole)]} pour cette catégorie d'instruments` : undefined}>
            Marge requise (1:{levierEffectif(symbole, levier)}
            {levierEffectif(symbole, levier) < levier ? ' max' : ''})
          </dt>
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
          <dt title="Écart entre prix acheteur et vendeur, payé à l'ouverture d'un ordre au marché">Spread (coût à l'ouverture)</dt>
          <dd>{prixReference && quantite ? formaterUsdt(fourchette(symbole, prixReference).spread * quantite * conversionUsd(symbole, ticksSelecteur)) : '…'}</dd>
        </div>
        <div>
          <dt title="Financement facturé à chaque nuit passée (21 h UTC), triple le mercredi (change, matières premières) ou le vendredi (indices, actions)">
            Swap par nuit (achat / vente)
          </dt>
          <dd>
            {prixReference && quantite
              ? `${formaterUsdt((-prixReference * quantite * conversionUsd(symbole, ticksSelecteur) * SWAP_ANNUEL_PCT[categorieDe(symbole)].achat) / 100 / 365)} / ${formaterUsdt((-prixReference * quantite * conversionUsd(symbole, ticksSelecteur) * SWAP_ANNUEL_PCT[categorieDe(symbole)].vente) / 100 / 365)}`
              : '…'}
          </dd>
        </div>
        <div>
          <dt>Volume max (marge libre)</dt>
          <dd>{maxLots >= LOT_MIN ? formaterLots(maxLots) : 'insuffisant'}</dd>
        </div>
      </dl>
      {erreur && <p className="erreur">{erreur}</p>}
      {typeOrdre === 'cassure' ? (
        <div className="boutons-ordre">
          <button className="bouton-principal bouton-cassure" onClick={() => passerOrdre('achat')} disabled={!prix || !lotsValides || Boolean(p.crameLe) || lecture}>
            Placer la cassure (OCO)
          </button>
        </div>
      ) : (
      <div className="boutons-ordre">
        <button className="bouton-achat" onClick={() => passerOrdre('achat')} disabled={!prix || !lotsValides || Boolean(p.crameLe) || lecture}>
          {typeOrdre === 'marche' ? 'Acheter / Long' : 'Ordre d’achat'}
        </button>
        <button className="bouton-vente" onClick={() => passerOrdre('vente')} disabled={!prix || !lotsValides || Boolean(p.crameLe) || lecture}>
          {typeOrdre === 'marche' ? 'Vendre / Short' : 'Ordre de vente'}
        </button>
      </div>
      )}
      <p className="muet petit">Compte papier avec effet de levier : aucun ordre réel n'est transmis. Comme chez un courtier, chaque ordre au marché paie le spread (achat à l'ask, vente au bid) et chaque nuit passée coûte un swap. Stop-out automatique si le niveau de marge passe sous 50 %. Le compte crame à 99 % de perte : tout est fermé et bloqué jusqu'à la remise à zéro. Ordres en attente et protections surveillés tant que l'application est ouverte.{' '}
        <LienLegal onglet="risques">Risques et confidentialité</LienLegal>
      </p>
    </div>
  );
}
