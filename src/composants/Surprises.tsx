import { useState } from 'react';
import { drapeau, heureCourte, valeurCalendrier, type LangueAffichage, type SurprisePays } from '../actualites';

interface Props {
  pays: SurprisePays[];
  langue: LangueAffichage;
}

/** Cartes « indice de surprise » par pays : part des publications au-dessus / en dessous des prévisions. */
export function Surprises({ pays, langue }: Props) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [replie, setReplie] = useState(false);
  if (pays.length === 0) return null;
  const detail = pays.find((p) => p.pays === ouvert);

  return (
    <div className="surprises">
      <div className="surprises-entete">
        <h4
          title="Pour chaque pays, sur 30 jours : +1 par publication meilleure que la prévision, -1 par déception (sens inversé pour le chômage et les inscriptions), poids double pour les annonces à fort impact. De -100 à +100."
        >
          Indice de surprise économique · 30 jours
        </h4>
        <button className="lien discret" onClick={() => setReplie((r) => !r)}>
          {replie ? 'Afficher' : 'Masquer'}
        </button>
      </div>
      {!replie && (
        <>
          <div className="cartes-surprises">
            {pays.map((p) => (
              <button key={p.pays} className={`carte-surprise ${ouvert === p.pays ? 'actif' : ''}`} onClick={() => setOuvert(ouvert === p.pays ? null : p.pays)}>
                <span className="cs-pays">
                  {drapeau(p.pays)} {p.pays}
                </span>
                <strong className={p.indice > 0 ? 'hausse' : p.indice < 0 ? 'baisse' : ''}>
                  {p.indice > 0 ? '+' : ''}
                  {p.indice}
                </strong>
                <span className="jauge-divergente" aria-hidden>
                  <i className={p.indice >= 0 ? 'positif' : 'negatif'} style={{ width: `${Math.abs(p.indice) / 2}%` }} />
                </span>
                <span className="cs-detail muet">
                  ▲{p.meilleurs} ▼{p.moins_bons} ={p.conformes}
                </span>
              </button>
            ))}
          </div>
          {detail && (
            <div className="detail-surprise">
              <span className="muet">
                {drapeau(detail.pays)} {detail.publies} publications : {detail.meilleurs} au-dessus des attentes, {detail.moins_bons} en dessous, {detail.conformes} conformes.
              </span>
              {detail.marquants.length > 0 && (
                <ul>
                  {detail.marquants.map((m) => (
                    <li key={`${m.titre}-${m.date}`}>
                      <span className="muet">{heureCourte(m.date)}</span>
                      <span>{langue === 'en' ? m.titre : m.titreFr}</span>
                      {/* Couleur : bonne ou mauvaise nouvelle ; flèche : chiffre au-dessus ou en dessous de la prévision. */}
                      <span className={m.signe > 0 ? 'hausse' : 'baisse'} title={m.signe > 0 ? 'Meilleur que prévu' : 'Moins bon que prévu'}>
                        {valeurCalendrier(m.actuel, m.unite, m.echelle)} {m.actuel > m.prevision ? '▲' : '▼'}
                      </span>
                      <span className="muet">prév. {valeurCalendrier(m.prevision, m.unite, m.echelle)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
