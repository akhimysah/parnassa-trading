import type { EvenementCalendrier } from '../actualites';
import { drapeau } from '../actualites';
import type { AnnonceSurPositions } from '../newsPositions';
import { ticker } from '../symboles';

const quand = (minutes: number) => (minutes <= 0 ? 'maintenant' : minutes < 60 ? `dans ${minutes} min` : `dans ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`);

/** Annonces à fort impact imminentes qui touchent les positions ouvertes. */
export function BandeauNewsPositions({ annonces, max = 3 }: { annonces: AnnonceSurPositions<EvenementCalendrier>[]; max?: number }) {
  if (annonces.length === 0) return null;
  return (
    <ul className="bandeau-news-positions" role="status">
      {annonces.slice(0, max).map(({ evenement: e, positions, minutes }) => {
        const symboles = [...new Set(positions.map((p) => ticker(p.symbole)))];
        return (
          <li key={e.id} className={minutes <= 15 ? 'imminente' : ''}>
            <span aria-hidden="true">⚠️</span>
            <span>
              <strong>
                {drapeau(e.pays)} {e.titreFr ?? e.titre}
              </strong>{' '}
              {quand(minutes)} ·{' '}
              <span className="muet">
                {symboles.slice(0, 4).join(', ')}
                {symboles.length > 4 ? ` +${symboles.length - 4}` : ''} exposée{positions.length > 1 ? 's' : ''} ({e.devise})
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
