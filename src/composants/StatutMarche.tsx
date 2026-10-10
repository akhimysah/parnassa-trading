import { etatMarche, LIBELLES_MARCHE, quand } from '../horaires';

/** Pastille « ouvert / fermé » d'un instrument, avec la prochaine ouverture ou fermeture. */
export function StatutMarche({ symbole, compact }: { symbole: string; compact?: boolean }) {
  const e = etatMarche(symbole);
  if (e.marche === 'crypto' && compact) return null;
  const texte = e.ouvert
    ? e.changement
      ? `Ouvert · ferme ${quand(e.changement)}`
      : 'Ouvert 24 h/24'
    : `Fermé · rouvre ${e.changement ? quand(e.changement) : 'bientôt'}`;
  return (
    <span className={`statut-marche ${e.ouvert ? 'ouvert' : 'ferme'}`} title={LIBELLES_MARCHE[e.marche]}>
      <i aria-hidden="true" />
      {compact ? (e.ouvert ? 'Ouvert' : 'Fermé') : texte}
    </span>
  );
}
