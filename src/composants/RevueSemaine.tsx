import { useMemo } from 'react';
import type { Portefeuille } from '../types';
import type { RevueSemaine as Revue } from '../semaine';
import { conseilsCoach } from '../coach';
import { instrument } from '../instruments';
import { formaterUsdt } from '../trading';
import { IconeCroix } from './Icones';

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const net = (o: { resultat?: number; frais: number }) => (o.resultat ?? 0) - o.frais;
const code = (s: string) => instrument(s)?.code ?? s.split(':').pop();

/** Revue de la semaine écoulée : résultat, jours, instruments, plans tenus et le conseil du coach. */
export function RevueSemaine({ revue, portefeuille, fermer }: { revue: Revue; portefeuille: Portefeuille; fermer: () => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const constat = useMemo(() => conseilsCoach(portefeuille)[0] ?? null, [portefeuille.operations]);
  const dernierJour = new Date(revue.fin - 12 * 3600 * 1000);
  const periode = `du ${new Date(revue.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${dernierJour.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  const maxJour = Math.max(1, ...revue.jours.map(Math.abs));
  const ecart = revue.precedente !== null ? revue.net - revue.precedente : null;

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale bilan-veille revue-semaine" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Revue de la semaine">
        <div className="modale-entete">
          <h2>📅 Revue de la semaine</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="bv-corps">
          <span className="muet bv-jour">{periode.charAt(0).toUpperCase() + periode.slice(1)}</span>
          <strong className={`bv-net ${revue.net >= 0 ? 'hausse' : 'baisse'}`}>{formaterUsdt(revue.net, true)}</strong>
          {ecart !== null && (
            <span className="muet">
              {ecart >= 0 ? '▲' : '▼'} {formaterUsdt(Math.abs(ecart))} par rapport à la semaine d'avant ({formaterUsdt(revue.precedente!, true)})
            </span>
          )}

          <div className="rs-jours" aria-label="Résultat par jour">
            {revue.jours.map((v, i) => (
              <div key={i} title={`${JOURS[i]} : ${formaterUsdt(v, true)}`}>
                <span className="rs-colonne">
                  <i className={v >= 0 ? 'hausse' : 'baisse'} style={{ height: `${(Math.abs(v) / maxJour) * 100}%` }} />
                </span>
                <em>{JOURS[i]}</em>
              </div>
            ))}
          </div>

          <div className="bv-grille">
            <div>
              <span>Trades</span>
              <strong>{revue.trades}</strong>
            </div>
            <div>
              <span>Réussite</span>
              <strong>{Math.round((revue.gagnants / revue.trades) * 100)} %</strong>
            </div>
            <div>
              <span>Plans écrits</span>
              <strong className={revue.joursAvecPlan === revue.joursTrades ? 'hausse' : ''}>
                {revue.joursAvecPlan}/{revue.joursTrades}
              </strong>
              <em className="muet">jours tradés</em>
            </div>
            {revue.meilleur && (
              <div>
                <span>Meilleur trade</span>
                <strong className={net(revue.meilleur) >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(net(revue.meilleur), true)}</strong>
                <em className="muet">{code(revue.meilleur.symbole)}</em>
              </div>
            )}
            {revue.pire && (
              <div>
                <span>Pire trade</span>
                <strong className={net(revue.pire) >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(net(revue.pire), true)}</strong>
                <em className="muet">{code(revue.pire.symbole)}</em>
              </div>
            )}
          </div>

          {revue.instruments.length > 1 && (
            <ul className="rs-instruments">
              {revue.instruments.slice(0, 4).map((i) => (
                <li key={i.symbole}>
                  <strong>{code(i.symbole)}</strong>
                  <span className="muet">
                    {i.trades} trade{i.trades > 1 ? 's' : ''}
                  </span>
                  <span className={`num ${i.net >= 0 ? 'hausse' : 'baisse'}`}>{formaterUsdt(i.net, true)}</span>
                </li>
              ))}
            </ul>
          )}

          {constat && (
            <div className={`rs-coach coach-${constat.ton}`}>
              <strong>🧠 {constat.titre}</strong>
              <p>{constat.detail}</p>
            </div>
          )}

          <div className="bv-boutons">
            <button className="bouton-principal" onClick={fermer}>
              Nouvelle semaine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
