import { useEffect, useMemo, useRef, useState } from 'react';
import type { Etat } from '../types';
import {
  compteARebours,
  drapeau,
  LIBELLES_DONNEE,
  useBanquesCentrales,
  useCalendrier,
  useResultats,
  useSurprises,
  valeurCalendrier,
  type EvenementCalendrier,
  type Resultat,
} from '../actualites';
import { Sessions } from '../composants/Sessions';
import { Surprises } from '../composants/Surprises';

interface Props {
  etat: Etat;
  maj: (p: Partial<Etat>) => void;
}

const PAYS: { code: string; libelle: string }[] = [
  { code: 'US', libelle: 'États-Unis' },
  { code: 'EU', libelle: 'Zone euro' },
  { code: 'FR', libelle: 'France' },
  { code: 'DE', libelle: 'Allemagne' },
  { code: 'GB', libelle: 'Royaume-Uni' },
  { code: 'JP', libelle: 'Japon' },
  { code: 'CN', libelle: 'Chine' },
  { code: 'CA', libelle: 'Canada' },
  { code: 'AU', libelle: 'Australie' },
  { code: 'CH', libelle: 'Suisse' },
  { code: 'IT', libelle: 'Italie' },
  { code: 'ES', libelle: 'Espagne' },
  { code: 'NZ', libelle: 'Nouvelle-Zélande' },
];

type Impact = 'tous' | 'moyen' | 'fort';
type Vue = 'economie' | 'banques' | 'resultats';

const CLE_FILTRES = 'parnassa-trading:calendrier:v1';

function lireFiltres(): { pays: string[]; impact: Impact } {
  try {
    const brut = localStorage.getItem(CLE_FILTRES);
    if (brut) return JSON.parse(brut) as { pays: string[]; impact: Impact };
  } catch {
    // stockage indisponible
  }
  return { pays: ['US', 'EU', 'FR', 'DE', 'GB', 'JP', 'CN'], impact: 'moyen' };
}

function Importance({ niveau }: { niveau: number }) {
  const n = niveau >= 1 ? 3 : niveau === 0 ? 2 : 1;
  return (
    <span className={`importance imp-${n}`} title={n === 3 ? 'Fort impact' : n === 2 ? 'Impact moyen' : 'Faible impact'}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? 'plein' : ''} />
      ))}
    </span>
  );
}

