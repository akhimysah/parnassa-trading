import { useEffect, useRef, useState } from 'react';

interface Props {
  valeur: number | undefined;
  texte: string;
  className?: string;
}

/** Affiche un prix qui clignote en vert quand il monte et en rouge quand il baisse. */
export function PrixAnime({ valeur, texte, className }: Props) {
  const precedent = useRef<number | undefined>(valeur);
  const [flash, setFlash] = useState<{ sens: 'monte' | 'descend'; n: number } | null>(null);

  useEffect(() => {
    const avant = precedent.current;
    precedent.current = valeur;
    if (avant === undefined || valeur === undefined || avant === valeur) return;
    setFlash((f) => ({ sens: valeur > avant ? 'monte' : 'descend', n: (f?.n ?? 0) + 1 }));
  }, [valeur]);

  return (
    <span
      // La clé change à chaque mouvement pour relancer l'animation même deux fois de suite dans le même sens.
      key={flash?.n ?? 0}
      className={`prix-anime ${flash ? `flash-${flash.sens}` : ''} ${className ?? ''}`}
    >
      {texte}
    </span>
  );
}
