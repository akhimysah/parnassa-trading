import { Component, type ErrorInfo, type ReactNode } from 'react';
import { estErreurDeChargement, signalerErreur } from '../erreurs';

interface Props {
  children: ReactNode;
  /** Change de valeur (la page affichée) : l'erreur est oubliée et on réessaie d'afficher. */
  cle?: string;
  /** Repli en cas de panne : retour à l'accueil. */
  accueil?: () => void;
}

const CLE_RECHARGE = 'parnassa-trading:recharge-version';

/**
 * Barrière d'erreurs : une page qui plante affiche un message au lieu d'emporter toute l'application,
 * et l'erreur part au journal. Un morceau du site introuvable après une mise à jour recharge la page une fois.
 */
export class BarriereErreur extends Component<Props, { erreur: Error | null; cle?: string }> {
  state: { erreur: Error | null; cle?: string } = { erreur: null, cle: this.props.cle };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  static getDerivedStateFromProps(props: Props, state: { erreur: Error | null; cle?: string }) {
    return props.cle !== state.cle ? { erreur: null, cle: props.cle } : null;
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    if (estErreurDeChargement(erreur.message)) {
      try {
        if (sessionStorage.getItem(CLE_RECHARGE) !== '1') {
          sessionStorage.setItem(CLE_RECHARGE, '1');
          location.reload();
          return;
        }
      } catch {
        // stockage indisponible : on affiche le message
      }
    }
    signalerErreur('react', erreur, info.componentStack ?? '');
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    const chargement = estErreurDeChargement(this.state.erreur.message);
    return (
      <div className="barriere-erreur" role="alert">
        <strong>{chargement ? 'Une nouvelle version de Parnassa Trading est disponible.' : 'Cet écran a rencontré un problème.'}</strong>
        <p className="muet">
          {chargement
            ? 'Rechargez la page pour la charger.'
            : 'Le reste de l’application fonctionne. L’erreur nous a été signalée automatiquement (sans vos données de compte).'}
        </p>
        <div className="barriere-actions">
          <button className="bouton-principal" onClick={() => location.reload()}>
            Recharger
          </button>
          {!chargement && this.props.accueil && (
            <button className="bouton-secondaire" onClick={() => this.props.accueil?.()}>
              Retour à l’accueil
            </button>
          )}
        </div>
      </div>
    );
  }
}
