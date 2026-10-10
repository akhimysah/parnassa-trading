import { URL_ACTUALITES } from './actualites';

declare const __VERSION__: string;

/** Version du site (commit de la publication), pour savoir quelle livraison a planté. */
export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

/** Signalements au plus par visite, pour ne jamais inonder le journal. */
const MAX_PAR_VISITE = 10;
const dejaVus = new Set<string>();
let envoyes = 0;

/** Bruit qui ne vient pas de notre code : extensions, iframes d'autres origines, avertissements du navigateur. */
const BRUIT = [/^Script error\.?$/i, /ResizeObserver loop/i, /chrome-extension:\/\//, /moz-extension:\/\//, /safari-(web-)?extension:\/\//];

/** Erreur de chargement d'un morceau du site (une nouvelle version a été publiée entre-temps). */
export function estErreurDeChargement(message: string): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|ChunkLoadError|error loading dynamically imported/i.test(message);
}

function texte(erreur: unknown): { message: string; pile: string } {
  if (erreur instanceof Error) return { message: `${erreur.name}: ${erreur.message}`, pile: erreur.stack ?? '' };
  if (typeof erreur === 'string') return { message: erreur, pile: '' };
  try {
    return { message: JSON.stringify(erreur).slice(0, 500), pile: '' };
  } catch {
    return { message: String(erreur), pile: '' };
  }
}

/**
 * Envoie une erreur au journal du relais : message, pile d'appels, page (#trading…), version et navigateur.
 * Jamais de données de compte. Rien n'est envoyé en développement.
 */
export function signalerErreur(type: 'erreur' | 'promesse' | 'react', erreur: unknown, complement = ''): void {
  const { message, pile } = texte(erreur);
  const complet = complement ? `${pile}\n--- composants ---${complement}` : pile;
  if (!message || BRUIT.some((r) => r.test(message) || r.test(complet))) return;
  const cle = `${type}|${message}`;
  if (dejaVus.has(cle) || envoyes >= MAX_PAR_VISITE) return;
  dejaVus.add(cle);
  envoyes++;
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname) && !location.search.includes('erreurs=1')) {
    console.warn('[suivi des erreurs, non envoyé en développement]', type, message);
    return;
  }
  const page = (location.hash.split('/')[0] || '#accueil').slice(0, 40);
  void fetch(`${URL_ACTUALITES}/erreurs`, {
    method: 'POST',
    // text/plain : pas de requête préalable CORS, et keepalive pour partir même si la page se ferme.
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type, message: message.slice(0, 500), pile: complet.slice(0, 4000), page, version: VERSION }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Écoute les erreurs non rattrapées et les promesses rejetées sans traitement. */
export function installerSuiviErreurs(): void {
  window.addEventListener('error', (e) => {
    // Une erreur d'un script d'une autre origine (widget TradingView) n'est pas la nôtre.
    if (e.filename && !e.filename.startsWith(location.origin)) return;
    signalerErreur('erreur', e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => signalerErreur('promesse', e.reason));
}