function cleJour(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Calendrier économique de la semaine, bilingue, avec valeurs publiées et compte à rebours. */
export function Calendrier({ etat, maj }: Props) {
  const [vue, setVue] = useState<Vue>('economie');
  const { evenements, chargement } = useCalendrier(true);
  const surprises = useSurprises(vue === 'economie');
  const banques = useBanquesCentrales(vue === 'banques');
  const resultats = useResultats(vue === 'resultats');
  const [filtres, setFiltres] = useState(lireFiltres);
  const [recherche, setRecherche] = useState('');
  const [, tic] = useState(0);
  const refAujourdhui = useRef<HTMLElement>(null);
  const refDefilement = useRef<HTMLDivElement>(null);
  const defileFait = useRef(false);
  const langue = etat.parametres.langueActualites;
  const l = LIBELLES_DONNEE[langue];

  useEffect(() => {
    try {
      localStorage.setItem(CLE_FILTRES, JSON.stringify(filtres));
    } catch {
      // stockage indisponible
    }
  }, [filtres]);

  useEffect(() => {
    const t = window.setInterval(() => tic((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const filtres_ = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return evenements.filter(
      (e) =>
        (filtres.pays.length === 0 || filtres.pays.includes(e.pays)) &&
        (filtres.impact === 'tous' || (filtres.impact === 'moyen' ? e.importance >= 0 : e.importance >= 1)) &&
        (!q || `${e.titre} ${e.titreFr ?? ''}`.toLowerCase().includes(q)),
    );
  }, [evenements, filtres, recherche]);

  const prochain = filtres_.find((e) => e.actuel === null && e.date > Date.now());

  const parJour = useMemo(() => {
    const groupes: { cle: string; libelle: string; date: number; evenements: EvenementCalendrier[] }[] = [];
    for (const e of filtres_) {
      const cle = cleJour(e.date);
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.cle === cle) dernier.evenements.push(e);
      else
        groupes.push({
          cle,
          date: e.date,
          libelle: new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
          evenements: [e],
        });
    }
    return groupes;
  }, [filtres_]);

  const cleAujourdhui = cleJour(Date.now());
  useEffect(() => {
    const conteneur = refDefilement.current;
    const section = refAujourdhui.current;
    if (!defileFait.current && conteneur && section) {
      conteneur.scrollTop = section.offsetTop; // le conteneur est positionné : offsetTop lui est relatif
      defileFait.current = true;
    }
  }, [parJour]);

  const basculerPays = (code: string) =>
    setFiltres((f) => ({ ...f, pays: f.pays.includes(code) ? f.pays.filter((c) => c !== code) : [...f.pays, code] }));

  return (
    <div className="page calendrier-page">
      <div className="barre-vues">
        <div className="segmente compact">
          {(
            [
              ['economie', 'Économie'],
              ['banques', 'Banques centrales'],
              ['resultats', 'Résultats'],
            ] as [Vue, string][]
          ).map(([v, libelle]) => (
            <button key={v} className={vue === v ? 'actif neutre' : ''} onClick={() => setVue(v)}>
              {libelle}
            </button>
          ))}
        </div>
        <Sessions />
      </div>

      {vue === 'banques' && <VueBanques banques={banques.donnees} chargement={banques.chargement} langue={langue} />}
      {vue === 'resultats' && <VueResultats resultats={resultats.donnees} chargement={resultats.chargement} />}

      {vue === 'economie' && (
      <>
      <div className="onglets">
        {PAYS.map((p) => (
          <button key={p.code} className={filtres.pays.includes(p.code) ? 'actif' : ''} onClick={() => basculerPays(p.code)} title={p.libelle}>
            {drapeau(p.code)} {p.code}
          </button>
        ))}
        <div className="outils-onglets outils-actualites">
          <input className="champ-texte" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (CPI, PIB, BCE…)" />
          <div className="segmente compact">
            {(['tous', 'moyen', 'fort'] as Impact[]).map((i) => (
              <button key={i} className={filtres.impact === i ? 'actif neutre' : ''} onClick={() => setFiltres((f) => ({ ...f, impact: i }))}>
                {i === 'tous' ? 'Tout impact' : i === 'moyen' ? 'Moyen +' : 'Fort'}
              </button>
            ))}
          </div>
          <div className="segmente compact">
            {(['fr+en', 'fr', 'en'] as const).map((lg) => (
              <button key={lg} className={langue === lg ? 'actif neutre' : ''} onClick={() => maj({ parametres: { ...etat.parametres, langueActualites: lg } })}>
                {lg === 'fr+en' ? 'FR + EN' : lg.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fil-etat">
        <span className="muet">
          <span className="point-direct" aria-hidden /> {filtres_.length} événement{filtres_.length > 1 ? 's' : ''} · d'hier à J+6 · heure locale
        </span>
        {prochain && (
          <span className="prochaine-annonce">
            Prochain : {drapeau(prochain.pays)} {langue === 'en' ? prochain.titre : (prochain.titreFr ?? prochain.titre)} <strong>{compteARebours(prochain.date)}</strong>
          </span>
        )}
      </div>

      <Surprises pays={surprises} langue={langue} />

      <div className="calendrier-defilement" ref={refDefilement}>
        {chargement && evenements.length === 0 && <p className="vide">Chargement du calendrier…</p>}
        {!chargement && filtres_.length === 0 && <p className="vide">Aucun événement avec ces filtres.</p>}
        {parJour.map((g) => (
          <section key={g.cle} ref={g.cle === cleAujourdhui ? refAujourdhui : undefined}>
            <h4 className={`jour ${g.cle === cleAujourdhui ? 'aujourdhui' : ''}`}>
              {g.libelle}
              {g.cle === cleAujourdhui && <span className="pastille-aujourdhui">Aujourd'hui</span>}
            </h4>
            <div className="defilement-x">
              <table className="tableau-prix tableau-calendrier">
                <thead>
                  <tr>
                    <th>Heure</th>
                    <th>Pays</th>
                    <th>Événement</th>
                    <th>Impact</th>
                    <th className="num">{l.reel}</th>
                    <th className="num">{l.prev}</th>
                    <th className="num">{l.prec}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.evenements.map((e) => {
                    const passe = e.date <= Date.now();
                    const ecart = e.actuel !== null && e.prevision !== null ? Math.sign(e.actuel - e.prevision) : null;
                    const fr = e.titreFr ?? e.titre;
                    const estProchain = prochain?.id === e.id;
                    return (
                      <tr key={e.id} className={`${passe ? 'passe' : ''} ${estProchain ? 'prochain' : ''}`}>
                        <td className="heure">
                          {new Date(e.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {!passe && e.date - Date.now() < 6 * 3600000 && <span className="rebours-ligne">{compteARebours(e.date)}</span>}
                        </td>
                        <td>
                          <span className="drapeau">{drapeau(e.pays)}</span> {e.devise}
                        </td>
                        <td className="evenement">
                          <span>
                            {langue === 'en' ? e.titre : fr} {e.periode && <span className="muet">({e.periode})</span>}
                          </span>
                          {langue === 'fr+en' && e.titre !== fr && <span className="titre-traduit">{e.titre}</span>}
                        </td>
                        <td>
                          <Importance niveau={e.importance} />
                        </td>
                        <td className={`num reel ${ecart === 1 ? 'hausse' : ecart === -1 ? 'baisse' : ''}`}>
                          <span className="muet etiquette-mobile">{l.reel} </span>
                          {valeurCalendrier(e.actuel, e.unite, e.echelle)}
                          {ecart === 1 && ' ▲'}
                          {ecart === -1 && ' ▼'}
                          <span className="valeurs-mobile">
                            {l.prev} {valeurCalendrier(e.prevision, e.unite, e.echelle)} · {l.prec} {valeurCalendrier(e.precedent, e.unite, e.echelle)}
                          </span>
                        </td>
                        <td className="num muet">{valeurCalendrier(e.prevision, e.unite, e.echelle)}</td>
                        <td className="num muet">{valeurCalendrier(e.precedent, e.unite, e.echelle)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      </>
      )}
    </div>
  );
}

function VueBanques({ banques, chargement, langue }: { banques: import('../actualites').BanqueCentrale[]; chargement: boolean; langue: 'fr' | 'en' | 'fr+en' }) {
  const [, tic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tic((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  const tries = [...banques].sort((a, b) => (a.prochaine?.date ?? Infinity) - (b.prochaine?.date ?? Infinity));
  return (
    <div className="calendrier-defilement">
      {chargement && banques.length === 0 && <p className="vide">Chargement des banques centrales…</p>}
      <div className="grille-banques">
        {tries.map((b) => {
          const v = b.derniere?.variation ?? null;
          return (
            <div key={b.pays} className="carte carte-banque">
              <div className="banque-entete">
                <span className="drapeau">{drapeau(b.pays)}</span>
                <span>
                  <strong>{langue === 'en' ? b.nom : b.nomFr}</strong>
                  {langue === 'fr+en' && <span className="titre-traduit">{b.nom}</span>}
                </span>
                <span className="pastille">{b.devise}</span>
              </div>
              <div className="banque-taux">
                <strong>{b.taux === null ? '–' : `${b.taux.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`}</strong>
                {v !== null && (
                  <span className={v > 0 ? 'hausse' : v < 0 ? 'baisse' : 'muet'}>
                    {v > 0 ? `▲ +${v.toLocaleString('fr-FR')} pt` : v < 0 ? `▼ ${v.toLocaleString('fr-FR')} pt` : 'inchangé'}
                  </span>
                )}
              </div>
              <dl className="banque-dates">
                <div>
                  <dt>Dernière décision</dt>
                  <dd>{b.derniere ? new Date(b.derniere.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '–'}</dd>
                </div>
                <div>
                  <dt>Prochaine réunion</dt>
                  <dd>
                    {b.prochaine ? (
                      <>
                        {new Date(b.prochaine.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })}{' '}
                        <span className="rebours">{compteARebours(b.prochaine.date)}</span>
                        {b.prochaine.prevision !== null && <span className="muet"> · prév. {b.prochaine.prevision.toLocaleString('fr-FR')} %</span>}
                      </>
                    ) : (
                      <span className="muet">pas encore au calendrier</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VueResultats({ resultats, chargement }: { resultats: Resultat[]; chargement: boolean }) {
  const [recherche, setRecherche] = useState('');
  const q = recherche.trim().toLowerCase();
  const filtres = resultats.filter((r) => !q || r.symbole.toLowerCase().includes(q) || r.nom.toLowerCase().includes(q));
  const jours = [...new Set(filtres.map((r) => r.date))].sort();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const milliards = (v: number | null) => (v === null ? '–' : v >= 1e9 ? `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md$` : `${Math.round(v / 1e6).toLocaleString('fr-FR')} M$`);
  return (
    <div className="calendrier-defilement">
      <div className="fil-etat">
        <span className="muet">Résultats trimestriels des sociétés cotées aux États-Unis (source Nasdaq), d'hier à J+7, 40 plus grosses capitalisations par jour.</span>
        <input className="champ-texte" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Société ou symbole…" />
      </div>
      {chargement && resultats.length === 0 && <p className="vide">Chargement des résultats…</p>}
      {!chargement && filtres.length === 0 && <p className="vide">Aucun résultat trouvé.</p>}
      {jours.map((j) => (
        <section key={j}>
          <h4 className={`jour ${j === aujourdhui ? 'aujourdhui' : ''}`}>
            {new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {j === aujourdhui && <span className="pastille-aujourdhui">Aujourd'hui</span>}
          </h4>
          <div className="defilement-x">
            <table className="tableau-prix tableau-resultats">
              <thead>
                <tr>
                  <th>Société</th>
                  <th>Moment</th>
                  <th className="num">Capitalisation</th>
                  <th className="num">BPA prévu</th>
                  <th className="num">BPA publié</th>
                  <th className="num">Surprise</th>
                  <th className="num">BPA an dernier</th>
                </tr>
              </thead>
              <tbody>
                {filtres
                  .filter((r) => r.date === j)
                  .map((r) => (
                    <tr key={`${r.date}-${r.symbole}`}>
                      <td>
                        <strong>{r.symbole}</strong> <span className="muet">{r.nom}</span>
                        {r.trimestre && <span className="muet"> · T. clos {r.trimestre}</span>}
                      </td>
                      <td className="muet">{r.moment === 'avant-ouverture' ? 'Avant ouverture' : r.moment === 'apres-cloture' ? 'Après clôture' : '–'}</td>
                      <td className="num">{milliards(r.capitalisation)}</td>
                      <td className="num muet">{r.bpaPrevu ?? '–'}</td>
                      <td className="num">
                        <strong>{r.bpaReel ?? '–'}</strong>
                      </td>
                      <td className={`num ${r.surprisePct === null ? 'muet' : r.surprisePct >= 0 ? 'hausse' : 'baisse'}`}>
                        {r.surprisePct === null ? '–' : `${r.surprisePct >= 0 ? '+' : ''}${r.surprisePct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`}
                      </td>
                      <td className="num muet">{r.bpaAnDernier ?? '–'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
