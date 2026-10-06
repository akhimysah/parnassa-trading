import { useEffect, useMemo, useRef, useState } from 'react';
import type { Symbole } from '../types';
import { CATEGORIES, bourse, normaliser, rechercher, ticker } from '../symboles';
import { IconeCroix, IconeEtoile, IconeRecherche } from './Icones';

interface Props {
  ouvert: boolean;
  fermer: () => void;
  choisir: (id: string) => void;
  listeSuivi: string[];
  basculerSuivi: (id: string) => void;
  saisieInitiale?: string;
}

type Filtre = 'tous' | Symbole['categorie'];

export function RechercheSymbole({ ouvert, fermer, choisir, listeSuivi, basculerSuivi, saisieInitiale }: Props) {
  const [saisie, setSaisie] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [surbrillance, setSurbrillance] = useState(0);
  const refSaisie = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ouvert) {
      setSaisie(saisieInitiale ?? '');
      setSurbrillance(0);
      setTimeout(() => refSaisie.current?.focus(), 0);
    }
  }, [ouvert, saisieInitiale]);

  const resultats = useMemo(() => {
    const base = rechercher(saisie);
    return filtre === 'tous' ? base : base.filter((s) => s.categorie === filtre);
  }, [saisie, filtre]);

  const libre = normaliser(saisie);
  const libreInconnu = libre && !resultats.some((s) => s.id === libre);

  if (!ouvert) return null;

  const valider = (id: string) => {
    choisir(id);
    fermer();
  };

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') fermer();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSurbrillance((i) => Math.min(i + 1, resultats.length - (libreInconnu ? 0 : 1)));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurbrillance((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      if (libreInconnu && surbrillance === 0) valider(libre);
      else {
        const idx = libreInconnu ? surbrillance - 1 : surbrillance;
        const s = resultats[idx];
        if (s) valider(s.id);
        else if (libre) valider(libre);
      }
    }
  };

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale recherche" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Recherche de symbole">
        <div className="recherche-entete">
          <IconeRecherche />
          <input
            ref={refSaisie}
            value={saisie}
            placeholder="Symbole, nom ou BOURSE:TICKER (ex. NASDAQ:AAPL)"
            onChange={(e) => {
              setSaisie(e.target.value);
              setSurbrillance(0);
            }}
            onKeyDown={clavier}
          />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="recherche-filtres">
          {(['tous', ...Object.keys(CATEGORIES)] as Filtre[]).map((f) => (
            <button key={f} className={filtre === f ? 'actif' : ''} onClick={() => setFiltre(f)}>
              {f === 'tous' ? 'Tous' : CATEGORIES[f]}
            </button>
          ))}
        </div>
        <ul className="recherche-liste">
          {libreInconnu && (
            <li className={surbrillance === 0 ? 'surbrillance' : ''}>
              <button className="ligne" onClick={() => valider(libre)}>
                <strong>{ticker(libre)}</strong>
                <span className="muet">Ouvrir « {libre} » (résolu par TradingView)</span>
                {bourse(libre) && <span className="pastille">{bourse(libre)}</span>}
              </button>
            </li>
          )}
          {resultats.map((s, i) => {
            const idx = libreInconnu ? i + 1 : i;
            const suivi = listeSuivi.includes(s.id);
            return (
              <li key={s.id} className={surbrillance === idx ? 'surbrillance' : ''}>
                <button className="ligne" onClick={() => valider(s.id)}>
                  <strong>{ticker(s.id)}</strong>
                  <span className="muet">{s.nom}</span>
                  <span className="categorie">{CATEGORIES[s.categorie]}</span>
                  <span className="pastille">{bourse(s.id)}</span>
                </button>
                <button
                  className={`etoile ${suivi ? 'actif' : ''}`}
                  title={suivi ? 'Retirer de la liste de suivi' : 'Ajouter à la liste de suivi'}
                  onClick={() => basculerSuivi(s.id)}
                >
                  <IconeEtoile pleine={suivi} width={16} height={16} />
                </button>
              </li>
            );
          })}
          {resultats.length === 0 && !libreInconnu && <li className="vide">Aucun résultat</li>}
        </ul>
      </div>
    </div>
  );
}
