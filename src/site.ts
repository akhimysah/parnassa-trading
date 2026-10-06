/** Adresse publique de l'application : les widgets y renvoient au lieu de tradingview.com. */
export const URL_SITE = new URL(import.meta.env.BASE_URL, window.location.origin).href;

/** Symbole transmis par un widget (clic sur un symbole) via « ?tvwidgetsymbol=BOURSE:TICKER ». */
export function symboleDepuisUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const symbole = params.get('tvwidgetsymbol');
  if (!symbole) return null;
  params.delete('tvwidgetsymbol');
  const reste = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (reste ? `?${reste}` : ''));
  return symbole;
}
