/**
 * Relais d'actualités financières : agrège des flux RSS publics, les normalise et les sert en JSON
 * avec CORS, mis en cache 60 s. Déployé sur Cloudflare Workers (aucune donnée personnelle traitée).
 */

type Categorie = 'annonces' | 'marches' | 'forex' | 'crypto' | 'banques-centrales' | 'france' | 'matieres';

interface Flux {
  url: string;
  source: string;
  categorie: Categorie;
  langue: 'fr' | 'en';
}

interface Donnee {
  indicateur: string;
  actuel: string;
  prevision: string | null;
  precedent: string | null;
  /** Comparaison réel / prévision : 1 au-dessus, -1 en dessous, 0 égal, null si non comparable. */
  ecart: 1 | -1 | 0 | null;
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
  donnee?: Donnee;
}

interface EvenementCalendrier {
  id: string;
  titre: string;
  pays: string;
  devise: string;
  periode: string;
  date: number;
  /** -1 faible / jour férié, 0 moyen, 1 fort. */
  importance: number;
  actuel: number | null;
  prevision: number | null;
  precedent: number | null;
  unite: string;
  echelle: string;
}

const FLUX_FINANCIALJUICE: Flux = { url: 'https://www.financialjuice.com/feed.ashx?xy=rss', source: 'FinancialJuice', categorie: 'annonces', langue: 'en' };

const FLUX: Flux[] = [
  FLUX_FINANCIALJUICE,
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

function nombreDonnee(v: string | null): number | null {
  if (!v || v === '-') return null;
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0]);
  if (/k$/i.test(v)) n *= 1e3;
  if (/m$/i.test(v)) n *= 1e6;
  if (/b$/i.test(v)) n *= 1e9;
  return n;
}

/** « German CPI YoY Actual 2.1% (Forecast 2.0%, Previous 1.9%) » → données structurées. */
function analyserDonnee(titre: string): Donnee | undefined {
  const m = titre.match(/^(.*?)\s+Actual\s+(.+?)\s*\(Forecast\s+([^,]*),\s*Previous\s+([^)]*)\)/i);
  if (!m) return undefined;
  const [, indicateur, actuel, prevision, precedent] = m.map((x) => x.trim());
  const a = nombreDonnee(actuel);
  const f = nombreDonnee(prevision);
  return {
    indicateur,
    actuel,
    prevision: prevision && prevision !== '-' ? prevision : null,
    precedent: precedent && precedent !== '-' ? precedent : null,
    ecart: a === null || f === null ? null : a > f ? 1 : a < f ? -1 : 0,
  };
}

/** Catégorie d'une annonce FinancialJuice déduite de son titre. */
function categorieAnnonce(titre: string): Categorie {
  if (/\b(fed|fomc|powell|ecb|lagarde|boe|bailey|boj|ueda|snb|rba|rbnz|boc|pboc|central bank|rate decision)\b/i.test(titre)) return 'banques-centrales';
  if (/\b(bitcoin|btc|ether|crypto|stablecoin)\b/i.test(titre)) return 'crypto';
  if (/\b(oil|crude|brent|wti|opec|gold|silver|copper|natgas|natural gas|wheat)\b/i.test(titre)) return 'matieres';
  if (/\b(eur\/|usd\/|gbp\/|jpy|yen|yuan|dollar|fx options|forex)\b/i.test(titre)) return 'forex';
  return 'annonces';
}

