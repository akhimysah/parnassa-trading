import { useEffect, useMemo, useRef, useState } from 'react';
import type { Etat } from '../types';
import { nomSymbole, ticker } from '../symboles';
import {
  CATEGORIES_DEPECHES,
  heureCourte,
  ilYA,
  indicateurAffiche,
  LIBELLES_DONNEE,
  texteRecherche,
  titrePrincipal,
  titreSecondaire,
  motsClesTrouves,
  compteARebours,
  drapeau,
  sujetDepuisSymbole,
  useCalendrier,
  useRechercheActualites,
  type CategorieDepeche,
  type Depeche,
  type FilActualites,
} from '../actualites';
import { demanderNotifications } from '../alertes';
import { sonner } from '../alertes';
import { IconeCroix, IconeRecherche } from '../composants/Icones';
import { CalendrierAnnonces } from '../composants/CalendrierAnnonces';

interface Props {
  etat: Etat;
  fil: FilActualites;
  maj: (p: Partial<Etat>) => void;
}

type Filtre = 'tous' | 'selection' | CategorieDepeche;

/** Met en évidence les mots-clés surveillés dans un titre. */
function TitreSurligne({ titre, mots }: { titre: string; mots: string[] }) {
  if (mots.length === 0) return <>{titre}</>;
  const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const base = sansAccents(titre);
  const plages: [number, number][] = [];
  for (const m of mots) {
    const cible = sansAccents(m.trim());
    let i = base.indexOf(cible);
    while (cible && i !== -1) {
      plages.push([i, i + cible.length]);
      i = base.indexOf(cible, i + cible.length);
    }
  }
  plages.sort((a, b) => a[0] - b[0]);
  const morceaux: React.ReactNode[] = [];
  let curseur = 0;
  plages.forEach(([debut, fin], k) => {
    if (debut < curseur) return;
    morceaux.push(titre.slice(curseur, debut));
    morceaux.push(<mark key={k}>{titre.slice(debut, fin)}</mark>);
    curseur = fin;
  });
  morceaux.push(titre.slice(curseur));
  return <>{morceaux}</>;
}


