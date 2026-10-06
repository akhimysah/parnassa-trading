import { useEffect, useRef } from 'react';
import type { Alerte } from './types';
import { paireBinance, useFluxBinance, formaterPrix } from './binance';
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

export function demanderNotifications(): void {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
}

function notifier(titre: string, corps: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(titre, { body: corps, icon: 'icone-192.png' });
    } catch {
      // Certains navigateurs mobiles n'autorisent les notifications que via un service worker.
    }
  }
}

export function conditionRemplie(alerte: Alerte, prix: number): boolean {
  return alerte.condition === 'au-dessus' ? prix >= alerte.seuil : prix <= alerte.seuil;
}

/**
 * Surveille les alertes actives avec le flux Binance et les déclenche au franchissement du seuil.
 * Retourne les prix en direct pour les paires surveillées (alertes + liste de suivi crypto).
 */
export function useMoteurAlertes(
  alertes: Alerte[],
  pairesSupplementaires: string[],
  majAlertes: (f: (a: Alerte[]) => Alerte[]) => void,
  signaler: (message: string) => void,
) {
  const actives = alertes.filter((a) => !a.declencheeLe);
  const paires = [...actives.map((a) => paireBinance(a.symbole)), ...pairesSupplementaires];
  const ticks = useFluxBinance(paires);
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
      const corps = `${nomSymbole(a.symbole)} ${sens} ${formaterPrix(a.seuil)} (${formaterPrix(a.prixDeclenchement ?? 0)})${a.note ? ` — ${a.note}` : ''}`;
      refSignaler.current(`🔔 ${ticker(a.symbole)} : ${corps}`);
      notifier(`Alerte ${ticker(a.symbole)}`, corps);
      sonner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks]);

  return ticks;
}
