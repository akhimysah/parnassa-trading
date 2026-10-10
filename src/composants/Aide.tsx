import { useEffect } from 'react';
import type { Page } from '../types';
import { IconeCroix } from './Icones';

const RACCOURCIS: [string, string][] = [
  ['Une lettre', 'chercher un symbole (ex. « X » pour XAUUSD)'],
  ['/', 'ouvrir la recherche de symbole'],
  ['1 à 7', 'intervalle du graphique : 1 min, 5 min, 15 min, 1 h, 4 h, jour, semaine'],
  ['Maj + B', 'acheter au marché (trading en un clic)'],
  ['Maj + S', 'vendre au marché (trading en un clic)'],
  ['Maj + X', "fermer toutes les positions de l'instrument"],
  ['Maj + R', 'inverser la position (long ↔ short)'],
  ['?', 'afficher cette aide'],
  ['Échap', 'fermer une fenêtre'],
];

const FONCTIONS: { titre: string; texte: string; page: Page }[] = [
  { titre: '⚡ Trading en un clic', texte: 'Vendre, volume ou risque %, acheter, protections automatiques, alertes 🔔, au-dessus du graphique.', page: 'graphique' },
  { titre: '🏦 Comptes et accès', texte: 'Comptes démo à montant libre ou challenge, avec numéro, mot de passe et serveur, sur tous vos appareils.', page: 'trading' },
  { titre: '🏆 Challenge prop firm', texte: 'Évaluation, vérification, compte financé avec versements, règles de perte, news, régularité, week-end.', page: 'trading' },
  { titre: '🧘 Discipline du jour', texte: 'Perte max, objectif et nombre de trades par jour : le trading s’arrête tout seul.', page: 'trading' },
  { titre: '🛡 Protections', texte: 'Stop-loss, take-profit, stop suiveur, break-even et paliers de prise de profit (colonne SL / TP).', page: 'trading' },
  { titre: '📊 Statistiques et journal', texte: 'Espérance, drawdown, séries, jours et heures, étiquettes de setup, cartes à partager.', page: 'trading' },
  { titre: '🔔 Alertes et actualités', texte: 'Alertes de prix (aussi en push), fil d’annonces en français et en anglais, calendrier économique.', page: 'alertes' },
];

/** Aide : raccourcis clavier et tour des fonctions, avec accès direct. */
export function Aide({ ouvert, fermer, aller }: { ouvert: boolean; fermer: () => void; aller: (p: Page) => void }) {
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert, fermer]);
  if (!ouvert) return null;
  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale aide" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Aide">
        <div className="modale-entete">
          <h2>Aide · raccourcis et fonctions</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="parametres-corps">
          <section>
            <h4>Raccourcis clavier</h4>
            <dl className="aide-raccourcis">
              {RACCOURCIS.map(([touche, effet]) => (
                <div key={touche}>
                  <dt>
                    <kbd>{touche}</kbd>
                  </dt>
                  <dd>{effet}</dd>
                </div>
              ))}
            </dl>
            <p className="muet petit">Les raccourcis Maj + lettre marchent sur la page Graphique, hors des champs de saisie et quand le graphique TradingView n'a pas le clavier.</p>
          </section>
          <section>
            <h4>Les fonctions</h4>
            <ul className="aide-fonctions">
              {FONCTIONS.map((f) => (
                <li key={f.titre}>
                  <div>
                    <strong>{f.titre}</strong>
                    <span className="muet">{f.texte}</span>
                  </div>
                  <button
                    className="bouton-secondaire"
                    onClick={() => {
                      aller(f.page);
                      fermer();
                    }}
                  >
                    Y aller
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
