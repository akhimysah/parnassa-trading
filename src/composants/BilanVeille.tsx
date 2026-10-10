import type { BilanJour } from '../bilan';
import { instrument } from '../instruments';
import { formaterUsdt } from '../trading';
import { IconeCroix } from './Icones';

const net = (o: { resultat?: number; frais: number }) => (o.resultat ?? 0) - o.frais;
const code = (s: string) => instrument(s)?.code ?? s.split(':').pop();

/** Bilan du dernier jour tradé, montré au premier lancement de la journée. */
export function BilanVeille({ bilan, fermer, partager }: { bilan: BilanJour; fermer: () => void; partager: () => void }) {
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const titre = bilan.date.toDateString() === hier.toDateString() ? 'Hier' : bilan.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const evolution = bilan.precedent !== null && bilan.precedent !== 0 ? ((bilan.net - bilan.precedent) / Math.abs(bilan.precedent)) * 100 : null;
  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale bilan-veille" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Bilan de la veille">
        <div className="modale-entete">
          <h2>☀️ Bonjour · bilan de votre dernière séance</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="bv-corps">
          <span className="muet bv-jour">{titre.charAt(0).toUpperCase() + titre.slice(1)}</span>
          <strong className={`bv-net ${bilan.net >= 0 ? 'hausse' : 'baisse'}`}>{formaterUsdt(bilan.net, true)}</strong>
          <div className="bv-grille">
            <div>
              <span>Trades</span>
              <strong>{bilan.trades}</strong>
            </div>
            <div>
              <span>Réussite</span>
              <strong>{Math.round((bilan.gagnants / bilan.trades) * 100)} %</strong>
            </div>
            {bilan.meilleur && (
              <div>
                <span>Meilleur trade</span>
                <strong className={net(bilan.meilleur) >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(net(bilan.meilleur), true)}</strong>
                <em className="muet">{code(bilan.meilleur.symbole)}</em>
              </div>
            )}
            {bilan.pire && (
              <div>
                <span>Pire trade</span>
                <strong className={net(bilan.pire) >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(net(bilan.pire), true)}</strong>
                <em className="muet">{code(bilan.pire.symbole)}</em>
              </div>
            )}
          </div>
          {evolution !== null && (
            <p className="muet">
              Séance précédente : {formaterUsdt(bilan.precedent!, true)} ({evolution >= 0 ? '+' : ''}
              {Math.round(evolution)} %)
            </p>
          )}
          {bilan.serieGagnante >= 2 && <p className="bv-serie">🔥 {bilan.serieGagnante} jours gagnants d'affilée, continuez !</p>}
          {bilan.net < 0 && <p className="muet">Une séance perdante fait partie du jeu : relisez votre journal avant de reprendre.</p>}
          <div className="bv-boutons">
            <button className="bouton-secondaire" onClick={partager}>
              ↗ Partager la journée
            </button>
            <button className="bouton-principal" onClick={fermer}>
              C'est parti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
