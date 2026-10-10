import { useEffect, useState } from 'react';
import { IconeCroix } from './Icones';

export type OngletLegal = 'risques' | 'confidentialite' | 'conditions';

const EVENEMENT = 'parnassa:infos-legales';

/** Ouvre la fenêtre des informations légales depuis n'importe quel écran. */
export function ouvrirInfosLegales(onglet: OngletLegal = 'risques'): void {
  window.dispatchEvent(new CustomEvent<OngletLegal>(EVENEMENT, { detail: onglet }));
}

/** Lien discret vers les informations légales (bas de page, aide, paramètres). */
export function LienLegal({ onglet = 'risques', children }: { onglet?: OngletLegal; children: React.ReactNode }) {
  return (
    <button type="button" className="lien discret" onClick={() => ouvrirInfosLegales(onglet)}>
      {children}
    </button>
  );
}

const TITRES: Record<OngletLegal, string> = { risques: 'Risques', confidentialite: 'Confidentialité', conditions: 'Conditions' };

/** Avertissement sur les risques, données personnelles et conditions d'utilisation de Parnassa Trading. */
export function InfosLegales() {
  const [onglet, setOnglet] = useState<OngletLegal | null>(null);
  useEffect(() => {
    const ouvrir = (e: Event) => setOnglet((e as CustomEvent<OngletLegal>).detail);
    window.addEventListener(EVENEMENT, ouvrir);
    return () => window.removeEventListener(EVENEMENT, ouvrir);
  }, []);
  useEffect(() => {
    if (!onglet) return;
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOnglet(null);
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onglet]);
  if (!onglet) return null;

  return (
    <div className="voile" onMouseDown={() => setOnglet(null)}>
      <div className="modale infos-legales" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Informations légales">
        <div className="modale-entete">
          <h2>Informations légales</h2>
          <div className="espace" />
          <button className="icone" onClick={() => setOnglet(null)} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="segmente il-onglets" role="tablist">
          {(Object.keys(TITRES) as OngletLegal[]).map((o) => (
            <button key={o} role="tab" aria-selected={onglet === o} className={onglet === o ? 'actif neutre' : ''} onClick={() => setOnglet(o)}>
              {TITRES[o]}
            </button>
          ))}
        </div>
        <div className="il-corps">
          {onglet === 'risques' && (
            <>
              <h3>Avertissement sur les risques</h3>
              <p>
                <strong>Parnassa Trading est un simulateur.</strong> Les comptes démo, les challenges et les comptes « financés » sont fictifs : aucun ordre
                n'est transmis à un marché, aucun argent réel n'est engagé, et les gains affichés ne peuvent pas être retirés en argent réel.
              </p>
              <p>
                <strong>Ce n'est pas un conseil en investissement.</strong> Les actualités, le calendrier, le coach, les statistiques et les projections sont
                fournis à titre d'information et d'entraînement. Ils ne constituent ni une recommandation d'achat ou de vente, ni une promesse de résultat.
              </p>
              <p>
                <strong>Des résultats simulés ne garantissent rien.</strong> La simulation reproduit le spread, le swap, le levier, les horaires de marché et les
                frais de façon réaliste, mais une exécution réelle peut différer : liquidité, glissement plus fort lors des annonces, cotations différées de
                10 à 15 minutes sur certains indices et actions, coupures de flux. Une stratégie gagnante ici peut perdre sur un vrai compte.
              </p>
              <p>
                <strong>Le trading avec effet de levier comporte un risque élevé de perte rapide.</strong> Sur les produits à effet de levier (CFD, contrats
                à terme, crypto-actifs avec marge), la grande majorité des comptes de particuliers perdent de l'argent ; une petite variation de prix peut
                entraîner une perte supérieure à la mise. Ne tradez avec de l'argent réel que des sommes que vous pouvez vous permettre de perdre, et
                renseignez-vous auprès d'un professionnel agréé.
              </p>
            </>
          )}
          {onglet === 'confidentialite' && (
            <>
              <h3>Vos données</h3>
              <p>Parnassa Trading n'utilise ni publicité, ni outil de mesure d'audience, ni traceur. Voici exactement ce qui est conservé, et où.</p>
              <h4>Sur votre appareil</h4>
              <p>
                Votre portefeuille papier, vos réglages, listes de suivi, alertes, plans et journal sont enregistrés dans le stockage local de votre navigateur.
                Ils ne quittent pas l'appareil tant que vous ne vous connectez pas à un compte. Vous pouvez les exporter ou les effacer depuis les Paramètres.
              </p>
              <h4>Compte de trading (si vous en ouvrez un)</h4>
              <p>
                Le numéro de compte, son nom, son type, les mots de passe (conservés uniquement sous forme chiffrée, jamais en clair), l'état du compte
                (positions, opérations, challenge) et les dates de connexion sont enregistrés sur les serveurs Parnassa, rattachés à votre compte Parnassa.
                Le classement n'affiche que le pseudo que vous choisissez, et seulement si vous vous y inscrivez.
              </p>
              <h4>Notifications sur l'appareil (si vous les activez)</h4>
              <p>
                L'adresse d'abonnement fournie par votre navigateur et vos préférences de notification (annonces suivies, mots-clés, alertes de prix) sont
                conservées sur le relais Parnassa pour pouvoir vous prévenir application fermée. Les désactiver dans les Paramètres les supprime.
              </p>
              <h4>Journal des erreurs</h4>
              <p>
                Quand l'application plante, elle envoie le message d'erreur, l'emplacement dans le code, l'écran concerné, la version et le type de
                navigateur, pour que le problème soit corrigé. Aucune donnée de compte, de portefeuille ni d'identité n'est envoyée.
              </p>
              <h4>Services tiers contactés par votre navigateur</h4>
              <ul>
                <li>TradingView (graphiques, screener, cartes de marché) : ses widgets sont soumis à sa propre politique de confidentialité.</li>
                <li>Binance (cours des crypto-actifs) et Yahoo Finance (cours du change, des indices et des actions), en lecture seule.</li>
                <li>Le relais Parnassa, qui récupère pour vous les actualités, le calendrier économique et les données de marché publiques.</li>
              </ul>
            </>
          )}
          {onglet === 'conditions' && (
            <>
              <h3>Conditions d'utilisation</h3>
              <p>
                Parnassa Trading est fourni tel quel, à des fins d'apprentissage et d'entraînement. Les cotations, actualités et données économiques
                proviennent de sources publiques et peuvent être retardées, incomplètes ou momentanément indisponibles.
              </p>
              <p>
                Les comptes démo et challenge n'ont aucune valeur monétaire. Leurs résultats, classements, trophées et certificats attestent d'une
                performance simulée uniquement.
              </p>
              <p>
                Vous êtes responsable de la confidentialité de vos accès (numéro de compte et mots de passe). L'accès investisseur permet à un tiers de
                consulter un compte sans pouvoir y passer d'ordre : ne le partagez qu'avec des personnes de confiance.
              </p>
              <p>
                Il est interdit de chercher à perturber le service, à contourner ses limites ou à accéder aux comptes d'autres utilisateurs. Un compte
                utilisé de manière abusive peut être fermé.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