export function Actualites({ etat, fil, maj }: Props) {
  const { depeches, erreur, chargement, majLe, nouvelles, effacerNouvelles } = fil;
  const motsCles = etat.parametres.motsCles;
  const [nouveauMot, setNouveauMot] = useState('');
  const ajouterMot = () => {
    const mot = nouveauMot.trim();
    if (!mot || motsCles.some((m) => m.toLowerCase() === mot.toLowerCase())) return;
    demanderNotifications();
    maj({ parametres: { ...etat.parametres, motsCles: [...motsCles, mot] } });
    setNouveauMot('');
  };
  const retirerMot = (mot: string) => maj({ parametres: { ...etat.parametres, motsCles: motsCles.filter((m) => m !== mot) } });
  const [filtre, setFiltre] = useState<Filtre>('annonces');
  const calendrier = useCalendrier(true);
  const prochaine = calendrier.evenements.find((e) => e.importance >= 1 && e.actuel === null && e.date > Date.now());
  const langue = etat.parametres.langueActualites;
  const setLangue = (l: typeof langue) => maj({ parametres: { ...etat.parametres, langueActualites: l } });
  const libelles = LIBELLES_DONNEE[langue];
  const [importantsSeuls, setImportantsSeuls] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [sonBreaking, setSonBreaking] = useState(false);
  const [, forcerTic] = useState(0);
  const refListe = useRef<HTMLDivElement>(null);

  const { sujet, ticker: tickerYahoo } = useMemo(() => sujetDepuisSymbole(etat.symbole, nomSymbole(etat.symbole)), [etat.symbole]);
  const symboleFil = useRechercheActualites(sujet, tickerYahoo);

  // Horloge « il y a … » rafraîchie toutes les 30 s.
  useEffect(() => {
    const t = window.setInterval(() => forcerTic((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  // Son sur les nouvelles dépêches importantes, si activé.
  useEffect(() => {
    if (sonBreaking && nouvelles.some((d) => d.important) && etat.parametres.son) sonner();
  }, [nouvelles, sonBreaking, etat.parametres.son]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return depeches.filter(
      (d) =>
        (filtre === 'tous' ||
          (filtre === 'selection'
            ? motsClesTrouves(texteRecherche(d), motsCles).length > 0
            : filtre === 'annonces'
              ? d.source === 'FinancialJuice'
              : d.categorie === filtre)) &&
        (!importantsSeuls || d.important) &&
        (!q || texteRecherche(d).toLowerCase().includes(q) || d.source.toLowerCase().includes(q)),
    );
  }, [depeches, filtre, importantsSeuls, recherche, motsCles]);

  const derniereImportante = depeches.find((d) => d.important && Date.now() - d.date < 2 * 3600000);
  const nouvellesIds = useMemo(() => new Set(nouvelles.map((d) => d.id)), [nouvelles]);

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of depeches) {
      if (d.categorie !== 'annonces') c[d.categorie] = (c[d.categorie] ?? 0) + 1;
      if (d.source === 'FinancialJuice') c.annonces = (c.annonces ?? 0) + 1;
    }
    return c;
  }, [depeches]);

  const parJour = useMemo(() => {
    const groupes: { jour: string; depeches: Depeche[] }[] = [];
    for (const d of filtrees) {
      const jour = new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.jour === jour) dernier.depeches.push(d);
      else groupes.push({ jour, depeches: [d] });
    }
    return groupes;
  }, [filtrees]);

  return (
    <div className="page actualites">
      {derniereImportante && (
        <a className="bandeau-breaking" href={derniereImportante.lien} target="_blank" rel="noopener noreferrer">
          <span className="etiquette-breaking">Important</span>
          <span className="texte-breaking">{titrePrincipal(derniereImportante, langue)}</span>
          <span className="muet">{derniereImportante.source} · {ilYA(derniereImportante.date)}</span>
        </a>
      )}

      <div className="onglets">
        <button className={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>
          Tout <span className="compteur-onglet">{depeches.length}</span>
        </button>
        {motsCles.length > 0 && (
          <button className={filtre === 'selection' ? 'actif' : ''} onClick={() => setFiltre('selection')} title="Dépêches contenant vos mots-clés">
            Ma sélection <span className="compteur-onglet">{depeches.filter((d) => motsClesTrouves(texteRecherche(d), motsCles).length > 0).length}</span>
          </button>
        )}
        {CATEGORIES_DEPECHES.map((c) => (
          <button key={c.id} className={filtre === c.id ? 'actif' : ''} onClick={() => setFiltre(c.id)}>
            {c.libelle} {compteurs[c.id] ? <span className="compteur-onglet">{compteurs[c.id]}</span> : null}
          </button>
        ))}
        <div className="outils-onglets outils-actualites">
          <label className="champ-recherche">
            <IconeRecherche width={14} height={14} />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Filtrer les titres…" />
            {recherche && (
              <button className="icone petit" aria-label="Effacer" onClick={() => setRecherche('')}>
                <IconeCroix width={12} height={12} />
              </button>
            )}
          </label>
          <div className="segmente compact">
            {(['fr+en', 'fr', 'en'] as const).map((l) => (
              <button
                key={l}
                className={langue === l ? 'actif neutre' : ''}
                onClick={() => setLangue(l)}
                title={l === 'fr+en' ? 'Chaque dépêche en français, avec la version anglaise dessous' : l === 'fr' ? 'Toutes les dépêches en français' : 'All headlines in English'}
              >
                {l === 'fr+en' ? 'FR + EN' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className={`puce-bascule ${importantsSeuls ? 'actif' : ''}`} onClick={() => setImportantsSeuls((v) => !v)} title="N'afficher que les dépêches importantes">
            ★ Importantes
          </button>
          <button className={`puce-bascule ${sonBreaking ? 'actif' : ''}`} onClick={() => setSonBreaking((v) => !v)} title="Jouer un son à chaque nouvelle dépêche importante">
            🔔 Son
          </button>
        </div>
      </div>

      <div className="barre-mots-cles">
        <span className="muet">Mots-clés surveillés</span>
        {motsCles.map((m) => (
          <span key={m} className="puce-mot">
            {m}
            <button aria-label={`Retirer ${m}`} onClick={() => retirerMot(m)}>
              <IconeCroix width={10} height={10} />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ajouterMot();
          }}
        >
          <input value={nouveauMot} onChange={(e) => setNouveauMot(e.target.value)} placeholder="Ex. Powell, BCE, Nvidia, tarifs…" />
          <button type="submit" className="bouton-secondaire" disabled={!nouveauMot.trim()}>
            Surveiller
          </button>
        </form>
        {motsCles.length > 0 && <span className="muet aide-mots">Alerte (message, son, notification) à chaque nouvelle dépêche, sur toutes les pages.</span>}
      </div>

      <div className="colonnes-actualites">
        <div className="fil" ref={refListe}>
          <div className="fil-etat">
            {chargement && depeches.length === 0 && <span className="muet">Chargement du fil…</span>}
            {erreur && <span className="erreur-inline">Fil indisponible : {erreur}</span>}
            {majLe && !erreur && (
              <span className="muet">
                <span className="point-direct" aria-hidden /> En direct · mis à jour {ilYA(majLe)} · {filtrees.length} dépêche{filtrees.length > 1 ? 's' : ''}
              </span>
            )}
            {prochaine && (
              <span className="prochaine-annonce" title={new Date(prochaine.date).toLocaleString('fr-FR')}>
                Prochaine : {drapeau(prochaine.pays)} {langue === 'en' ? prochaine.titre : (prochaine.titreFr ?? prochaine.titre)} <strong>{compteARebours(prochaine.date)}</strong>
              </span>
            )}
            {nouvelles.length > 0 && (
              <button
                className="bouton-nouvelles"
                onClick={() => {
                  effacerNouvelles();
                  refListe.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {nouvelles.length} nouvelle{nouvelles.length > 1 ? 's' : ''} dépêche{nouvelles.length > 1 ? 's' : ''} ↑
              </button>
            )}
          </div>

          {parJour.map((groupe) => (
            <section key={groupe.jour}>
              <h4 className="jour">{groupe.jour}</h4>
              <ul className="depeches">
                {groupe.depeches.map((d) => {
                  const trouves = motsClesTrouves(texteRecherche(d), motsCles);
                  const principal = titrePrincipal(d, langue);
                  const secondaire = titreSecondaire(d, langue);
                  const indic = d.donnee ? indicateurAffiche(d.donnee, langue) : null;
                  return (
                  <li key={d.id} className={`${d.important ? 'importante' : ''} ${nouvellesIds.has(d.id) ? 'nouvelle' : ''} ${trouves.length ? 'selectionnee' : ''}`}>
                    <time dateTime={new Date(d.date).toISOString()} title={new Date(d.date).toLocaleString('fr-FR')}>
                      {heureCourte(d.date)}
                    </time>
                    <a href={d.lien} target="_blank" rel="noopener noreferrer">
                      {d.important && <span className="etoile-importante" aria-label="Important">★</span>}
                      {d.donnee && indic ? (
                        <>
                          <span className="donnee-eco">
                            <span className="indicateur">
                              <TitreSurligne titre={indic.principal} mots={trouves} />
                            </span>
                            <span className={`puce-valeur reel ${d.donnee.ecart === 1 ? 'hausse' : d.donnee.ecart === -1 ? 'baisse' : ''}`}>
                              {libelles.reel} <strong>{d.donnee.actuel}</strong>
                              {d.donnee.ecart === 1 && ' ▲'}
                              {d.donnee.ecart === -1 && ' ▼'}
                            </span>
                            <span className="puce-valeur">
                              {libelles.prev} {d.donnee.prevision ?? '–'}
                            </span>
                            <span className="puce-valeur">
                              {libelles.prec} {d.donnee.precedent ?? '–'}
                            </span>
                          </span>
                          {indic.secondaire && <span className="titre-traduit">{indic.secondaire}</span>}
                        </>
                      ) : (
                        <>
                          <TitreSurligne titre={principal} mots={trouves} />
                          {secondaire && (
                            <span className="titre-traduit">
                              <TitreSurligne titre={secondaire} mots={trouves} />
                            </span>
                          )}
                        </>
                      )}
                    </a>
                    <span className="source-depeche">{d.source}</span>
                    <span className={`categorie-depeche cat-${d.categorie}`}>{CATEGORIES_DEPECHES.find((c) => c.id === d.categorie)?.libelle}</span>
                  </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!chargement && filtrees.length === 0 && !erreur && <p className="vide">Aucune dépêche ne correspond à ces filtres.</p>}
        </div>

        <aside className="colonne-droite">
          <CalendrierAnnonces evenements={calendrier.evenements} chargement={calendrier.chargement} langue={langue} />
          <div className="carte">
            <h3>
              {ticker(etat.symbole)} · {nomSymbole(etat.symbole)}
            </h3>
            {symboleFil.chargement && symboleFil.depeches.length === 0 && <p className="vide">Recherche des dépêches…</p>}
            {!symboleFil.chargement && symboleFil.depeches.length === 0 && <p className="vide">Aucune dépêche récente trouvée pour ce symbole.</p>}
            <ul className="depeches compactes">
              {symboleFil.depeches.slice(0, 25).map((d) => (
                <li key={d.id} className={d.important ? 'importante' : ''}>
                  <time>{heureCourte(d.date)}</time>
                  <a href={d.lien} target="_blank" rel="noopener noreferrer">
                    {titrePrincipal(d, langue)}
                    {titreSecondaire(d, langue) && <span className="titre-traduit">{titreSecondaire(d, langue)}</span>}
                  </a>
                  <span className="source-depeche">{d.source}</span>
                </li>
              ))}
            </ul>
          </div>
          
        </aside>
      </div>
    </div>
  );
}