function parser(xml: string, flux: Flux): Depeche[] {
  const blocs = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const depeches: Depeche[] = [];
  for (const bloc of blocs) {
    const titre = decoder(balise(bloc, 'title') ?? '').replace(/^FinancialJuice:\s*/i, '');
    // Les liens « FJElite » renvoient vers l'offre payante de FinancialJuice : on les écarte.
    if (!titre || /-\s*FJElite\s*$/i.test(titre)) continue;
    const estFJ = flux.source === 'FinancialJuice';
    const donnee = estFJ ? analyserDonnee(titre) : undefined;
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
      categorie: estFJ ? (donnee ? 'annonces' : categorieAnnonce(titre)) : flux.categorie,
      langue: flux.langue,
      date,
      // Une donnée économique très éloignée de la prévision est signalée comme importante.
      important: important || (donnee?.ecart !== null && donnee?.ecart !== undefined && donnee.ecart !== 0 && MOTS_IMPORTANTS[3].test(donnee.indicateur)),
      donnee,
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

/**
 * Récupère un texte distant avec deux niveaux de cache : une copie fraîche (`fraicheur` s) qui évite de
 * solliciter la source à chaque visite, et une copie de secours (24 h) servie si la source refuse
 * temporairement (FinancialJuice limite à quelques appels par minute).
 */
async function recupererTexte(url: string, fraicheur: number, ctx?: ExecutionContext): Promise<string | null> {
  const cache = caches.default;
  const cleFraiche = new Request(`https://cache.parnassa/frais?u=${encodeURIComponent(url)}`);
  const cleSecours = new Request(`https://cache.parnassa/secours?u=${encodeURIComponent(url)}`);
  const frais = await cache.match(cleFraiche);
  if (frais) return frais.text();
  try {
    const reponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, application/json;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    if (reponse.ok) {
      const texte = await reponse.text();
      const ecrire = Promise.all([
        cache.put(cleFraiche, new Response(texte, { headers: { 'Cache-Control': `max-age=${fraicheur}` } })),
        cache.put(cleSecours, new Response(texte, { headers: { 'Cache-Control': 'max-age=86400' } })),
      ]);
      if (ctx) ctx.waitUntil(ecrire);
      else await ecrire;
      return texte;
    }
  } catch {
    // réseau ou délai dépassé : on tente la copie de secours
  }
  const secours = await cache.match(cleSecours);
  return secours ? secours.text() : null;
}

let contexte: ExecutionContext | undefined;

async function lireFlux(flux: Flux): Promise<Depeche[]> {
  const fraicheur = flux.source === 'FinancialJuice' ? 30 : 90;
  const texte = await recupererTexte(flux.url, fraicheur, contexte);
  return texte ? parser(texte, flux) : [];
}

const PAYS_CALENDRIER = 'US,EU,DE,FR,GB,JP,CN,CA,AU,CH,IT,ES,NZ';

/** Calendrier économique (hier → J+6) avec valeurs réelles publiées, prévisions et précédents. */
async function calendrier(): Promise<EvenementCalendrier[]> {
  const jour = 86400000;
  const debut = new Date(Math.floor(Date.now() / jour) * jour - jour).toISOString();
  const fin = new Date(Math.floor(Date.now() / jour) * jour + 7 * jour).toISOString();
  const url = `https://economic-calendar.tradingview.com/events?from=${debut}&to=${fin}&countries=${PAYS_CALENDRIER}`;
  const cache = caches.default;
  const cle = new Request(`https://cache.parnassa/calendrier?d=${debut}`);
  const enCache = await cache.match(cle);
  let texte = enCache ? await enCache.text() : null;
  if (!texte) {
    try {
      const r = await fetch(url, { headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0)' }, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        texte = await r.text();
        const ecrire = cache.put(cle, new Response(texte, { headers: { 'Cache-Control': 'max-age=60' } }));
        if (contexte) contexte.waitUntil(ecrire);
      }
    } catch {
      texte = null;
    }
  }
  if (!texte) return [];
  try {
    const brut = (JSON.parse(texte) as { result?: Record<string, unknown>[] }).result ?? [];
    return brut
      .map((e) => ({
        id: String(e.id),
        titre: String(e.title ?? ''),
        pays: String(e.country ?? ''),
        devise: String(e.currency ?? ''),
        periode: String(e.period ?? ''),
        date: Date.parse(String(e.date)),
        importance: Number(e.importance ?? -1),
        actuel: typeof e.actual === 'number' ? e.actual : null,
        prevision: typeof e.forecast === 'number' ? e.forecast : null,
        precedent: typeof e.previous === 'number' ? e.previous : null,
        unite: String(e.unit ?? ''),
        echelle: String(e.scale ?? ''),
      }))
      .filter((e) => Number.isFinite(e.date) && e.titre)
      .sort((a, b) => a.date - b.date);
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
    contexte = ctx;
    if (requete.method === 'OPTIONS') return json(null, 86400);
    const url = new URL(requete.url);
    const cache = caches.default;
    const cleCache = new Request(url.toString(), { method: 'GET' });
    const enCache = await cache.match(cleCache);
    if (enCache) return enCache;

    let reponse: Response;
    if (url.pathname === '/flux') {
      const depeches = await agreger(FLUX, 500);
      reponse = json({ generéLe: Date.now(), depeches }, 30);
    } else if (url.pathname === '/annonces') {
      const depeches = await agreger([FLUX_FINANCIALJUICE], 200);
      reponse = json({ generéLe: Date.now(), depeches }, 20);
    } else if (url.pathname === '/calendrier') {
      reponse = json({ generéLe: Date.now(), evenements: await calendrier() }, 60);
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
      reponse = json({ service: 'parnassa-actualites', flux: FLUX.length, routes: ['/flux', '/annonces', '/calendrier', '/recherche?q=…&ticker=…'] }, 0);
    } else {
      return json({ erreur: 'Route inconnue.' }, 0);
    }
    ctx.waitUntil(cache.put(cleCache, reponse.clone()));
    return reponse;
  },
};
