import { useMemo, useState } from 'react';
import type { Portefeuille } from '../types';
import { conseilsCoach, MIN_CLOTURES_COACH } from '../coach';

const ICONES = { negatif: '⛔', attention: '⚠️', positif: '✅' } as const;
const VISIBLES = 4;

/** Coach : constats concrets tirés de l'historique, du plus coûteux au plus encourageant. */
export function CoachTrading({ portefeuille }: { portefeuille: Portefeuille }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const constats = useMemo(() => conseilsCoach(portefeuille), [portefeuille.operations]);
  const [tout, setTout] = useState(false);
  const clotures = useMemo(() => portefeuille.operations.filter((o) => o.type === 'cloture').length, [portefeuille.operations]);

  return (
    <div className="coach">
      <h4>🧠 Coach</h4>
      {clotures < MIN_CLOTURES_COACH ? (
        <p className="muet petit">
          Encore {MIN_CLOTURES_COACH - clotures} trade{MIN_CLOTURES_COACH - clotures > 1 ? 's' : ''} clôturé{MIN_CLOTURES_COACH - clotures > 1 ? 's' : ''} et le coach analysera vos habitudes : revanche après une perte, pertes gardées trop longtemps, surtrading, créneaux et instruments à éviter…
        </p>
      ) : constats.length === 0 ? (
        <p className="muet petit">Rien à signaler sur vos {clotures} trades : continuez ainsi.</p>
      ) : (
        <>
          <ul>
            {(tout ? constats : constats.slice(0, VISIBLES)).map((c) => (
              <li key={c.id} className={`coach-${c.ton}`}>
                <span className="coach-icone" aria-hidden="true">
                  {ICONES[c.ton]}
                </span>
                <div>
                  <strong>{c.titre}</strong>
                  <p>{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {constats.length > VISIBLES && (
            <button className="lien discret" onClick={() => setTout((x) => !x)}>
              {tout ? 'Moins' : `${constats.length - VISIBLES} autre${constats.length - VISIBLES > 1 ? 's' : ''} constat${constats.length - VISIBLES > 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
