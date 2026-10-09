import { useEffect, useMemo, useRef, useState } from 'react';
import type { Etat, Sens } from '../types';
import type { Tick } from '../binance';
import { estBinance, useFluxBinance } from '../binance';
import { cleCotation, estNegociable, formaterCotation, instrument, LOT_MAX, normaliserLots, symbolesConversion, useCotationsScanner } from '../instruments';
import { formaterLots, formaterUsdt, lotsParRisque, ouvrir, pnlLatent, TAUX_FRAIS, valeurPortefeuille } from '../trading';
import { annonceBloquante, devisesInstrument, reglesCompletes } from '../challenge';
import { useCalendrier } from '../actualites';
import { cloturerPositions, controleOuverture } from '../ordre';

interface Props {
  etat: Etat;
  symbole: string;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  lecture: boolean;
  signaler: (m: string) => void;
  /** Ouvre la recherche de l'application pour changer l'instrument du graphique (et de la barre). */
  changerSymbole: () => void;
}

const PALIERS = [0.01, 0.1, 1, 10, 100, 500, 1000, 5000, 10000];

/** Trading en un clic au-dessus du graphique : vente, volume, achat, position nette et fermeture de l'instrument. */
export function BarreUnClic({ etat, symbole, ticks, maj, lecture, signaler, changerSymbole }: Props) {
  const reglage = etat.parametres.unClic ?? { actif: true, lots: 1 };
  const volumeMax = etat.parametres.volumeMax ?? LOT_MAX;
  const [saisie, setSaisie] = useState(String(reglage.lots));
  const [erreur, setErreur] = useState<string | null>(null);
  const negociable = estNegociable(symbole);
  const paire = cleCotation(symbole);
  const flux = useFluxBinance(negociable && estBinance(symbole) ? [paire] : []);
  const scanner = useCotationsScanner(negociable && reglage.actif ? [symbole, ...symbolesConversion([symbole])] : []);
  const tous = useMemo(() => ({ ...scanner, ...flux, ...ticks }), [scanner, flux, ticks]);
  const prix = tous[paire]?.prix;
  const info = instrument(symbole);

  const minutesNews = etat.challenge?.statut === 'en-cours' ? (reglesCompletes(etat.challenge.regles).newsMinutes ?? 0) : 0;
  const { evenements } = useCalendrier(minutesNews > 0 && reglage.actif);
  const annonce = minutesNews > 0 ? annonceBloquante(evenements, devisesInstrument(info?.code ?? '', info?.devise), minutesNews) : undefined;

  const p = etat.portefeuille;
  const positions = p.positions.filter((x) => x.symbole === symbole);
  const net = positions.reduce((s, x) => s + (x.lots ?? 0) * (x.sens === 'achat' ? 1 : -1), 0);
  const latent = prix ? positions.reduce((s, x) => s + pnlLatent(x, prix, tous), 0) : 0;

  const fixer = (lots: number) => {
    const n = normaliserLots(lots, volumeMax);
    setSaisie(String(n));
    maj({ parametres: { ...etat.parametres, unClic: { ...reglage, actif: true, lots: n } } });
  };

  const lotsSaisis = Number(saisie.replace(',', '.'));
  // Mode risque : volume tel que le stop-loss des protections coûte ce % des fonds propres.
  const modeRisque = Boolean(reglage.modeRisque);
  const risquePct = reglage.risquePct ?? 1;
  const distanceSl = reglage.protections?.actif ? reglage.protections.sl : undefined;
  const fondsPropres = useMemo(() => valeurPortefeuille(p, tous).capital, [p, tous]);
  const montantRisque = (fondsPropres * risquePct) / 100;
  const lotsRisque = prix && distanceSl ? lotsParRisque(montantRisque, prix, prix - distanceSl, symbole, tous) : null;
  const lotsRisqueBornes = lotsRisque ? Math.min(volumeMax, Math.max(0.01, Math.floor(lotsRisque * 100) / 100)) : null;
  const passer = (sens: Sens) => {
    if (modeRisque && !lotsRisqueBornes) {
      setErreur('Mode risque : réglez une distance de stop-loss dans 🛡 (et cochez « Poser sur chaque ordre »).');
      return;
    }
    const lots = modeRisque ? lotsRisqueBornes! : Number.isFinite(lotsSaisis) ? lotsSaisis : 0;
    const probleme = controleOuverture({ etat, symbole, prix, lots, volumeMax, lecture, annonce, minutesNews });
    if (probleme || !prix) {
      setErreur(probleme);
      return;
    }
    const pr = reglage.protections;
    const avecProt = pr?.actif ? pr : undefined;
    const prot = avecProt
      ? {
          stopLoss: avecProt.sl ? (sens === 'achat' ? prix - avecProt.sl : prix + avecProt.sl) : undefined,
          takeProfit: avecProt.tp ? (sens === 'achat' ? prix + avecProt.tp : prix - avecProt.tp) : undefined,
          suiveur: avecProt.suiveur,
        }
      : undefined;
    const r = ouvrir(p, symbole, sens, lots, prix, tous, { levier: etat.parametres.levier, prot, origine: 'marche', tauxCrypto: etat.parametres.frais ?? TAUX_FRAIS, volumeMax });
    if (typeof r === 'string') {
      setErreur(r);
      return;
    }
    setErreur(null);
    maj({ portefeuille: r });
    signaler(`${sens === 'achat' ? 'Achat' : 'Vente'} ${formaterLots(lots)} ${info?.code ?? symbole} à ${formaterCotation(symbole, prix)}`);
  };

  // Raccourcis : Maj+B achète, Maj+S vend (hors saisie). Le graphique TradingView garde le clavier quand on clique dedans.
  const refPasser = useRef(passer);
  refPasser.current = passer;
  useEffect(() => {
    if (!reglage.actif || !negociable) return;
    const touche = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName))) return;
      const k = e.key.toLowerCase();
      if (!['b', 's', 'x', 'r'].includes(k)) return;
      e.preventDefault();
      if (k === 'x') refFermer.current();
      else if (k === 'r') refInverser.current();
      else refPasser.current(k === 'b' ? 'achat' : 'vente');
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [reglage.actif, negociable]);

  /** Retourne la position nette : tout fermer sur l'instrument, puis ouvrir le même volume dans l'autre sens. */
  const inverser = () => {
    if (!prix || net === 0) return;
    const sens: Sens = net > 0 ? 'vente' : 'achat';
    const volume = Math.round(Math.abs(net) * 100) / 100;
    const probleme = controleOuverture({ etat, symbole, prix, lots: volume, volumeMax: Math.max(volumeMax, volume), lecture, annonce, minutesNews });
    if (probleme) return setErreur(probleme);
    const fermeture = cloturerPositions(p, tous, etat.parametres.frais ?? TAUX_FRAIS, (x) => x.symbole === symbole);
    const r = ouvrir(fermeture.portefeuille, symbole, sens, volume, prix, tous, {
      levier: etat.parametres.levier,
      origine: 'marche',
      tauxCrypto: etat.parametres.frais ?? TAUX_FRAIS,
      volumeMax: Math.max(volumeMax, volume),
    });
    if (typeof r === 'string') return setErreur(r);
    setErreur(null);
    maj({ portefeuille: r });
    signaler(`Position inversée : ${sens === 'achat' ? 'long' : 'short'} ${formaterLots(volume)} ${info?.code ?? ''} (clôture ${formaterUsdt(fermeture.resultat, true)})`);
  };

  const majProtections = (modif: Partial<NonNullable<typeof reglage.protections>>) =>
    maj({ parametres: { ...etat.parametres, unClic: { ...reglage, protections: { actif: true, ...reglage.protections, ...modif } } } });
  const [editionProt, setEditionProt] = useState(false);
  const pr = reglage.protections;
  const resumeProt = pr?.actif
    ? [pr.sl ? `SL ${pr.sl.toLocaleString('fr-FR')}` : null, pr.tp ? `TP ${pr.tp.toLocaleString('fr-FR')}` : null, pr.suiveur ? `↗ ${pr.suiveur.toLocaleString('fr-FR')}` : null].filter(Boolean).join(' · ') || 'aucune'
    : 'sans protection';

  const fermer = () => {
    if (lecture) return setErreur('Accès investisseur : lecture seule.');
    const r = cloturerPositions(p, tous, etat.parametres.frais ?? TAUX_FRAIS, (x) => x.symbole === symbole);
    if (r.fermees === 0) return;
    maj({ portefeuille: r.portefeuille });
    signaler(`${r.fermees} position${r.fermees > 1 ? 's' : ''} ${info?.code ?? ''} fermée${r.fermees > 1 ? 's' : ''} : ${formaterUsdt(r.resultat, true)}`);
  };

  const refFermer = useRef(fermer);
  refFermer.current = fermer;
  const refInverser = useRef(inverser);
  refInverser.current = inverser;

  if (!reglage.actif) {
    return (
      <div className="un-clic replie">
        <button className="lien discret" onClick={() => maj({ parametres: { ...etat.parametres, unClic: { ...reglage, actif: true } } })}>
          ⚡ Trading en un clic
        </button>
      </div>
    );
  }

  return (
    <div className="un-clic" role="toolbar" aria-label="Trading en un clic">
      <button className="uc-symbole" onClick={changerSymbole} title="Instrument tradé en un clic : cliquez pour en changer (graphique compris)">
        <strong>{info?.code ?? symbole.split(':').pop()}</strong>
        <span className="muet">⚡ 1 clic</span>
      </button>
      {!negociable ? (
        <span className="muet">Cet instrument ne se trade pas en papier ici : choisissez l'or, le forex, un indice ou une crypto de la liste.</span>
      ) : (
        <>
          <button className="uc-vente" disabled={!prix || lecture} onClick={() => passer('vente')} title="Vendre au marché (Maj+S) · Maj+X ferme l’instrument · Maj+R inverse">
            <span>Vendre</span>
            <strong>{prix ? formaterCotation(symbole, prix) : '…'}</strong>
          </button>
          {modeRisque ? (
            <div className="uc-volume uc-risque" title={distanceSl ? `Stop à ${distanceSl} du prix : ${lotsRisqueBornes ?? '—'} lots pour risquer ${formaterUsdt(montantRisque)}` : 'Réglez une distance de stop-loss dans 🛡'}>
              <input
                inputMode="decimal"
                defaultValue={risquePct}
                aria-label="Risque en % des fonds propres"
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(',', '.'));
                  if (v > 0 && v <= 100) maj({ parametres: { ...etat.parametres, unClic: { ...reglage, risquePct: v } } });
                }}
              />
              <span className="muet">
                % · {lotsRisqueBornes ? `${formaterLots(lotsRisqueBornes)} · ${formaterUsdt(montantRisque)} en jeu` : 'stop-loss à régler'}
              </span>
            </div>
          ) : (
          <div className="uc-volume">
            <button type="button" onClick={() => fixer(lotsSaisis / 10 || 0.01)} aria-label="Diviser le volume par 10">
              ÷10
            </button>
            <input
              inputMode="decimal"
              value={saisie}
              aria-label="Volume en lots"
              onChange={(e) => setSaisie(e.target.value)}
              onBlur={() => fixer(Number(saisie.replace(',', '.')) || 0.01)}
              list="uc-paliers"
            />
            <datalist id="uc-paliers">
              {PALIERS.filter((x) => x <= volumeMax).map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            <button type="button" onClick={() => fixer((lotsSaisis || 0.01) * 10)} aria-label="Multiplier le volume par 10">
              ×10
            </button>
            <span className="muet">lots</span>
          </div>
          )}
          <button
            className={`uc-mode ${modeRisque ? 'actif' : ''}`}
            onClick={() => maj({ parametres: { ...etat.parametres, unClic: { ...reglage, modeRisque: !modeRisque } } })}
            title={modeRisque ? 'Revenir à un volume en lots' : 'Calculer le volume pour risquer un % du compte au stop-loss'}
          >
            {modeRisque ? 'risque %' : 'lots'}
          </button>
          <button className="uc-achat" disabled={!prix || lecture} onClick={() => passer('achat')} title="Acheter au marché (Maj+B)">
            <span>Acheter</span>
            <strong>{prix ? formaterCotation(symbole, prix) : '…'}</strong>
          </button>
          {positions.length > 0 && (
            <div className="uc-position">
              <span className={net > 0 ? 'hausse' : net < 0 ? 'baisse' : 'muet'}>
                {net > 0 ? '+' : ''}
                {formaterLots(net)} net
              </span>
              <strong className={latent >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(latent, true)}</strong>
              <button className="bouton-secondaire petit" onClick={inverser} disabled={lecture || net === 0} title="Fermer et ouvrir le même volume dans l'autre sens">
                Inverser
              </button>
              <button className="bouton-secondaire petit" onClick={fermer} disabled={lecture}>
                Fermer {positions.length > 1 ? `les ${positions.length}` : ''}
              </button>
            </div>
          )}
          <button className={`uc-prot ${pr?.actif ? 'actif' : ''}`} onClick={() => setEditionProt((x) => !x)} title="Protections posées sur chaque ordre en un clic (distance en prix depuis l'entrée)">
            🛡 {resumeProt}
          </button>
          {editionProt && (
            <div className="uc-prot-edition">
              <label className="case">
                <input type="checkbox" checked={Boolean(pr?.actif)} onChange={(e) => majProtections({ actif: e.target.checked })} />
                Poser sur chaque ordre
              </label>
              {(
                [
                  ['sl', 'Stop-loss à'],
                  ['tp', 'Take-profit à'],
                  ['suiveur', 'Stop suiveur'],
                ] as const
              ).map(([cle, libelle]) => (
                <label key={cle}>
                  <span className="muet">{libelle}</span>
                  <input
                    inputMode="decimal"
                    placeholder="—"
                    defaultValue={pr?.[cle] ?? ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(',', '.'));
                      majProtections({ [cle]: e.target.value.trim() && v > 0 ? v : undefined });
                    }}
                  />
                </label>
              ))}
              <span className="muet petit">distances en prix depuis l'entrée (ex. 5 = 5 $ sur l'or)</span>
            </div>
          )}
          {annonce && <span className="uc-news">⛔ News {annonce.devise} : ouverture bloquée</span>}
          {erreur && (
            <span className="uc-erreur" role="alert">
              {erreur}
            </span>
          )}
        </>
      )}
      <div className="espace" />
      <button
        className="icone petit"
        onClick={() => maj({ parametres: { ...etat.parametres, unClic: { ...reglage, actif: false } } })}
        aria-label="Replier le trading en un clic"
        title="Replier"
      >
        ▴
      </button>
    </div>
  );
}
