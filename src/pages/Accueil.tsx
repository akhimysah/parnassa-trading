import { useEffect, useMemo, useState } from 'react';
import type { Etat, Page } from '../types';
import type { Tick } from '../binance';
import { estBinance, formaterPrix, paireBinance, useCloturesJournalieres } from '../binance';
import {
  compteARebours,
  drapeau,
  heureCourte,
  indicateurAffiche,
  LIBELLES_DONNEE,
  titrePrincipal,
  titreSecondaire,
  useBanquesCentrales,
  useCalendrier,
  useResultats,
  useSurprises,
  valeurCalendrier,
  type FilActualites,
} from '../actualites';
import { nomSymbole, ticker } from '../symboles';
import { formaterUsdt, PERTE_CRAME, pnlLatent, valeurPortefeuille } from '../trading';
import { mesurer, reglesCompletes } from '../challenge';
import { blocageDiscipline, mesurerJournee, mesurerMois } from '../discipline';
import type { CompteDistant } from '../compteLocal';
import { Jauge } from '../composants/Jauge';
import { MiniCourbe } from '../composants/MiniCourbe';
import { PrixAnime } from '../composants/PrixAnime';
import { Sessions } from '../composants/Sessions';
import { rappelDepuis } from '../rappels';
import { demanderNotifications } from '../alertes';

interface Props {
  etat: Etat;
  fil: FilActualites;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  /** Compte de trading connecté (null : portefeuille de l'appareil). */
  compte: CompteDistant | null;
  lecture: boolean;
  aller: (p: Page) => void;
  ouvrirSymbole: (id: string) => void;
}

function EnteteCarte({ titre, lien, aller }: { titre: string; lien?: Page; aller: (p: Page) => void }) {
  return (
    <div className="entete-carte">
      <h3>{titre}</h3>
      {lien && (
        <button className="lien discret" onClick={() => aller(lien)}>
          Tout voir →
        </button>
      )}
    </div>
  );
}

