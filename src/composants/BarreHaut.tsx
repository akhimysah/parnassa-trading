import { useEffect, useRef, useState } from 'react';
import type { DispositionSauvee, Etat, Intervalle, StyleGraphique } from '../types';
import { bourse, nomSymbole, ticker } from '../symboles';
import { estNegociable } from '../instruments';
import {
  IconeChevron,
  IconeCloche,
  IconeCroix,
  IconeDisposition,
  IconeEngrenage,
  IconeEtoile,
  IconeLien,
  IconeLune,
  IconePanneau,
  IconePartage,
  IconePleinEcran,
  IconeRecherche,
  IconeSauvegarde,
  IconeSoleil,
  IconeTrading,
} from './Icones';

interface Props {
  etat: Etat;
  maj: (p: Partial<Etat>) => void;
  ouvrirRecherche: () => void;
  ouvrirComparaison: () => void;
  ouvrirListeSuivi: () => void;
  partager: () => void;
  ouvrirParametres: () => void;
  ouvrirAide: () => void;
  sauverDisposition: (nom: string) => void;
  chargerDisposition: (d: DispositionSauvee) => void;
  nbAlertes: number;
}

export const INTERVALLES: { valeur: Intervalle; libelle: string }[] = [
  { valeur: '1', libelle: '1m' },
  { valeur: '5', libelle: '5m' },
  { valeur: '15', libelle: '15m' },
  { valeur: '60', libelle: '1h' },
  { valeur: '240', libelle: '4h' },
  { valeur: 'D', libelle: '1J' },
  { valeur: 'W', libelle: '1S' },
];

const STYLES: { valeur: StyleGraphique; libelle: string }[] = [
  { valeur: '1', libelle: 'Bougies' },
  { valeur: '9', libelle: 'Bougies creuses' },
  { valeur: '0', libelle: 'Barres' },
  { valeur: '8', libelle: 'Heikin Ashi' },
  { valeur: '2', libelle: 'Ligne' },
  { valeur: '3', libelle: 'Aire' },
];

export const ETUDES: { id: string; libelle: string; groupe: 'Superposition' | 'Oscillateur' }[] = [
  { id: 'STD;SMA', libelle: 'Moyenne mobile simple', groupe: 'Superposition' },
  { id: 'STD;EMA', libelle: 'Moyenne mobile exponentielle', groupe: 'Superposition' },
  { id: 'STD;Bollinger_Bands', libelle: 'Bandes de Bollinger', groupe: 'Superposition' },
  { id: 'STD;VWAP', libelle: 'VWAP', groupe: 'Superposition' },
  { id: 'STD;Ichimoku_Cloud', libelle: 'Nuage Ichimoku', groupe: 'Superposition' },
  { id: 'STD;Supertrend', libelle: 'Supertrend', groupe: 'Superposition' },
  { id: 'STD;RSI', libelle: 'RSI', groupe: 'Oscillateur' },
  { id: 'STD;MACD', libelle: 'MACD', groupe: 'Oscillateur' },
  { id: 'STD;Stochastic', libelle: 'Stochastique', groupe: 'Oscillateur' },
  { id: 'STD;ATR', libelle: 'ATR', groupe: 'Oscillateur' },
  { id: 'STD;Momentum', libelle: 'Momentum', groupe: 'Oscillateur' },
  { id: 'STD;Awesome_Oscillator', libelle: 'Awesome Oscillator', groupe: 'Oscillateur' },
];

function useFermerAuClic(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert, fermer]);
  return ref;
}

type Menu = 'style' | 'etudes' | 'comparer' | 'dispositions' | null;

