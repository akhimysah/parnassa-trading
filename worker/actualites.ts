/**
 * Relais d'actualités financières : agrège des flux RSS publics, les normalise et les sert en JSON
 * avec CORS, mis en cache 60 s. Déployé sur Cloudflare Workers (aucune donnée personnelle traitée).
 */

type Categorie = 'marches' | 'forex' | 'crypto' | 'banques-centrales' | 'france' | 'matieres';

interface Flux {
  url: string;
  source: string;
  categorie: Categorie;
  langue: 'fr' | 'en';
}

interface Depeche {
  id: string;
  titre: string;
  lien: string;
  source: string;
  categorie: Categorie;
  langue: 'fr' | 'en';
  date: number;
  important: boolean;
}

const FLUX: Flux[] = [
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', source: 'MarketWatch', categorie: 'marches', langue: 'en' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch', categorie: 'marches', langue: 'en' },
  { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC', categorie: 'marches', langue: 'en' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', categorie: 'marches', langue: 'en' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com', categorie: 'marches', langue: 'en' },
  { url: 'https://www.investing.com/rss/news_11.rss', source: 'Investing.com', categorie: 'matieres', langue: 'en' },
  { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet', categorie: 'forex', langue: 'en' },
  { url: 'https://www.forexlive.com/feed/news', source: 'ForexLive', categorie: 'forex', langue: 'en' },
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Fed', categorie: 'banques-centrales', langue: 'en' },
  { url: 'https://www.ecb.europa.eu/rss/press.html', source: 'BCE', categorie: 'banques-centrales', langue: 'en' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk', categorie: 'crypto', langue: 'en' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph', categorie: 'crypto', langue: 'en' },
  { url: 'https://fr.investing.com/rss/news.rss', source: 'Investing.com', categorie: 'france', langue: 'fr' },
  { url: 'https://fr.investing.com/rss/market_overview.rss', source: 'Investing.com', categorie: 'france', langue: 'fr' },
  { url: 'https://www.abcbourse.com/rss/displaynewsrss', source: 'ABC Bourse', categorie: 'france', langue: 'fr' },
  { url: 'https://www.bfmtv.com/rss/economie/', source: 'BFM', categorie: 'france', langue: 'fr' },
];

const MOTS_IMPORTANTS = [
  /\b(breaking|urgent|flash|alerte|just in)\b/i,
  /\b(fed|fomc|powell|bce|ecb|lagarde|boe|boj|snb|banque centrale|central bank)\b/i,
  /\b(taux directeur|rate decision|rate hike|rate cut|hausse des taux|baisse des taux|interest rate)\b/i,
  /\b(cpi|inflation|pce|nfp|non-farm|payrolls|emploi|unemployment|chômage|gdp|pib|pmi|ism)\b/i,
  /\b(krach|crash|plunge|soars|record|all-time high|plus haut historique|circuit breaker|halted)\b/i,
  /\b(tarif|tariff|sanction|default|défaut de paiement|faillite|bankruptcy)\b/i,
];

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', '#8230': '…', '#x27': "'", '#160': ' ' };

function decoder(texte: string): string {
  return texte
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tout, code: string) => {
      const c = code.toLowerCase();
      if (ENTITES[c]) return ENTITES[c];
      if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith('#')) return String.fromCodePoint(parseInt(c.slice(1), 10));
      return tout;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function balise(bloc: string, nom: string): string | null {
  const m = bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i'));
  return m ? m[1] : null;
}

function lienAtom(bloc: string): string | null {
  const m = bloc.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}

function parser(xml: string, flux: Flux): Depeche[] {
  const blocs = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const depeches: Depeche[] = [];
  for (const bloc of blocs) {
    const titre = decoder(balise(bloc, 'title') ?? '');
    if (!titre) continue;
    const lienBrut = balise(bloc, 'link') ?? lienAtom(bloc) ?? balise(bloc, 'guid') ?? '';
    const lien = decoder(lienBrut);
    const dateBrute = balise(bloc, 'pubDate') ?? balise(bloc, 'published') ?? balise(bloc, 'updated') ?? balise(bloc, 'dc:date') ?? '';
    const date = Date.parse(decoder(dateBrute)) || Date.now();
    const important = MOTS_IMPORTANTS.some((r) => r.test(titre));
    const sourceBing = balise(bloc, 'News:Source');
    depeches.push({
      id: `${flux.source}:${hacher(titre)}`,
      titre,
      lien,
      source: sourceBing ? decoder(sourceBing) : flux.source,
      categorie: flux.categorie,
      langue: flux.langue,
      date,
      important,
    });
  }
  return depeches;
}

function hacher(texte: string): string {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normaliserTitre(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç ]/g, '').replace(/\s+/g, ' ').trim();
}

async function lireFlux(flux: Flux): Promise<Depeche[]> {
  try {
    const reponse = await fetch(flux.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    if (!reponse.ok) return [];
    return parser(await reponse.text(), flux);
  } catch {
    return [];
  }
}

async function agreger(fluxs: Flux[], limite: number): Promise<Depeche[]> {
  const listes = await Promise.all(fluxs.map(lireFlux));
  const vus = new Set<string>();
  const toutes = listes
    .flat()
    .filter((d) => d.date <= Date.now() + 3600000)
    .sort((a, b) => b.date - a.date)
    .filter((d) => {
      const cle = normaliserTitre(d.titre).slice(0, 80);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
  return toutes.slice(0, limite);
}

function json(donnees: unknown, maxAge: number): Response {
  return new Response(JSON.stringify(donnees), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async fetch(requete: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (requete.method === 'OPTIONS') return json(null, 86400);
    const url = new URL(requete.url);
    const cache = caches.default;
    const cleCache = new Request(url.toString(), { method: 'GET' });
    const enCache = await cache.match(cleCache);
    if (enCache) return enCache;

    let reponse: Response;
    if (url.pathname === '/flux') {
      const depeches = await agreger(FLUX, 400);
      reponse = json({ generéLe: Date.now(), depeches }, 60);
    } else if (url.pathname === '/recherche') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
      const ticker = (url.searchParams.get('ticker') ?? '').trim().slice(0, 20);
      if (!q && !ticker) return json({ erreur: 'Paramètre q ou ticker requis.' }, 0);
      const fluxs: Flux[] = [];
      if (q) {
        // Bing News répond depuis les adresses Cloudflare ; Google News les bloque.
        fluxs.push({ url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=fr&cc=FR`, source: 'Bing Actualités', categorie: 'marches', langue: 'fr' });
        fluxs.push({ url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en&cc=US`, source: 'Bing News', categorie: 'marches', langue: 'en' });
      }
      if (ticker && /^[A-Z0-9.^=-]+$/i.test(ticker)) {
        fluxs.push({ url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`, source: 'Yahoo Finance', categorie: 'marches', langue: 'en' });
      }
      const depeches = await agreger(fluxs, 80);
      reponse = json({ generéLe: Date.now(), depeches }, 120);
    } else if (url.pathname === '/' || url.pathname === '/sante') {
      reponse = json({ service: 'parnassa-actualites', flux: FLUX.length, routes: ['/flux', '/recherche?q=…&ticker=…'] }, 0);
    } else {
      return json({ erreur: 'Route inconnue.' }, 0);
    }
    ctx.waitUntil(cache.put(cleCache, reponse.clone()));
    return reponse;
  },
};
