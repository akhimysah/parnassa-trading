import { useMemo, useState } from 'react';
import type { Challenge, Etat, Portefeuille } from '../types';
import type { CompteDistant } from '../compteLocal';
import { CAPITAUX, dateDuJour, demanderVersement, FORMULES, FORMULES_OUVERTES, formuleSuivante, mesurer, nouveauChallenge, prochainVersement, reglesCompletes } from '../challenge';
import { Certificat } from './Certificat';
import { formaterUsdt, reinitialiser } from '../trading';
import { Jauge } from './Jauge';
import { monteCarlo, rendementsTrades } from '../montecarlo';

interface Props {
  etat: Etat;
  capital: number;
  marges: number;
  maj: (p: Partial<Etat>) => void;
  /** Compte de trading connecté : démo (pas de challenge ici) ou challenge (règles fixées à l'ouverture). */
  compte?: CompteDistant | null;
  /** Compte challenge réussi en phase 1 : ouvre le compte de la phase suivante. */
  ouvrirPhaseSuivante?: () => void;
}

/**
 * Formules ouvertes, chacune avec la probabilité de la réussir estimée en rejouant vos trades
 * (Monte-Carlo : objectif avant la perte max, perte du jour et limite suiveuse comprises).
 */
function ChoixFormule({ formule, choisir, portefeuille }: { formule: string; choisir: (id: string) => void; portefeuille: Portefeuille }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chances = useMemo(() => {
    const rendements = rendementsTrades(portefeuille);
    if (rendements.length < MIN_TRADES_CHANCES) return null;
    const jours = new Set(portefeuille.operations.filter((o) => o.type === 'cloture').map((o) => dateDuJour(o.date))).size;
    const tradesParJour = jours ? rendements.length / jours : 1;
    return new Map(
      FORMULES_OUVERTES.map((f) => {
        const r = monteCarlo(rendements, { trades: 200, simulations: 600, objectifPct: f.regles.objectifPct, perteMaxPct: f.regles.perteMaxPct, perteJourPct: f.regles.perteJourPct, suiveuse: f.regles.suiveuse, tradesParJour });
        return [f.id, r.probaObjectif ?? 0];
      }),
    );
  }, [portefeuille.operations, portefeuille.capitalInitial]);
  const nb = useMemo(() => portefeuille.operations.filter((o) => o.type === 'cloture').length, [portefeuille.operations]);

  return (
    <>
      <div className="pc-formules">
        {FORMULES_OUVERTES.map((f) => {
          const p = chances?.get(f.id);
          return (
            <button key={f.id} className={`pc-formule ${formule === f.id ? 'actif' : ''}`} onClick={() => choisir(f.id)}>
              <strong>{f.nom}</strong>
              <span className="muet">{f.description}</span>
              {p !== undefined && (
                <span className={`pc-chances ${p >= 0.6 ? 'hausse' : p < 0.3 ? 'baisse' : ''}`}>🎯 {Math.round(p * 100)} % de chances</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="muet petit pc-chances-note">
        {chances
          ? `Chances estimées en rejouant vos ${nb} trades clôturés 600 fois (objectif avant la perte max, perte du jour et limite suiveuse comprises). Une estimation, pas une promesse.`
          : `Après ${MIN_TRADES_CHANCES} trades clôturés, chaque formule affichera vos chances de la réussir d'après votre historique.`}
      </p>
    </>
  );
}

const MIN_TRADES_CHANCES = 10;

const STATUTS: Record<Challenge['statut'], string> = { 'en-cours': 'En cours', reussi: 'Réussi 🏆', echoue: 'Échoué' };

/** Mode challenge façon prop firm : démarrage, jauges des règles, fin et historique. */
export function PanneauChallenge({ etat, capital, marges, maj, compte, ouvrirPhaseSuivante }: Props) {
  const ch = etat.challenge;
  const [formule, setFormule] = useState(FORMULES[0].id);
  const [montant, setMontant] = useState(100000);
  const [replie, setReplie] = useState(false);
  const [certificat, setCertificat] = useState<Challenge | null>(null);
  const [erreurVersement, setErreurVersement] = useState<string | null>(null);

  const archiver = (c: Challenge | null) => (c ? [c, ...(etat.challengesPasses ?? [])].slice(0, 30) : (etat.challengesPasses ?? []));

  const demarrer = () => {
    const f = FORMULES.find((x) => x.id === formule)!;
    const message = ch
      ? `Démarrer un nouveau challenge ${f.nom} de ${montant.toLocaleString('fr-FR')} $ ? Le compte du challenge actuel repart à zéro.`
      : `Démarrer un challenge ${f.nom} de ${montant.toLocaleString('fr-FR')} $ ?\n\nVotre portefeuille papier actuel est mis de côté et sera restauré quand vous quitterez le mode challenge.`;
    if (!window.confirm(message)) return;
    const enCours = ch && ch.statut === 'en-cours' ? { ...ch, statut: 'echoue' as const, raison: 'Abandonné pour un nouveau challenge.', finLe: Date.now(), capitalFin: capital } : ch;
    maj({
      portefeuilleHorsChallenge: ch ? etat.portefeuilleHorsChallenge : etat.portefeuille,
      portefeuille: reinitialiser(montant),
      challenge: nouveauChallenge({ formule: f.nom, capital: montant, ...f.regles }),
      challengesPasses: archiver(enCours),
    });
  };

  /** Phase 1 réussie, en local : la phase 2 démarre avec le même capital. */
  const passerPhaseSuivante = () => {
    if (!ch) return;
    const suivante = formuleSuivante(ch.regles.formule);
    if (!suivante) return;
    if (compte) return ouvrirPhaseSuivante?.();
    if (!window.confirm(`Démarrer la ${suivante.nom} avec ${ch.regles.capital.toLocaleString('fr-FR')} $ ?`)) return;
    maj({
      portefeuille: reinitialiser(ch.regles.capital),
      challenge: nouveauChallenge({ formule: suivante.nom, capital: ch.regles.capital, ...suivante.regles }),
      challengesPasses: archiver(ch),
    });
  };

  const abandonner = () => {
    if (!ch || !window.confirm('Abandonner ce challenge ? Il sera compté comme échoué.')) return;
    maj({ challenge: { ...ch, statut: 'echoue', raison: 'Abandonné.', finLe: Date.now(), capitalFin: capital } });
  };

  const quitter = () => {
    if (!ch) return;
    if (!window.confirm('Quitter le mode challenge et retrouver votre portefeuille papier habituel ?')) return;
    const fini = ch.statut === 'en-cours' ? { ...ch, statut: 'echoue' as const, raison: 'Abandonné.', finLe: Date.now(), capitalFin: capital } : ch;
    maj({
      challenge: null,
      portefeuille: etat.portefeuilleHorsChallenge ?? reinitialiser(),
      portefeuilleHorsChallenge: null,
      challengesPasses: archiver(fini),
    });
  };

  if (compte && (compte.type === 'demo' || !ch)) return null;
  if (!ch) {
    return (
      <div className="carte panneau-challenge">
        <div className="entete-carte">
          <h3>Mode challenge · prop firm</h3>
          <button className="lien discret" onClick={() => setReplie((r) => !r)}>
            {replie ? 'Afficher' : 'Masquer'}
          </button>
        </div>
        {!replie && (
          <div className="pc-depart">
            <p className="muet">
              Passez un challenge comme chez FTMO : atteignez l'objectif de profit sans dépasser la perte journalière ni la perte maximale. Une règle
              franchie fait échouer le challenge et ferme les positions.
            </p>
            <ChoixFormule formule={formule} choisir={setFormule} portefeuille={etat.portefeuille} />
            <div className="pc-capital">
              <span className="muet">Capital</span>
              {CAPITAUX.map((c) => (
                <button key={c} className={`puce-bascule ${montant === c ? 'actif' : ''}`} onClick={() => setMontant(c)}>
                  {(c / 1000).toLocaleString('fr-FR')} k$
                </button>
              ))}
              <button className="bouton-principal" onClick={demarrer}>
                Démarrer le challenge
              </button>
            </div>
            {(etat.challengesPasses ?? []).length > 0 && <HistoriqueChallenges passes={etat.challengesPasses ?? []} certificat={setCertificat} />}
            {certificat && <Certificat challenge={certificat} fermer={() => setCertificat(null)} />}
          </div>
        )}
      </div>
    );
  }

  const m = mesurer(ch, capital, etat.portefeuille.solde, marges, etat.portefeuille.operations);
  const r = reglesCompletes(ch.regles);
  const suivante = ch.statut === 'reussi' ? formuleSuivante(r.formule) : undefined;
  const versements = ch.versements ?? [];
  const totalVerse = versements.reduce((t, v) => t + v.montant, 0);
  const prochain = prochainVersement(ch);
  const verser = () => {
    const resultat = demanderVersement(ch, etat.portefeuille);
    if (typeof resultat === 'string') return setErreurVersement(resultat);
    if (!window.confirm(`Retirer ${formaterUsdt(resultat.versement.profit)} de profit ? Vous recevez ${formaterUsdt(resultat.versement.montant)} (${r.partage ?? 80} %), le compte repart de ${formaterUsdt(r.capital)}.`)) return;
    setErreurVersement(null);
    maj({ challenge: resultat.challenge, portefeuille: resultat.portefeuille });
  };
  const pct = (v: number) => `${((v / r.capital) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  const duree = Math.max(1, Math.round(((ch.finLe ?? Date.now()) - ch.debutLe) / 86400000));

  return (
    <div className={`carte panneau-challenge statut-${ch.statut}`}>
      <div className="entete-carte">
        <h3>
          {r.finance ? '💼 ' : 'Challenge '}
          {r.formule} · {r.capital.toLocaleString('fr-FR')} $
        </h3>
        <span className={`pc-statut ${ch.statut}`}>{r.finance && ch.statut === 'en-cours' ? 'Actif' : r.finance && ch.statut === 'echoue' ? 'Clôturé' : STATUTS[ch.statut]}</span>
      </div>
      {ch.statut !== 'en-cours' && ch.raison && <p className={`pc-raison ${ch.statut}`}>{ch.raison}</p>}
      <div className="pc-jauges">
        {r.finance ? (
          <div className="jauge-challenge pc-profit">
            <div className="jc-entete">
              <span>Profit réalisé · votre part {r.partage ?? 80} %</span>
              <strong className={m.gainRealise >= 0 ? 'hausse' : 'baisse'}>
                {formaterUsdt(m.gainRealise, true)} → {formaterUsdt(Math.max(0, m.gainRealise) * ((r.partage ?? 80) / 100))}
              </strong>
            </div>
          </div>
        ) : (
          <Jauge
            libelle={`Objectif +${r.objectifPct} % (positions fermées)`}
            valeur={Math.max(0, m.gainRealise)}
            max={m.objectif}
            sens="objectif"
            texte={`${formaterUsdt(m.gainRealise, true)} / ${formaterUsdt(m.objectif)}`}
          />
        )}
        <Jauge
          libelle={`Perte du jour (max ${r.perteJourPct} %)`}
          valeur={m.perteJour}
          max={m.limiteJour}
          sens="limite"
          texte={`${pct(m.perteJour)} · reste ${formaterUsdt(Math.max(0, m.limiteJour - m.perteJour))}`}
        />
        <Jauge
          libelle={r.suiveuse ? `Perte max suiveuse (${r.perteMaxPct} %)` : `Perte maximale (max ${r.perteMaxPct} %)`}
          valeur={m.perteTotale}
          max={m.limiteTotale}
          sens="limite"
          texte={r.suiveuse ? `plancher ${Math.round(m.plancher).toLocaleString('fr-FR')} $ · reste ${Math.round(Math.max(0, m.limiteTotale - m.perteTotale)).toLocaleString('fr-FR')} $` : `${pct(m.perteTotale)} · reste ${formaterUsdt(Math.max(0, m.limiteTotale - m.perteTotale))}`}
        />
        {r.regularitePct ? (
          <Jauge
            libelle={`Régularité (meilleur jour ≤ ${r.regularitePct} %)`}
            valeur={m.meilleurJourPct ?? 0}
            max={r.regularitePct}
            sens="limite"
            texte={m.meilleurJourPct === null ? 'pas encore de profit' : `${Math.round(m.meilleurJourPct)} % (${formaterUsdt(m.meilleurJour, true)})`}
          />
        ) : null}
        {!r.finance && (
          <Jauge
            libelle={`Jours de trading (min ${r.joursMin})`}
            valeur={m.jours}
            max={Math.max(1, r.joursMin)}
            sens="objectif"
            texte={`${m.jours} / ${r.joursMin}`}
          />
        )}
      </div>
      {r.finance && ch.statut === 'en-cours' && (
        <div className="pc-versements">
          <div className="pv-entete">
            <div>
              <strong>💸 Versements</strong>
              <span className="muet">
                {totalVerse > 0 ? `${formaterUsdt(totalVerse)} versés en ${versements.length} fois` : 'Aucun versement pour le moment'} · prochain possible{' '}
                {Date.now() >= prochain ? 'dès maintenant' : `le ${new Date(prochain).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
              </span>
            </div>
            <button className="bouton-principal" onClick={verser} disabled={Date.now() < prochain || m.gainRealise <= 0}>
              Demander un versement
            </button>
          </div>
          {erreurVersement && <p className="erreur">{erreurVersement}</p>}
          {versements.length > 0 && (
            <ul>
              {[...versements].reverse().map((v) => (
                <li key={v.date}>
                  <span className="muet">{new Date(v.date).toLocaleDateString('fr-FR')}</span>
                  <span>profit {formaterUsdt(v.profit)}</span>
                  <strong className="hausse">+{formaterUsdt(v.montant)} versés</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {compte && (
        <p className="muet petit pc-compte">
          Compte challenge n° {compte.login} ({compte.serveur}) : règles fixées à l'ouverture.{' '}
          {ch.statut !== 'en-cours' ? 'Pour retenter, ouvrez un nouveau compte challenge dans « Comptes et accès ».' : ''}
        </p>
      )}
      {r.fermetureWeekend ? (
        <p className="pc-regle-news">📅 Fermeture du week-end : positions hors crypto fermées le vendredi à 21 h 50 UTC, aucune ouverture avant le dimanche 22 h UTC.</p>
      ) : null}
      {r.newsMinutes ? (
        <p className="pc-regle-news">📰 Règle des news : aucune ouverture de position {r.newsMinutes} min avant et après une annonce à fort impact sur la devise de l'instrument.</p>
      ) : null}
      {ch.statut === 'reussi' && (
        <div className="pc-succes">
          <span>🏆</span>
          <div>
            <strong>{suivante && suivante.id !== 'finance' ? 'Phase validée !' : 'Félicitations, vous êtes trader financé !'}</strong>
            <span className="muet">
              {suivante?.id === 'finance'
                ? `Ouvrez votre compte financé de ${formaterUsdt(r.capital)} : ${suivante.description}`
                : suivante
                  ? `Prochaine étape : ${suivante.nom} (${suivante.description.split('.')[0]}).`
                  : 'Téléchargez votre certificat et partagez-le.'}
            </span>
          </div>
          <div className="espace" />
          <button className="bouton-secondaire" onClick={() => setCertificat(ch)}>
            Voir le certificat
          </button>
          {suivante && (
            <button className="bouton-principal" onClick={passerPhaseSuivante}>
              {suivante.id === 'finance' ? 'Ouvrir mon compte financé' : `Passer à la ${suivante.nom.toLowerCase()}`}
            </button>
          )}
        </div>
      )}
      {certificat && <Certificat challenge={certificat} login={compte?.login} fermer={() => setCertificat(null)} />}
      <div className="pc-pied">
        <span className="muet">
          Démarré le {new Date(ch.debutLe).toLocaleDateString('fr-FR')} · {duree} jour{duree > 1 ? 's' : ''} · fonds propres {formaterUsdt(capital)} · plus bas{' '}
          {formaterUsdt(ch.plusBas)}
        </span>
        <div className="espace" />
        {!compte && (ch.statut === 'en-cours' ? (
          <button className="bouton-secondaire danger" onClick={abandonner}>
            Abandonner
          </button>
        ) : (
          <button className="bouton-principal" onClick={demarrer}>
            Nouveau challenge
          </button>
        ))}
        {!compte && (
          <button className="bouton-secondaire" onClick={quitter}>
            Quitter le mode challenge
          </button>
        )}
      </div>
      {ch.statut !== 'en-cours' && !compte && (
        <div className="pc-relance">
          <span className="muet">Formule</span>
          <select className="selecteur" value={formule} onChange={(e) => setFormule(e.target.value)}>
            {FORMULES_OUVERTES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
          <select className="selecteur" value={montant} onChange={(e) => setMontant(Number(e.target.value))}>
            {CAPITAUX.map((c) => (
              <option key={c} value={c}>
                {c.toLocaleString('fr-FR')} $
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function HistoriqueChallenges({ passes, certificat }: { passes: Challenge[]; certificat: (c: Challenge) => void }) {
  return (
    <div className="pc-historique">
      <h4 className="sous-titre">Challenges précédents</h4>
      <ul>
        {passes.slice(0, 8).map((c) => {
          const res = (c.capitalFin ?? c.regles.capital) - c.regles.capital;
          return (
            <li key={c.id}>
              <span className={`pc-statut ${c.statut}`}>{STATUTS[c.statut]}</span>
              <span>
                {c.regles.formule} · {c.regles.capital.toLocaleString('fr-FR')} $
              </span>
              <span className={res >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(res, true)}</span>
              {c.statut === 'reussi' && (
                <button className="lien discret" onClick={() => certificat(c)}>
                  Certificat
                </button>
              )}
              <span className="muet">
                {new Date(c.debutLe).toLocaleDateString('fr-FR')}
                {c.finLe ? ` → ${new Date(c.finLe).toLocaleDateString('fr-FR')}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
