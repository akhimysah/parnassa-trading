import type { Etat } from '../types';
import { nomSymbole, ticker } from '../symboles';
import { WidgetTradingView } from '../composants/WidgetTradingView';
import { IconeRecherche } from '../composants/Icones';

interface Props {
  etat: Etat;
  emplacementActif: number;
  choisirEmplacement: (i: number) => void;
  ouvrirRecherche: () => void;
}

/**
 * Page principale : 1, 2 ou 4 graphiques avancés TradingView.
 * Le panneau de droite (liste de suivi, détails, hotlists, calendrier) est celui du widget lui-même.
 */
export function Graphique({ etat, emplacementActif, choisirEmplacement, ouvrirRecherche }: Props) {
  const symboles = etat.emplacements.slice(0, etat.disposition);
  const multi = etat.disposition > 1;

  return (
    <div className={`grille-graphiques disposition-${etat.disposition}`}>
      {symboles.map((symbole, i) => {
        const actif = i === emplacementActif;
        return (
          <section key={i} className={`emplacement ${actif && multi ? 'actif' : ''}`} onMouseDown={() => choisirEmplacement(i)}>
            {multi && (
              <header className="emplacement-entete">
                <button
                  className="emplacement-symbole"
                  onClick={() => {
                    choisirEmplacement(i);
                    ouvrirRecherche();
                  }}
                  title="Changer le symbole de cet emplacement"
                >
                  <IconeRecherche width={14} height={14} />
                  <strong>{ticker(symbole)}</strong>
                  <span className="muet">{nomSymbole(symbole)}</span>
                </button>
              </header>
            )}
            <WidgetTradingView
              widget="advanced-chart"
              config={{
                autosize: true,
                symbol: symbole,
                interval: etat.intervalle,
                timezone: etat.parametres.fuseau,
                theme: etat.theme,
                style: etat.style,
                locale: 'fr',
                withdateranges: true,
                hide_side_toolbar: multi,
                hide_top_toolbar: false,
                allow_symbol_change: true,
                save_image: true,
                details: !multi && etat.panneauDroit,
                hotlist: !multi && etat.panneauDroit,
                calendar: !multi && etat.panneauDroit,
                watchlist: !multi && etat.panneauDroit ? etat.listeSuivi : undefined,
                studies: etat.etudes,
                compareSymbols: i === 0 || !multi ? etat.comparaisons.map((symbol) => ({ symbol, position: 'SameScale' })) : [],
                show_popup_button: false,
              }}
              caches={[
                { coin: 'bas-gauche', x: multi ? 0 : 46, y: 74, largeur: 64, hauteur: 52, couleur: 'var(--fond)' },
              ]}
            />
          </section>
        );
      })}
    </div>
  );
}
