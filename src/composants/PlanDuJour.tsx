import { useEffect, useRef, useState } from 'react';
import type { Portefeuille, ReglesDiscipline } from '../types';
import { contenuPlan, enregistrerPlan, MODELE_PLAN, PLAN_MIN_CARACTERES, planDuJour } from '../plan';
import { dateDuJour } from '../challenge';

interface Props {
  portefeuille: Portefeuille;
  regles: ReglesDiscipline | undefined;
  enregistrer: (p: Portefeuille) => void;
  /** Accès investisseur : lecture seule. */
  lecture: boolean;
  /** Variante repliée de la page Trading (un bandeau qu'on déplie). */
  compact?: boolean;
}

/** Plan de trading du jour : rédigé avant la séance, relu pendant, gardé avec le compte. */
export function PlanDuJour({ portefeuille, regles, enregistrer, lecture, compact }: Props) {
  const plan = planDuJour(portefeuille);
  const hier = portefeuille.plans?.find((x) => x.date < dateDuJour());
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState('');
  const [ouvert, setOuvert] = useState(!compact);
  const [voirHier, setVoirHier] = useState(false);
  const obligatoire = Boolean(regles?.actif && regles.planObligatoire);
  const utile = contenuPlan(texte).length;
  const zone = useRef<HTMLTextAreaElement>(null);
  // À l'ouverture : curseur après « Biais du jour : » sur le modèle, à la fin sur un plan déjà écrit.
  useEffect(() => {
    const t = zone.current;
    if (!edition || !t) return;
    const fin = t.value === MODELE_PLAN ? t.value.indexOf('\n') : t.value.length;
    t.focus();
    t.setSelectionRange(fin, fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition]);

  const commencer = () => {
    setTexte(plan?.texte ?? MODELE_PLAN);
    setEdition(true);
    setOuvert(true);
  };
  const valider = () => {
    enregistrer(enregistrerPlan(portefeuille, texte));
    setEdition(false);
  };

  const entete = (
    <div className="plan-entete">
      <button className="plan-titre" onClick={() => compact && !edition && setOuvert((x) => !x)} aria-expanded={ouvert} disabled={!compact || edition}>
        📋 <strong>Plan du jour</strong>
        {plan ? (
          <span className="muet">· écrit à {new Date(plan.majLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        ) : (
          <span className={obligatoire ? 'plan-requis' : 'muet'}>{obligatoire ? '· obligatoire avant de trader' : '· pas encore écrit'}</span>
        )}
      </button>
      <div className="espace" />
      {!lecture && !edition && (
        <button className="lien discret" onClick={commencer}>
          {plan ? 'Modifier' : 'Écrire'}
        </button>
      )}
    </div>
  );

  return (
    <div className={`plan-du-jour ${compact ? 'carte compact' : ''} ${obligatoire && !plan ? 'manquant' : ''}`}>
      {entete}
      {edition ? (
        <div className="plan-edition">
          <textarea ref={zone} value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} aria-label="Plan du jour" />
          <div className="plan-actions">
            {obligatoire && (
              <span className={`muet petit ${utile >= PLAN_MIN_CARACTERES ? 'hausse' : ''}`}>
                {utile >= PLAN_MIN_CARACTERES ? '✓ assez détaillé' : `encore ${PLAN_MIN_CARACTERES - utile} caractères`}
              </span>
            )}
            <div className="espace" />
            <button className="bouton-secondaire" onClick={() => setEdition(false)}>
              Annuler
            </button>
            <button className="bouton-principal" onClick={valider}>
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        ouvert && (
          <>
            {plan ? (
              <p className="plan-texte">{plan.texte}</p>
            ) : (
              <p className="muet petit plan-vide">
                Avant d'ouvrir les graphiques : votre biais, les niveaux à surveiller, ce qui vous ferait entrer, et ce que vous vous interdisez aujourd'hui.
              </p>
            )}
            {hier && (
              <button className="lien discret petit" onClick={() => setVoirHier((x) => !x)}>
                {voirHier ? 'Masquer' : 'Revoir'} le plan du {new Date(hier.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </button>
            )}
            {voirHier && hier && <p className="plan-texte plan-hier">{hier.texte}</p>}
          </>
        )
      )}
    </div>
  );
}
