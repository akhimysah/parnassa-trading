import { useEffect, useRef, useState } from 'react';

/** Point d'accès public « market data » de Binance, joignable depuis toutes les régions, sans clé. */
const WS = 'wss://data-stream.binance.vision/stream';
const REST = 'https://data-api.binance.vision/api/v3';

export interface Tick {
  prix: number;
  ouverture24h: number;
  haut24h: number;
  bas24h: number;
  volume24h: number;
  recuLe: number;
}

export function estBinance(symbole: string): boolean {
  return symbole.toUpperCase().startsWith('BINANCE:');
}

export function paireBinance(symbole: string): string {
  return symbole.split(':').pop()!.toUpperCase();
}

/** Prix instantanés (REST) pour amorcer l'affichage avant l'arrivée du flux. */
export async function prixInstantanes(paires: string[]): Promise<Record<string, number>> {
  if (paires.length === 0) return {};
  const url = `${REST}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(paires))}`;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Binance ${reponse.status}`);
  const donnees = (await reponse.json()) as { symbol: string; price: string }[];
  return Object.fromEntries(donnees.map((d) => [d.symbol, Number(d.price)]));
}

/**
 * Flux temps réel « miniTicker » (une mise à jour par seconde et par paire).
 * Reconnexion automatique ; les paires sont dédupliquées et normalisées.
 */
export function useFluxBinance(paires: string[]): Record<string, Tick> {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const cle = Array.from(new Set(paires.map((p) => p.toUpperCase()))).sort().join(',');
  const tampon = useRef<Record<string, Tick>>({});

  useEffect(() => {
    if (!cle) return;
    const liste = cle.split(',');
    let ws: WebSocket | null = null;
    let ferme = false;
    let tentative = 0;
    let minuteur: number | undefined;

    // Les ticks sont regroupés et poussés dans l'état au plus 4 fois par seconde.
    const vidange = window.setInterval(() => {
      const t = tampon.current;
      if (Object.keys(t).length === 0) return;
      tampon.current = {};
      setTicks((anciens) => ({ ...anciens, ...t }));
    }, 250);

    void prixInstantanes(liste)
      .then((prix) => {
        const maintenant = Date.now();
        for (const [paire, p] of Object.entries(prix)) {
          tampon.current[paire] = { prix: p, ouverture24h: p, haut24h: p, bas24h: p, volume24h: 0, recuLe: maintenant };
        }
      })
      .catch(() => undefined);

    const connecter = () => {
      if (ferme) return;
      const flux = liste.map((p) => `${p.toLowerCase()}@miniTicker`).join('/');
      ws = new WebSocket(`${WS}?streams=${flux}`);
      ws.onopen = () => {
        tentative = 0;
      };
      ws.onmessage = (e) => {
        const message = JSON.parse(e.data as string) as { data?: { s: string; c: string; o: string; h: string; l: string; q: string } };
        const d = message.data;
        if (!d) return;
        tampon.current[d.s] = {
          prix: Number(d.c),
          ouverture24h: Number(d.o),
          haut24h: Number(d.h),
          bas24h: Number(d.l),
          volume24h: Number(d.q),
          recuLe: Date.now(),
        };
      };
      ws.onclose = () => {
        if (ferme) return;
        tentative += 1;
        minuteur = window.setTimeout(connecter, Math.min(30000, 1000 * 2 ** tentative));
      };
      ws.onerror = () => ws?.close();
    };
    connecter();

    return () => {
      ferme = true;
      window.clearInterval(vidange);
      if (minuteur) window.clearTimeout(minuteur);
      ws?.close();
    };
  }, [cle]);

  return ticks;
}

const cacheKlines = new Map<string, { recuLe: number; clotures: number[] }>();

/** Clôtures journalières des `jours` derniers jours (cache 10 min), pour mini-courbes et variations. */
export async function cloturesJournalieres(paire: string, jours = 30): Promise<number[]> {
  const cle = `${paire}:${jours}`;
  const enCache = cacheKlines.get(cle);
  if (enCache && Date.now() - enCache.recuLe < 600000) return enCache.clotures;
  const reponse = await fetch(`${REST}/klines?symbol=${encodeURIComponent(paire)}&interval=1d&limit=${jours}`);
  if (!reponse.ok) throw new Error(`Binance ${reponse.status}`);
  const brut = (await reponse.json()) as unknown[][];
  const clotures = brut.map((k) => Number(k[4]));
  cacheKlines.set(cle, { recuLe: Date.now(), clotures });
  return clotures;
}

export function useCloturesJournalieres(paires: string[], jours = 30): Record<string, number[]> {
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const cle = Array.from(new Set(paires)).sort().join(',');
  useEffect(() => {
    let annule = false;
    const liste = cle ? cle.split(',') : [];
    void Promise.all(
      liste.map(async (p) => {
        try {
          return [p, await cloturesJournalieres(p, jours)] as const;
        } catch {
          return [p, []] as const;
        }
      }),
    ).then((resultats) => {
      if (!annule) setSeries(Object.fromEntries(resultats));
    });
    return () => {
      annule = true;
    };
  }, [cle, jours]);
  return series;
}

export function formaterPrix(prix: number): string {
  const decimales = prix >= 1000 ? 2 : prix >= 1 ? 4 : 6;
  return prix.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