export function BarreHaut({
  etat,
  maj,
  ouvrirRecherche,
  ouvrirComparaison,
  ouvrirListeSuivi,
  partager,
  ouvrirParametres,
  ouvrirAide,
  sauverDisposition,
  chargerDisposition,
  nbAlertes,
}: Props) {
  const [menu, setMenu] = useState<Menu>(null);
  const refMenu = useFermerAuClic(menu !== null, () => setMenu(null));
  const surGraphique = etat.page === 'graphique';
  const basculer = (m: Menu) => setMenu(menu === m ? null : m);

  const basculerEtude = (id: string) => {
    const etudes = etat.etudes.includes(id) ? etat.etudes.filter((e) => e !== id) : [...etat.etudes, id];
    maj({ etudes });
  };

  const pleinEcran = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  return (
    <header className="barre-haut">
      <div className="marque" title="Parnassa Trading">
        <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
          <rect width="64" height="64" rx="14" fill="#2962ff" />
          <path d="M12 42l12-14 9 9 19-21" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Parnassa</span>
      </div>

      <button className="bouton-symbole" onClick={ouvrirRecherche} title="Rechercher un symbole (ou tapez une lettre)">
        <IconeRecherche width={16} height={16} />
        <strong>{ticker(etat.symbole)}</strong>
        <span className="muet">{nomSymbole(etat.symbole)}</span>
        {bourse(etat.symbole) && <span className="pastille">{bourse(etat.symbole)}</span>}
      </button>

      {surGraphique && (
        <>
          <div className="separateur" />
          <div className="groupe-intervalles" role="tablist" aria-label="Intervalle">
            {INTERVALLES.map((i, n) => (
              <button
                key={i.valeur}
                role="tab"
                aria-selected={etat.intervalle === i.valeur}
                className={etat.intervalle === i.valeur ? 'actif' : ''}
                onClick={() => maj({ intervalle: i.valeur })}
                title={`${i.libelle} (touche ${n + 1})`}
              >
                {i.libelle}
              </button>
            ))}
          </div>

          <div className="separateur" />
          <div className="menu-ancre" ref={menu === 'style' ? refMenu : undefined}>
            <button className="bouton-menu" onClick={() => basculer('style')}>
              {STYLES.find((s) => s.valeur === etat.style)?.libelle}
              <IconeChevron width={14} height={14} />
            </button>
            {menu === 'style' && (
              <div className="menu-deroulant">
                {STYLES.map((s) => (
                  <button
                    key={s.valeur}
                    className={etat.style === s.valeur ? 'actif' : ''}
                    onClick={() => {
                      maj({ style: s.valeur });
                      setMenu(null);
                    }}
                  >
                    {s.libelle}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="menu-ancre" ref={menu === 'etudes' ? refMenu : undefined}>
            <button className="bouton-menu" onClick={() => basculer('etudes')}>
              Indicateurs
              {etat.etudes.length > 0 && <span className="compteur">{etat.etudes.length}</span>}
              <IconeChevron width={14} height={14} />
            </button>
            {menu === 'etudes' && (
              <div className="menu-deroulant large">
                {(['Superposition', 'Oscillateur'] as const).map((g) => (
                  <div key={g}>
                    <div className="menu-titre">{g}</div>
                    {ETUDES.filter((e) => e.groupe === g).map((e) => (
                      <label key={e.id} className="menu-case">
                        <input type="checkbox" checked={etat.etudes.includes(e.id)} onChange={() => basculerEtude(e.id)} />
                        {e.libelle}
                      </label>
                    ))}
                  </div>
                ))}
                <button className="menu-vider" onClick={() => maj({ etudes: [] })} disabled={etat.etudes.length === 0}>
                  Tout retirer
                </button>
              </div>
            )}
          </div>

          <div className="menu-ancre" ref={menu === 'comparer' ? refMenu : undefined}>
            <button className="bouton-menu" onClick={() => basculer('comparer')} title="Superposer d'autres symboles au graphique">
              Comparer
              {etat.comparaisons.length > 0 && <span className="compteur">{etat.comparaisons.length}</span>}
              <IconeChevron width={14} height={14} />
            </button>
            {menu === 'comparer' && (
              <div className="menu-deroulant large">
                <div className="menu-titre">Symboles superposés</div>
                {etat.comparaisons.length === 0 && <div className="menu-vide">Aucun symbole comparé.</div>}
                {etat.comparaisons.map((id) => (
                  <div key={id} className="menu-ligne">
                    <strong>{ticker(id)}</strong>
                    <span className="muet">{nomSymbole(id)}</span>
                    <button
                      className="icone petit"
                      aria-label={`Retirer ${ticker(id)}`}
                      onClick={() => maj({ comparaisons: etat.comparaisons.filter((c) => c !== id) })}
                    >
                      <IconeCroix width={14} height={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="menu-action"
                  onClick={() => {
                    setMenu(null);
                    ouvrirComparaison();
                  }}
                >
                  + Ajouter un symbole à comparer
                </button>
                {etat.comparaisons.length > 0 && (
                  <button className="menu-vider" onClick={() => maj({ comparaisons: [] })}>
                    Tout retirer
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="separateur" />
          <div className="groupe-icones" aria-label="Disposition">
            {([1, 2, 4] as const).map((n) => (
              <button
                key={n}
                className={etat.disposition === n ? 'actif' : ''}
                title={`${n} graphique${n > 1 ? 's' : ''}`}
                onClick={() => maj({ disposition: n })}
              >
                <IconeDisposition n={n} />
              </button>
            ))}
            {etat.disposition > 1 && (
              <button
                className={etat.lier ? 'actif' : ''}
                title={etat.lier ? 'Graphiques liés : un changement de symbole s\'applique à tous' : 'Lier les graphiques'}
                onClick={() => maj({ lier: !etat.lier })}
              >
                <IconeLien />
              </button>
            )}
          </div>

          <div className="menu-ancre" ref={menu === 'dispositions' ? refMenu : undefined}>
            <button className="icone" title="Dispositions sauvegardées" onClick={() => basculer('dispositions')}>
              <IconeSauvegarde />
            </button>
            {menu === 'dispositions' && (
              <div className="menu-deroulant large">
                <div className="menu-titre">Dispositions sauvegardées</div>
                {etat.dispositionsSauvees.length === 0 && <div className="menu-vide">Aucune disposition enregistrée.</div>}
                {etat.dispositionsSauvees.map((d) => (
                  <div key={d.id} className="menu-ligne">
                    <button
                      className="menu-charger"
                      onClick={() => {
                        chargerDisposition(d);
                        setMenu(null);
                      }}
                    >
                      <strong>{d.nom}</strong>
                      <span className="muet">
                        {d.disposition} graph. · {d.emplacements.slice(0, d.disposition).map(ticker).join(', ')}
                      </span>
                    </button>
                    <button
                      className="icone petit"
                      aria-label={`Supprimer ${d.nom}`}
                      onClick={() => maj({ dispositionsSauvees: etat.dispositionsSauvees.filter((x) => x.id !== d.id) })}
                    >
                      <IconeCroix width={14} height={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="menu-action"
                  onClick={() => {
                    const nom = window.prompt('Nom de la disposition :', `${ticker(etat.symbole)} ${etat.disposition > 1 ? `×${etat.disposition}` : ''}`.trim());
                    if (nom && nom.trim()) sauverDisposition(nom.trim());
                    setMenu(null);
                  }}
                >
                  + Enregistrer la disposition actuelle
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="espace" />

      {surGraphique && estNegociable(etat.symbole) && (
        <button className="bouton-trader" title="Trader ce symbole (portefeuille papier)" onClick={() => maj({ page: 'trading' })}>
          <IconeTrading width={16} height={16} />
          <span>Trader</span>
        </button>
      )}
      <button className="icone" title="Gérer la liste de suivi" onClick={ouvrirListeSuivi}>
        <IconeEtoile />
      </button>
      <button className={`icone ${etat.page === 'alertes' ? 'actif' : ''}`} title="Alertes de prix" onClick={() => maj({ page: 'alertes' })}>
        <IconeCloche />
        {nbAlertes > 0 && <span className="badge">{nbAlertes}</span>}
      </button>
      {surGraphique && (
        <button
          className={`icone ${etat.panneauDroit ? 'actif' : ''}`}
          title="Afficher la liste de suivi, les détails et le calendrier"
          onClick={() => maj({ panneauDroit: !etat.panneauDroit })}
        >
          <IconePanneau />
        </button>
      )}
      <button className="icone" title="Copier un lien vers cette vue" onClick={partager}>
        <IconePartage />
      </button>
      <button
        className="icone"
        title={etat.theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        onClick={() => maj({ theme: etat.theme === 'dark' ? 'light' : 'dark' })}
      >
        {etat.theme === 'dark' ? <IconeSoleil /> : <IconeLune />}
      </button>
      <button className="icone plein-ecran" title="Plein écran" onClick={pleinEcran}>
        <IconePleinEcran />
      </button>
      <button className="icone aide-bouton" title="Aide et raccourcis (?)" aria-label="Aide et raccourcis" onClick={ouvrirAide}>
        ?
      </button>
      <button className="icone" title="Paramètres" onClick={ouvrirParametres}>
        <IconeEngrenage />
      </button>
    </header>
  );
}
