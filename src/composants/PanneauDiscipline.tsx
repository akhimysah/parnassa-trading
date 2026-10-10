import { useState } from 'react';
import type { Etat, ReglesDiscipline } from '../types';
import { blocageDiscipline, DISCIPLINE_DEFAUT, finDuBlocage, mesurerJournee, mesurerMois } from '../discipline';
import { Jauge } from './Jauge';
import { formaterUsdt } from '../trading';

interface Props {
  etat: Etat;
  capital: number;
  /** Balance : fonds propres sans le P&L latent (solde + marges). */
  balance: number;
  maj: (p: Partial<Etat>) => void;
}

const nombre = (t: string): number | undefined => {
  const v = Number(t.replace(',', '.'));
  return t.trim() && Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Garde-fous personnels de la journée : perte max, objectif, nombre de trades ; blocage jusqu'au lendemain. */
export function PanneauDiscipline({ etat, capital, balance, maj }: Props) {
  const regles = etat.parametres.discipline ?? DISCIPLINE_DEFAUT;
  const [reglage, setReglage] = useState(false);
  const p = etat.portefeuille;
  const m = mesurerJournee(p, capital);
  const mois = mesurerMois(p, capital, balance);
  const bloque = blocageDiscipline(p, regles);
  const changer = (modif: Partial<ReglesDiscipline>) => maj({ parametres: { ...etat.parametres, discipline: { ...regles, ...modif } } });
  const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

  if (!regles.actif) {
    return (
      <div className="carte panneau-discipline repli">
        <span>
          🧘 <strong>Discipline du jour</strong>{' '}
          <span className="muet">fixez une perte max et un objectif par jour : le trading s'arrête tout seul quand ils sont atteints.</span>
        </span>
        <button className="bouton-secondaire" onClick={() => changer({ actif: true })}>
          Activer
        </button>
      </div>
    );
  }

  const limitePerte = regles.perteJourPct ? (m.capitalDebut * regles.perteJourPct) / 100 : null;
  const objectif = regles.objectifJourPct ? (m.capitalDebut * regles.objectifJourPct) / 100 : null;
  const ratioPerte = limitePerte && m.variation < 0 ? Math.min(1, -m.variation / limitePerte) : 0;
  const ratioGain = objectif && m.variation > 0 ? Math.min(1, m.variation / objectif) : 0;

  return (
    <div className={`carte panneau-discipline ${bloque ? 'bloque' : ''}`}>
      <div className="pd-entete">
        <strong>🧘 Discipline du jour</strong>
        <span className={m.variation >= 0 ? 'hausse' : 'baisse'}>
          {formaterUsdt(m.variation, true)} ({m.variation >= 0 ? '+' : ''}
          {pct(m.pct)})
        </span>
        <span className="muet">
          {m.trades} trade{m.trades > 1 ? 's' : ''}
          {regles.tradesMax ? ` / ${regles.tradesMax}` : ''} aujourd'hui
        </span>
        <div className="espace" />
        <button className="lien discret" onClick={() => setReglage((x) => !x)}>
          {reglage ? 'Fermer' : 'Régler'}
        </button>
      </div>

      {bloque && (
        <p className="pd-bloque" role="alert">
          ⛔ {bloque} Nouveaux ordres bloqués {finDuBlocage(p)}.
        </p>
      )}

      <div className="pd-jauges">
        {limitePerte !== null && (
          <div className="jauge-challenge">
            <div className="jc-entete">
              <span>Perte max du jour ({pct(regles.perteJourPct!)})</span>
              <strong>reste {formaterUsdt(Math.max(0, limitePerte + Math.min(0, m.variation)))}</strong>
            </div>
            <div className={`jc-barre ${ratioPerte >= 0.8 ? 'danger' : ratioPerte >= 0.5 ? 'attention' : 'calme'}`}>
              <i style={{ width: `${ratioPerte * 100}%` }} />
            </div>
          </div>
        )}
        {objectif !== null && (
          <div className="jauge-challenge">
            <div className="jc-entete">
              <span>Objectif du jour (+{pct(regles.objectifJourPct!)})</span>
              <strong>
                {formaterUsdt(Math.max(0, m.variation))} / {formaterUsdt(objectif)}
              </strong>
            </div>
            <div className={`jc-barre ${ratioGain >= 1 ? 'ok' : 'progres'}`}>
              <i style={{ width: `${ratioGain * 100}%` }} />
            </div>
          </div>
        )}
        {regles.perteMoisPct ? (
          <Jauge
            libelle={`Perte max du mois (${pct(regles.perteMoisPct)})`}
            valeur={Math.max(0, -mois.variation)}
            max={(mois.capitalDebut * regles.perteMoisPct) / 100}
            texte={`reste ${formaterUsdt(Math.max(0, (mois.capitalDebut * regles.perteMoisPct) / 100 + Math.min(0, mois.variation)))}`}
            sens="limite"
          />
        ) : null}
        {regles.objectifMoisPct ? (
          <Jauge
            libelle={`Objectif du mois (+${pct(regles.objectifMoisPct)})`}
            valeur={mois.variation}
            max={(mois.capitalDebut * regles.objectifMoisPct) / 100}
            texte={`${formaterUsdt(Math.max(0, mois.variation))} / ${formaterUsdt((mois.capitalDebut * regles.objectifMoisPct) / 100)}`}
            sens="objectif"
          />
        ) : null}
      </div>
      <p className="pd-mois muet">
        Ce mois-ci :{' '}
        <span className={mois.variation >= 0 ? 'hausse' : 'baisse'}>
          {formaterUsdt(mois.variation, true)} ({mois.pct >= 0 ? '+' : ''}
          {pct(mois.pct)})
        </span>{' '}
        · {mois.joursGagnants} jour{mois.joursGagnants > 1 ? 's' : ''} gagnant{mois.joursGagnants > 1 ? 's' : ''}, {mois.joursPerdants} perdant{mois.joursPerdants > 1 ? 's' : ''}
      </p>

      {reglage && (
        <div className="pd-reglage">
          <label>
            <span className="muet">Perte max / jour (%)</span>
            <input inputMode="decimal" defaultValue={regles.perteJourPct ?? ''} placeholder="aucune" onBlur={(e) => changer({ perteJourPct: nombre(e.target.value) })} />
          </label>
          <label>
            <span className="muet">Objectif / jour (%)</span>
            <input inputMode="decimal" defaultValue={regles.objectifJourPct ?? ''} placeholder="aucun" onBlur={(e) => changer({ objectifJourPct: nombre(e.target.value) })} />
          </label>
          <label>
            <span className="muet">Trades max / jour</span>
            <input inputMode="numeric" defaultValue={regles.tradesMax ?? ''} placeholder="illimité" onBlur={(e) => changer({ tradesMax: nombre(e.target.value) ? Math.round(nombre(e.target.value)!) : undefined })} />
          </label>
          <label>
            <span className="muet">Perte max / mois (%)</span>
            <input inputMode="decimal" defaultValue={regles.perteMoisPct ?? ''} placeholder="aucune" onBlur={(e) => changer({ perteMoisPct: nombre(e.target.value) })} />
          </label>
          <label>
            <span className="muet">Objectif / mois (%)</span>
            <input inputMode="decimal" defaultValue={regles.objectifMoisPct ?? ''} placeholder="aucun" onBlur={(e) => changer({ objectifMoisPct: nombre(e.target.value) })} />
          </label>
          <label className="case">
            <input type="checkbox" checked={regles.fermerAuto} onChange={(e) => changer({ fermerAuto: e.target.checked })} />
            Fermer les positions quand la perte max ou l'objectif est atteint
          </label>
          <label className="case">
            <input type="checkbox" checked={Boolean(regles.fermetureWeekend)} onChange={(e) => changer({ fermetureWeekend: e.target.checked })} />
            Fermer avant le week-end (hors crypto, vendredi 21 h 50 UTC) et ne pas rouvrir avant dimanche soir
          </label>
          <button
            className="lien discret danger"
            onClick={() => {
              if (window.confirm('Désactiver la discipline du jour ? Les limites ne s’appliqueront plus.')) changer({ actif: false });
            }}
          >
            Désactiver
          </button>
          <span className="muet petit">Les limites se comptent depuis les fonds propres du début de journée, ou de l'activation si elle a eu lieu dans la journée ({formaterUsdt(m.capitalDebut)}). Un blocage dure jusqu'au lendemain ; celui de la perte du mois, jusqu'au 1er du mois suivant. Le mois se compte depuis les opérations du mois (réalisé + P&L latent).</span>
        </div>
      )}
    </div>
  );
}
