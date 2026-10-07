import type { Depeche, LangueAffichage } from './actualites';
import { motsClesTrouves, texteRecherche } from './actualites';
import type { Parametres } from './types';

/** Texte prononcé pour une dépêche (les chiffres économiques sont lus en phrase complète). */
export function texteParle(d: Depeche, langue: 'fr' | 'en'): string {
  if (d.donnee) {
    const indic = langue === 'en' ? (d.donnee.indicateurEn ?? d.donnee.indicateur) : (d.donnee.indicateurFr ?? d.donnee.indicateur);
    const lire = (v: string | null) => (v ?? (langue === 'en' ? 'none' : 'aucune')).replace('%', langue === 'en' ? ' percent' : ' pour cent');
    return langue === 'en'
      ? `${indic}: actual ${lire(d.donnee.actuel)}, forecast ${lire(d.donnee.prevision)}, previous ${lire(d.donnee.precedent)}.`
      : `${indic} : réel ${lire(d.donnee.actuel)}, prévision ${lire(d.donnee.prevision)}, précédent ${lire(d.donnee.precedent)}.`;
  }
  const titre = langue === 'en' ? (d.titreEn ?? d.titre) : (d.titreFr ?? d.titre);
  // Les sigles boursiers se lisent mieux sans les deux-points ni les tirets de source.
  return titre.replace(/\s+[-–—]\s+[A-Z][\w .]+$/, '').replace(/\s*:\s*/g, langue === 'en' ? ': ' : ' : ');
}

export function langueParlee(langue: LangueAffichage): 'fr' | 'en' {
  return langue === 'en' ? 'en' : 'fr';
}

export function doitEtreLue(d: Depeche, p: Parametres): boolean {
  if (motsClesTrouves(texteRecherche(d), p.motsCles).length > 0) return true;
  if (p.squawk.filtre === 'tout') return true;
  if (p.squawk.filtre === 'importantes') return d.important;
  return d.source === 'FinancialJuice';
}

let voixCache: SpeechSynthesisVoice[] = [];
function voix(langue: 'fr' | 'en'): SpeechSynthesisVoice | undefined {
  if (!('speechSynthesis' in window)) return undefined;
  if (voixCache.length === 0) voixCache = window.speechSynthesis.getVoices();
  const candidates = voixCache.filter((v) => v.lang.toLowerCase().startsWith(langue));
  // Préférence pour les voix « naturelles » / premium quand le système en propose.
  return candidates.find((v) => /natural|premium|enhanced|google/i.test(v.name)) ?? candidates[0];
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    voixCache = window.speechSynthesis.getVoices();
  };
}

export function squawkDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Ajoute des phrases à la file de lecture (au plus 6 d'un coup pour ne pas rester bloqué sur l'historique). */
export function annoncer(textes: string[], langue: 'fr' | 'en', vitesse: number): void {
  if (!squawkDisponible()) return;
  for (const texte of textes.slice(0, 6)) {
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = langue === 'en' ? 'en-US' : 'fr-FR';
    const v = voix(langue);
    if (v) u.voice = v;
    u.rate = vitesse;
    window.speechSynthesis.speak(u);
  }
}

export function couperSquawk(): void {
  if (squawkDisponible()) window.speechSynthesis.cancel();
}
