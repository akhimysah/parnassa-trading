import { useState } from 'react';
import { TROPHEES } from '../trophees';

/** Vitrine des trophées : débloqués en couleur avec leur date, les autres en grisé avec leur condition. */
export function VitrineTrophees({ trophees }: { trophees: Record<string, number> | undefined }) {
  const [ouverte, setOuverte] = useState(false);
  const obtenus = trophees ?? {};
  const nb = TROPHEES.filter((t) => obtenus[t.id]).length;
  return (
    <div className="carte vitrine-trophees">
      <div className="ct-entete">
        <h3>
          🏆 Trophées · {nb}/{TROPHEES.length}
        </h3>
        <button className="lien discret" onClick={() => setOuverte((x) => !x)}>
          {ouverte ? 'Masquer' : 'Voir la vitrine'}
        </button>
      </div>
      <div className="vt-barre" aria-hidden="true">
        <i style={{ width: `${(nb / TROPHEES.length) * 100}%` }} />
      </div>
      {ouverte && (
        <ul className="vt-grille">
          {[...TROPHEES]
            .sort((a, b) => a.rang - b.rang)
            .map((t) => {
              const quand = obtenus[t.id];
              return (
                <li key={t.id} className={quand ? 'obtenu' : 'verrouille'} title={t.description}>
                  <span className="vt-icone">{t.icone}</span>
                  <strong>{t.nom}</strong>
                  <span className="muet">{quand ? `obtenu le ${new Date(quand).toLocaleDateString('fr-FR')}` : t.description}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
