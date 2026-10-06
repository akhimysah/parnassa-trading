import type { Etat, Intervalle, Page } from './types';

const PAGES: Page[] = ['graphique', 'marches', 'screener', 'symbole', 'actualites', 'calendrier', 'alertes', 'trading'];
const INTERVALLES: Intervalle[] = ['1', '5', '15', '60', '240', 'D', 'W'];

/** Lit « #page/SYMBOLE/intervalle » dans l'adresse (lien de partage). */
export function lireHash(): Partial<Pick<Etat, 'page' | 'symbole' | 'intervalle'>> {
  const brut = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  if (!brut) return {};
  const [page, symbole, intervalle] = brut.split('/');
  const resultat: Partial<Pick<Etat, 'page' | 'symbole' | 'intervalle'>> = {};
  if (PAGES.includes(page as Page)) resultat.page = page as Page;
  if (symbole && symbole.includes(':')) resultat.symbole = symbole;
  if (INTERVALLES.includes(intervalle as Intervalle)) resultat.intervalle = intervalle as Intervalle;
  return resultat;
}

export function ecrireHash(etat: Etat): void {
  const hash = `#${etat.page}/${etat.symbole}/${etat.intervalle}`;
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
}

export function lienPartage(etat: Etat): string {
  return `${window.location.origin}${window.location.pathname}#${etat.page}/${etat.symbole}/${etat.intervalle}`;
}