/** Tableau de bord : l'essentiel de chaque section sur un seul écran. */
export function Accueil({ etat, fil, ticks, maj, compte, lecture, aller, ouvrirSymbole }: Props) {
  const langue = etat.parametres.langueActualites;
  const l = LIBELLES_DONNEE[langue];
  const { evenements } = useCalendrier(true);
  const banques = useBanquesCentrales(true);
  const resultats = useResultats(true);
  const surprises = useSurprises(true);
  const cryptos = useMemo(() => etat.listeSuivi.filter(estBinance).slice(0, 8), [etat.listeSuivi]);
  const historiques = useCloturesJournalieres(cryptos.map(paireBinance), 30);
  const [, tic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tic((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  const annonces = fil.depeches.filter((d) => d.source === 'FinancialJuice').slice(0, 9);
  const maintenant = Date.now();
  const aVenir = evenements.filter((e) => e.importance >= 1 && e.actuel === null && e.date > maintenant).slice(0, 6);
  const publies = evenements
    .filter((e) => e.importance >= 0 && e.actuel !== null && e.date <= maintenant)
    .sort((a, b) => b.date - a.date)
    .slice(0, 4);
  const reunions = [...banques.donnees].filter((b) => b.prochaine).sort((a, b) => a.prochaine!.date - b.prochaine!.date).slice(0, 4);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const resultatsJour = resultats.donnees.filter((r) => r.date === aujourdhui).slice(0, 6);
  const suivis = new Set(etat.rappels.map((r) => r.id));

  const p = etat.portefeuille;
  const { capital, latent, immobilise } = valeurPortefeuille(p, ticks);
  const perf = ((capital - p.capitalInitial) / p.capitalInitial) * 100;
  const journee = mesurerJournee(p, capital);
  const mois = mesurerMois(p, capital, p.solde + immobilise);
  const regles = etat.parametres.discipline;
  const blocage = blocageDiscipline(p, regles);
  const ch = etat.challenge?.statut === 'en-cours' ? etat.challenge : null;
  const mesures = ch ? mesurer(ch, capital, p.solde, immobilise, p.operations) : null;
  // Règle des 99 % : part de la perte maximale déjà consommée, affichée dès la moitié du capital perdue.
  const perteCrame = Math.max(0, p.capitalInitial - capital);
  const limiteCrame = p.capitalInitial * PERTE_CRAME;
  const alertesActives = etat.alertes.filter((a) => !a.declencheeLe);

  const heure = new Date().getHours();
  const salut = heure < 6 ? 'Bonne nuit' : heure < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <div className="page defilable accueil">
      <div className="accueil-entete">
        <div>
          <h2>{salut}</h2>
          <span className="muet">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <Sessions />
      </div>

      <div className="grille-accueil">
        <div className="carte large">
          <EnteteCarte titre="Dernières annonces" lien="actualites" aller={aller} />
          {annonces.length === 0 && <p className="vide">{fil.chargement ? 'Chargement…' : 'Aucune annonce pour le moment.'}</p>}
          <ul className="depeches compactes accueil-annonces">
            {annonces.map((d) => {
              const indic = d.donnee ? indicateurAffiche(d.donnee, langue) : null;
              const secondaire = titreSecondaire(d, langue);
              return (
                <li key={d.id} className={d.important ? 'importante' : ''}>
                  <time>{heureCourte(d.date)}</time>
                  <a href={d.lien} target="_blank" rel="noopener noreferrer">
                    {d.donnee && indic ? (
                      <span className="donnee-eco">
                        <span className="indicateur">{indic.principal}</span>
                        <span className={`puce-valeur reel ${d.donnee.ecart === 1 ? 'hausse' : d.donnee.ecart === -1 ? 'baisse' : ''}`}>
                          {l.reel} <strong>{d.donnee.actuel}</strong>
                        </span>
                        <span className="puce-valeur">
                          {l.prev} {d.donnee.prevision ?? '–'}
                        </span>
                      </span>
                    ) : (
                      <>
                        {titrePrincipal(d, langue)}
                        {secondaire && <span className="titre-traduit">{secondaire}</span>}
                      </>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="carte">
          <EnteteCarte titre="Prochaines annonces fortes" lien="calendrier" aller={aller} />
          {aVenir.length === 0 && <p className="vide">Aucune annonce à fort impact à venir.</p>}
          <ul className="liste-annonces">
            {aVenir.map((e) => (
              <li key={e.id}>
                <div className="ligne-annonce">
                  <span className="drapeau">{drapeau(e.pays)}</span>
                  <span className="titre-annonce">{langue === 'en' ? e.titre : (e.titreFr ?? e.titre)}</span>
                  <button
                    className={`bouton-rappel ${suivis.has(e.id) ? 'actif' : ''}`}
                    title={suivis.has(e.id) ? 'Annuler le rappel' : 'Me prévenir avant et à la publication'}
                    onClick={() => {
                      if (suivis.has(e.id)) maj({ rappels: etat.rappels.filter((r) => r.id !== e.id) });
                      else {
                        demanderNotifications();
                        maj({ rappels: [...etat.rappels, rappelDepuis(e)] });
                      }
                    }}
                  >
                    {suivis.has(e.id) ? '🔔' : '🔕'}
                  </button>
                </div>
                <div className="meta-annonce">
                  <span className="rebours">{compteARebours(e.date)}</span>
                  <span className="muet">{heureCourte(e.date)}</span>
                  <span className="muet">
                    {l.prev.toLowerCase()} {valeurCalendrier(e.prevision, e.unite, e.echelle)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {publies.length > 0 && (
            <>
              <h4 className="sous-titre">Dernières publications</h4>
              <ul className="liste-annonces">
                {publies.map((e) => {
                  const ecart = e.actuel !== null && e.prevision !== null ? Math.sign(e.actuel - e.prevision) : 0;
                  return (
                    <li key={e.id}>
                      <div className="ligne-annonce">
                        <span className="drapeau">{drapeau(e.pays)}</span>
                        <span className="titre-annonce">{langue === 'en' ? e.titre : (e.titreFr ?? e.titre)}</span>
                        <strong className={ecart > 0 ? 'hausse' : ecart < 0 ? 'baisse' : ''}>{valeurCalendrier(e.actuel, e.unite, e.echelle)}</strong>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="carte">
          <EnteteCarte titre="Crypto en direct" lien="alertes" aller={aller} />
          {cryptos.length === 0 && <p className="vide">Ajoutez des paires Binance à votre liste de suivi.</p>}
          <ul className="liste-crypto">
            {cryptos.map((id) => {
              const t = ticks[paireBinance(id)];
              const v = t && t.ouverture24h ? ((t.prix - t.ouverture24h) / t.ouverture24h) * 100 : null;
              return (
                <li key={id} onClick={() => ouvrirSymbole(id)}>
                  <span>
                    <strong>{ticker(id).replace(/USDT$/, '')}</strong>
                    <span className="muet"> {nomSymbole(id)}</span>
                  </span>
                  <MiniCourbe valeurs={historiques[paireBinance(id)] ?? []} largeur={70} hauteur={22} />
                  <PrixAnime className="num" valeur={t?.prix} texte={t ? formaterPrix(t.prix) : '…'} />
                  <span className={`num ${v === null ? '' : v >= 0 ? 'hausse' : 'baisse'}`}>
                    {v === null ? '' : `${v >= 0 ? '+' : ''}${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="carte">
          <EnteteCarte titre={compte ? `Compte ${compte.login}` : 'Portefeuille papier'} lien="trading" aller={aller} />
          {compte && (
            <div className="accueil-compte muet">
              {compte.nom} · {compte.serveur}
              {lecture && <span className="pastille-lecture">Lecture seule</span>}
            </div>
          )}
          <div className="resume-portefeuille">
            <strong>{formaterUsdt(capital)}</strong>
            <span className={perf >= 0 ? 'hausse' : 'baisse'}>
              {perf >= 0 ? '+' : ''}
              {perf.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % depuis le départ
            </span>
            <span className="muet">
              Aujourd'hui{' '}
              <span className={journee.variation >= 0 ? 'hausse' : 'baisse'}>
                {formaterUsdt(journee.variation, true)} ({journee.pct >= 0 ? '+' : ''}
                {journee.pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)
              </span>{' '}
              · {journee.trades} trade{journee.trades > 1 ? 's' : ''}
            </span>
            <span className="muet">
              Ce mois{' '}
              <span className={mois.variation >= 0 ? 'hausse' : 'baisse'}>
                {formaterUsdt(mois.variation, true)} ({mois.pct >= 0 ? '+' : ''}
                {mois.pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)
              </span>{' '}
              · {mois.joursGagnants} j gagnant{mois.joursGagnants > 1 ? 's' : ''} / {mois.joursPerdants} perdant{mois.joursPerdants > 1 ? 's' : ''}
            </span>
            <span className="muet">
              P&amp;L latent <span className={latent >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(latent, true)}</span> · {p.positions.length} position
              {p.positions.length > 1 ? 's' : ''} · {p.ordres.length} ordre{p.ordres.length > 1 ? 's' : ''}
            </span>
          </div>
          {p.crameLe ? (
            <p className="accueil-etat danger">🔥 Compte cramé : 99 % du capital perdu, trading arrêté.</p>
          ) : blocage ? (
            <p className="accueil-etat attention">🧘 {blocage}</p>
          ) : regles?.actif ? (
            <p className="accueil-etat muet">
              🧘 Discipline active{regles.perteJourPct ? ` · perte max ${regles.perteJourPct} %/jour` : ''}
              {regles.perteMoisPct ? ` · ${regles.perteMoisPct} %/mois` : ''}
              {regles.tradesMax ? ` · ${journee.trades}/${regles.tradesMax} trades` : ''}
            </p>
          ) : null}
          {(ch && mesures) || (regles?.actif && regles.objectifMoisPct) || (!p.crameLe && perteCrame >= limiteCrame / 2) ? (
            <div className="accueil-jauges">
              {ch && mesures && (
                <>
                  <Jauge
                    libelle={`Objectif ${reglesCompletes(ch.regles).objectifPct} %`}
                    valeur={mesures.gainRealise}
                    max={mesures.objectif}
                    texte={`${formaterUsdt(Math.max(0, mesures.gainRealise))} / ${formaterUsdt(mesures.objectif)}`}
                    sens="objectif"
                  />
                  <Jauge libelle="Perte du jour" valeur={mesures.perteJour} max={mesures.limiteJour} texte={`${formaterUsdt(mesures.perteJour)} / ${formaterUsdt(mesures.limiteJour)}`} sens="limite" />
                  <Jauge libelle="Perte maximale" valeur={mesures.perteTotale} max={mesures.limiteTotale} texte={`${formaterUsdt(mesures.perteTotale)} / ${formaterUsdt(mesures.limiteTotale)}`} sens="limite" />
                </>
              )}
              {regles?.actif && regles.objectifMoisPct ? (
                <Jauge
                  libelle={`Objectif du mois +${regles.objectifMoisPct} %`}
                  valeur={mois.variation}
                  max={(mois.capitalDebut * regles.objectifMoisPct) / 100}
                  texte={`${formaterUsdt(Math.max(0, mois.variation))} / ${formaterUsdt((mois.capitalDebut * regles.objectifMoisPct) / 100)}`}
                  sens="objectif"
                />
              ) : null}
              {!p.crameLe && perteCrame >= limiteCrame / 2 && (
                <Jauge libelle="Règle des 99 %" valeur={perteCrame} max={limiteCrame} texte={`${formaterUsdt(perteCrame)} / ${formaterUsdt(limiteCrame)}`} sens="limite" />
              )}
            </div>
          ) : null}
          <ul className="liste-positions">
            {p.positions.slice(0, 4).map((pos) => {
              const prix = ticks[paireBinance(pos.symbole)]?.prix;
              const pnl = prix ? pnlLatent(pos, prix, ticks) : null;
              return (
                <li key={pos.id}>
                  <span>
                    <strong>{ticker(pos.symbole)}</strong> <span className={pos.sens === 'achat' ? 'hausse' : 'baisse'}>{pos.sens === 'achat' ? 'Long' : 'Short'}</span>
                  </span>
                  <span className={`num ${pnl === null ? '' : pnl >= 0 ? 'hausse' : 'baisse'}`}>{pnl === null ? '…' : formaterUsdt(pnl, true)}</span>
                </li>
              );
            })}
          </ul>
          <div className="ligne-alertes muet">
            🔔 {alertesActives.length} alerte{alertesActives.length > 1 ? 's' : ''} de prix active{alertesActives.length > 1 ? 's' : ''} · {etat.rappels.length} rappel
            {etat.rappels.length > 1 ? 's' : ''} d'événement
          </div>
          <div className="accueil-actions">
            <button className="bouton-principal" onClick={() => aller('trading')}>
              Trader
            </button>
            <button className="bouton-secondaire" onClick={() => aller('graphique')}>
              Graphique
            </button>
          </div>
        </div>

        <div className="carte">
          <EnteteCarte titre="Banques centrales" lien="calendrier" aller={aller} />
          <ul className="liste-banques">
            {reunions.map((b) => (
              <li key={b.pays}>
                <span className="drapeau">{drapeau(b.pays)}</span>
                <span className="titre-annonce">
                  {b.nomFr.replace(/ \(.*\)$/, '')}
                  <span className="muet"> · {b.taux === null ? '–' : `${b.taux.toLocaleString('fr-FR')} %`}</span>
                </span>
                <span className="rebours">{compteARebours(b.prochaine!.date)}</span>
              </li>
            ))}
            {reunions.length === 0 && <p className="vide">Chargement…</p>}
          </ul>
        </div>

        <div className="carte">
          <EnteteCarte titre="Surprise économique · 30 j" lien="calendrier" aller={aller} />
          <ul className="liste-surprises">
            {[...surprises.slice(0, 3), ...surprises.slice(-3)].map((s, i) => (
              <li key={`${s.pays}-${i}`}>
                <span>
                  {drapeau(s.pays)} {s.pays}
                </span>
                <span className="jauge-divergente">
                  <i className={s.indice >= 0 ? 'positif' : 'negatif'} style={{ width: `${Math.abs(s.indice) / 2}%` }} />
                </span>
                <strong className={s.indice > 0 ? 'hausse' : s.indice < 0 ? 'baisse' : ''}>
                  {s.indice > 0 ? '+' : ''}
                  {s.indice}
                </strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="carte">
          <EnteteCarte titre="Résultats du jour (US)" lien="calendrier" aller={aller} />
          {resultatsJour.length === 0 && <p className="vide">{resultats.chargement ? 'Chargement…' : "Pas de grosse publication aujourd'hui."}</p>}
          <ul className="liste-positions">
            {resultatsJour.map((r) => (
              <li key={r.symbole}>
                <span>
                  <strong>{r.symbole}</strong> <span className="muet">{r.nom.slice(0, 26)}</span>
                </span>
                <span className="num muet">
                  {r.bpaReel ? (
                    <span className={r.surprisePct !== null && r.surprisePct >= 0 ? 'hausse' : 'baisse'}>{r.bpaReel}</span>
                  ) : (
                    `prév. ${r.bpaPrevu ?? '–'}`
                  )}{' '}
                  · {r.moment === 'avant-ouverture' ? 'avant ouv.' : r.moment === 'apres-cloture' ? 'après clôt.' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
