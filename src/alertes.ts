import { useEffect, useRef } from 'react';
import type { Alerte } from './types';
import { paireBinance, type Tick } from './binance';
import { formaterCotation, instrument } from './instruments';
import { nomSymbole, ticker } from './symboles';

function sonner() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio indisponible : la notification visuelle suffit.
  }
}

export { sonner };

export function demanderNotifications(): void {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
}

/**
 * Notification système. Passe par le service worker quand il existe (obligatoire sur Android, et la
 * notification ramène alors vers l'application au clic), sinon par l'API Notification classique.
 */
export function notifier(titre: string, corps: string, lien?: string, tag?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body: corps, icon: 'icone-192.png', badge: 'icone-192.png', tag, data: { url: lien ?? window.location.href } };
  const classique = () => {
    try {
      new Notification(titre, options);
    } catch {
      // Notification impossible hors service worker sur ce navigateur.
    }
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => (reg ? reg.showNotification(titre, options) : classique()))
      .catch(classique);
  } else classique();
}

export function conditionRemplie(alerte: Alerte, prix: number): boolean {
  return alerte.condition === 'au-dessus' ? prix >= alerte.seuil : prix <= alerte.seuil;
}

/**
 * Surveille les alertes actives sur la table de prix commune (crypto, or, forex, indices, actions…)
 * et les déclenche au franchissement du seuil.
 */
export function useMoteurAlertes(
  alertes: Alerte[],
  ticks: Record<string, Tick>,
  majAlertes: (f: (a: Alerte[]) => Alerte[]) => void,
  signaler: (message: string) => void,
  son = true,
) {
  const actives = alertes.filter((a) => !a.declencheeLe);
  const refSignaler = useRef(signaler);
  refSignaler.current = signaler;

  useEffect(() => {
    if (actives.length === 0) return;
    const maintenant = Date.now();
    const declenchees: Alerte[] = [];
    majAlertes((liste) =>
      liste.map((a) => {
        if (a.declencheeLe) return a;
        const tick = ticks[paireBinance(a.symbole)];
        if (!tick) return a;
        const prix = tick.prix;
        const avant = a.dernierPrix;
        // Premier prix observé : on l'enregistre sans déclencher, pour exiger un vrai franchissement.
        if (avant === undefined) return { ...a, dernierPrix: prix };
        const franchit = conditionRemplie(a, prix) && !conditionRemplie(a, avant);
        if (!franchit) return a.dernierPrix === prix ? a : { ...a, dernierPrix: prix };
        const d = { ...a, dernierPrix: prix, declencheeLe: maintenant, prixDeclenchement: prix };
        declenchees.push(d);
        return d;
      }),
    );
    for (const a of declenchees) {
      const sens = a.condition === 'au-dessus' ? 'passe au-dessus de' : 'passe sous';
      const corps = `${nomSymbole(a.symbole)} ${sens} ${formaterCotation(a.symbole, a.seuil)} (${formaterCotation(a.symbole, a.prixDeclenchement ?? 0)})${a.note ? ` — ${a.note}` : ''}`;
      const code = instrument(a.symbole)?.code ?? ticker(a.symbole);
      refSignaler.current(`🔔 ${code} : ${corps}`);
      notifier(`Alerte ${code}`, corps, undefined, `alerte-${a.id}`);
      if (son) sonner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks]);
}
