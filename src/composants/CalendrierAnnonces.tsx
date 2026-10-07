import { useEffect, useMemo, useState } from 'react';
import { compteARebours, drapeau, heureCourte, LIBELLES_DONNEE, valeurCalendrier, type EvenementCalendrier, type LangueAffichage } from '../actualites';

interface Props {
  evenements: EvenementCalendrier[];
  chargement: boolean;
  langue: LangueAffichage;
}

function TitreEvenement({ e, langue }: { e: EvenementCalendrier; langue: LangueAffichage }) {
  const fr = e.titreFr ?? e.titre;
  const principal = langue === 'en' ? e.titre : fr;
  return (
    <span className="titre-annonce">
      {principal} {e.periode && <span className="muet">({e.periode})</span>}
      {langue === 'fr+en' && e.titre !== fr && <span className="titre-traduit">{e.titre}</span>}
    </span>
  );
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

function Valeurs({ e, langue }: { e: EvenementCalendrier; langue: LangueAffichage }) {
  const l = LIBELLES_DONNEE[langue];
  const ecart = e.actuel !== null && e.prevision !== null ? Math.sign(e.actuel - e.prevision) : null;
  return (
    <div className="valeurs-annonce">
      <span>
        <em>{l.reel}</em>
        <strong className={ecart === 1 ? 'hausse' : ecart === -1 ? 'baisse' : ''}>{valeurCalendrier(e.actuel, e.unite, e.echelle)}</strong>
      </span>
      <span>
        <em>{l.prev}</em>
        {valeurCalendrier(e.prevision, e.unite, e.echelle)}
      </span>
      <span>
        <em>{l.prec}</em>
        {valeurCalendrier(e.precedent, e.unite, e.echelle)}
      </span>
    </div>
  );
}

/** Panneau façon FinancialJuice : prochaines annonces économiques et dernières publications. */
export function CalendrierAnnonces({ evenements, chargement, langue }: Props) {
  const l = LIBELLES_DONNEE[langue];
  const [fortSeul, setFortSeul] = useState(false);
  const [, tic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tic((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { aVenir, publiees } = useMemo(() => {
    const maintenant = Date.now();
    const filtres = evenements.filter((e) => (fortSeul ? e.importance >= 1 : e.importance >= 0));
    return {
      aVenir: filtres.filter((e) => e.date > maintenant - 60000 && e.actuel === null).slice(0, 14),
      publiees: filtres
        .filter((e) => e.actuel !== null && e.date <= maintenant)
        .sort((a, b) => b.date - a.date)
        .slice(0, 14),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenements, fortSeul, Math.floor(Date.now() / 30000)]);

  return (
    <div className="carte calendrier-annonces">
      <div className="entete-carte">
        <h3>Annonces économiques</h3>
        <button className={`puce-bascule ${fortSeul ? 'actif' : ''}`} onClick={() => setFortSeul((v) => !v)} title="N'afficher que les annonces à fort impact">
          Fort impact
        </button>
      </div>
      {chargement && evenements.length === 0 && <p className="vide">Chargement du calendrier…</p>}

      <h4 className="sous-titre">À venir</h4>
      {aVenir.length === 0 && !chargement && <p className="vide">Aucune annonce à venir cette semaine.</p>}
      <ul className="liste-annonces">
        {aVenir.map((e) => {
          const imminent = e.date - Date.now() < 15 * 60000;
          return (
            <li key={e.id} className={imminent ? 'imminente' : ''}>
              <div className="ligne-annonce">
                <span className="drapeau" aria-hidden>
                  {drapeau(e.pays)}
                </span>
                <TitreEvenement e={e} langue={langue} />
                <Importance niveau={e.importance} />
              </div>
              <div className="meta-annonce">
                <span className={imminent ? 'rebours imminent' : 'rebours'}>{compteARebours(e.date)}</span>
                <span className="muet">{heureCourte(e.date)}</span>
                <span className="muet">
                  {l.prev.toLowerCase()} {valeurCalendrier(e.prevision, e.unite, e.echelle)} · {l.prec.toLowerCase()} {valeurCalendrier(e.precedent, e.unite, e.echelle)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <h4 className="sous-titre">Publiées</h4>
      {publiees.length === 0 && !chargement && <p className="vide">Aucune publication récente.</p>}
      <ul className="liste-annonces">
        {publiees.map((e) => (
          <li key={e.id}>
            <div className="ligne-annonce">
              <span className="drapeau" aria-hidden>
                {drapeau(e.pays)}
              </span>
              <TitreEvenement e={e} langue={langue} />
              <Importance niveau={e.importance} />
            </div>
            <div className="meta-annonce">
              <span className="muet">{heureCourte(e.date)}</span>
              <Valeurs e={e} langue={langue} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
