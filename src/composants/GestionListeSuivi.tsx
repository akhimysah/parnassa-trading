import { useState } from 'react';
import { CATALOGUE, CATEGORIES, LISTE_SUIVI_DEFAUT, bourse, nomSymbole, normaliser, ticker } from '../symboles';
import { IconeCroix } from './Icones';

interface Props {
  ouvert: boolean;
  fermer: () => void;
  liste: string[];
  changer: (liste: string[]) => void;
  ouvrirSymbole: (id: string) => void;
}

/** Gestion de la liste de suivi : ordre, suppression, ajout rapide, réinitialisation. */
export function GestionListeSuivi({ ouvert, fermer, liste, changer, ouvrirSymbole }: Props) {
  const [saisie, setSaisie] = useState('');
  if (!ouvert) return null;

  const deplacer = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= liste.length) return;
    const copie = [...liste];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    changer(copie);
  };

  const ajouter = (id: string) => {
    const propre = normaliser(id);
    if (!propre || liste.includes(propre)) return;
    changer([...liste, propre]);
    setSaisie('');
  };

  const suggestions = CATALOGUE.filter((s) => !liste.includes(s.id));

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale gestion" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Liste de suivi">
        <div className="modale-entete">
          <h2>Liste de suivi</h2>
          <span className="muet">{liste.length} symbole{liste.length > 1 ? 's' : ''}</span>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>

        <form
          className="gestion-ajout"
          onSubmit={(e) => {
            e.preventDefault();
            ajouter(saisie);
          }}
        >
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Ajouter : AAPL, BTCUSDT, EURONEXT:MC…"
            list="suggestions-suivi"
          />
          <datalist id="suggestions-suivi">
            {suggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </datalist>
          <button type="submit" className="bouton-principal" disabled={!saisie.trim()}>
            Ajouter
          </button>
        </form>

        <ul className="gestion-liste">
          {liste.map((id, i) => (
            <li key={id}>
              <button className="ligne" onClick={() => { ouvrirSymbole(id); fermer(); }} title="Ouvrir sur le graphique">
                <strong>{ticker(id)}</strong>
                <span className="muet">{nomSymbole(id)}</span>
                <span className="pastille">{bourse(id)}</span>
              </button>
              <div className="gestion-actions">
                <button onClick={() => deplacer(i, -1)} disabled={i === 0} title="Monter" aria-label="Monter">↑</button>
                <button onClick={() => deplacer(i, 1)} disabled={i === liste.length - 1} title="Descendre" aria-label="Descendre">↓</button>
                <button className="danger" onClick={() => changer(liste.filter((s) => s !== id))} title="Retirer" aria-label="Retirer">
                  <IconeCroix width={14} height={14} />
                </button>
              </div>
            </li>
          ))}
          {liste.length === 0 && <li className="vide">Liste vide : ajoutez un symbole ci-dessus.</li>}
        </ul>

        <div className="gestion-suggestions">
          <div className="menu-titre">Ajout rapide</div>
          <div className="puces">
            {suggestions.slice(0, 18).map((s) => (
              <button key={s.id} onClick={() => ajouter(s.id)} title={CATEGORIES[s.categorie]}>
                + {ticker(s.id)}
              </button>
            ))}
          </div>
        </div>

        <div className="modale-pied">
          <button className="bouton-secondaire" onClick={() => changer(LISTE_SUIVI_DEFAUT)}>
            Réinitialiser
          </button>
          <div className="espace" />
          <button className="bouton-principal" onClick={fermer}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}
