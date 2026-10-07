var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// push.ts
var encodeur = new TextEncoder();
function versBase64Url(octets) {
  const tab = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let binaire = "";
  for (const o of tab) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(versBase64Url, "versBase64Url");
function depuisBase64Url(texte) {
  const b64 = texte.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - texte.length % 4) % 4);
  const binaire = atob(b64);
  const tab = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) tab[i] = binaire.charCodeAt(i);
  return tab;
}
__name(depuisBase64Url, "depuisBase64Url");
function concat(...parties) {
  const total = parties.reduce((s, p) => s + p.length, 0);
  const sortie = new Uint8Array(total);
  let i = 0;
  for (const p of parties) {
    sortie.set(p, i);
    i += p.length;
  }
  return sortie;
}
__name(concat, "concat");
async function hkdf(sel, ikm, info, longueur) {
  const cle = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sel, info }, cle, longueur * 8);
  return new Uint8Array(bits);
}
__name(hkdf, "hkdf");
async function jetonVapid(endpoint, clePrivee, contact) {
  const aud = new URL(endpoint).origin;
  const entete = versBase64Url(encodeur.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const charge = versBase64Url(encodeur.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 12 * 3600, sub: contact })));
  const cle = await crypto.subtle.importKey("jwk", clePrivee, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, encodeur.encode(`${entete}.${charge}`));
  return `${entete}.${charge}.${versBase64Url(signature)}`;
}
__name(jetonVapid, "jetonVapid");
async function chiffrer(abonnement, contenu) {
  const clePubliqueUA = depuisBase64Url(abonnement.keys.p256dh);
  const secretAuth = depuisBase64Url(abonnement.keys.auth);
  const ephemere = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const clePubliqueAS = new Uint8Array(await crypto.subtle.exportKey("raw", ephemere.publicKey));
  const cleUA = await crypto.subtle.importKey("raw", clePubliqueUA, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const partage = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: cleUA }, ephemere.privateKey, 256));
  const infoCle = concat(encodeur.encode("WebPush: info\0"), clePubliqueUA, clePubliqueAS);
  const ikm = await hkdf(secretAuth, partage, infoCle, 32);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, encodeur.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, encodeur.encode("Content-Encoding: nonce\0"), 12);
  const cleAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const clair = concat(contenu, new Uint8Array([2]));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cleAes, clair));
  const taille = new Uint8Array(4);
  new DataView(taille.buffer).setUint32(0, 4096);
  return concat(sel, taille, new Uint8Array([clePubliqueAS.length]), clePubliqueAS, chiffre);
}
__name(chiffrer, "chiffrer");
async function envoyerPush(abonnement, message, vapid2) {
  try {
    const corps = await chiffrer(abonnement, encodeur.encode(JSON.stringify(message)));
    const jeton = await jetonVapid(abonnement.endpoint, vapid2.privee, vapid2.contact);
    const r = await fetch(abonnement.endpoint, {
      method: "POST",
      headers: {
        TTL: "3600",
        Urgency: "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: `vapid t=${jeton}, k=${vapid2.publique}`,
        ...message.tag ? { Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}
      },
      body: corps,
      signal: AbortSignal.timeout(8e3)
    });
    if (r.status === 404 || r.status === 410) return "expire";
    return r.ok ? "ok" : "erreur";
  } catch {
    return "erreur";
  }
}
__name(envoyerPush, "envoyerPush");

// actualites.ts
var FLUX_FINANCIALJUICE = { url: "https://www.financialjuice.com/feed.ashx?xy=rss", source: "FinancialJuice", categorie: "annonces", langue: "en" };
var FLUX = [
  FLUX_FINANCIALJUICE,
  { url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", source: "MarketWatch", categorie: "marches", langue: "en" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", categorie: "marches", langue: "en" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", source: "CNBC", categorie: "marches", langue: "en" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", categorie: "marches", langue: "en" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com", categorie: "marches", langue: "en" },
  { url: "https://www.investing.com/rss/news_11.rss", source: "Investing.com", categorie: "matieres", langue: "en" },
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet", categorie: "forex", langue: "en" },
  { url: "https://www.forexlive.com/feed/news", source: "ForexLive", categorie: "forex", langue: "en" },
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Fed", categorie: "banques-centrales", langue: "en" },
  { url: "https://www.ecb.europa.eu/rss/press.html", source: "BCE", categorie: "banques-centrales", langue: "en" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk", categorie: "crypto", langue: "en" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", categorie: "crypto", langue: "en" },
  { url: "https://fr.investing.com/rss/news.rss", source: "Investing.com", categorie: "france", langue: "fr" },
  { url: "https://fr.investing.com/rss/market_overview.rss", source: "Investing.com", categorie: "france", langue: "fr" },
  { url: "https://www.abcbourse.com/rss/displaynewsrss", source: "ABC Bourse", categorie: "france", langue: "fr" },
  { url: "https://www.bfmtv.com/rss/economie/", source: "BFM", categorie: "france", langue: "fr" }
];
var MOTS_IMPORTANTS = [
  /\b(breaking|urgent|flash|alerte|just in)\b/i,
  /\b(fed|fomc|powell|bce|ecb|lagarde|boe|boj|snb|banque centrale|central bank)\b/i,
  /\b(taux directeur|rate decision|rate hike|rate cut|hausse des taux|baisse des taux|interest rate)\b/i,
  /\b(cpi|inflation|pce|nfp|non-farm|payrolls|emploi|unemployment|chômage|gdp|pib|pmi|ism)\b/i,
  /\b(krach|crash|plunge|soars|record|all-time high|plus haut historique|circuit breaker|halted)\b/i,
  /\b(tarif|tariff|sanction|default|défaut de paiement|faillite|bankruptcy)\b/i
];
var ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#8217": "\u2019", "#8216": "\u2018", "#8220": "\u201C", "#8221": "\u201D", "#8211": "\u2013", "#8212": "\u2014", "#8230": "\u2026", "#x27": "'", "#160": " " };
function decoder(texte) {
  return texte.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tout, code) => {
    const c = code.toLowerCase();
    if (ENTITES[c]) return ENTITES[c];
    if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16));
    if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10));
    return tout;
  }).replace(/\s+/g, " ").trim();
}
__name(decoder, "decoder");
function balise(bloc, nom) {
  const m = bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, "i"));
  return m ? m[1] : null;
}
__name(balise, "balise");
function lienAtom(bloc) {
  const m = bloc.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}
__name(lienAtom, "lienAtom");
function nombreDonnee(v) {
  if (!v || v === "-") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0]);
  if (/k$/i.test(v)) n *= 1e3;
  if (/m$/i.test(v)) n *= 1e6;
  if (/b$/i.test(v)) n *= 1e9;
  return n;
}
__name(nombreDonnee, "nombreDonnee");
function analyserDonnee(titre) {
  const m = titre.match(/^(.*?)\s+Actual\s+(.+?)\s*\(Forecast\s+([^,]*),\s*Previous\s+([^)]*)\)/i);
  if (!m) return void 0;
  const [, indicateur, actuel, prevision, precedent] = m.map((x) => x.trim());
  const a = nombreDonnee(actuel);
  const f = nombreDonnee(prevision);
  return {
    indicateur,
    actuel,
    prevision: prevision && prevision !== "-" ? prevision : null,
    precedent: precedent && precedent !== "-" ? precedent : null,
    ecart: a === null || f === null ? null : a > f ? 1 : a < f ? -1 : 0
  };
}
__name(analyserDonnee, "analyserDonnee");
function categorieAnnonce(titre) {
  if (/\b(fed|fomc|powell|ecb|lagarde|boe|bailey|boj|ueda|snb|rba|rbnz|boc|pboc|central bank|rate decision)\b/i.test(titre)) return "banques-centrales";
  if (/\b(bitcoin|btc|ether|crypto|stablecoin)\b/i.test(titre)) return "crypto";
  if (/\b(oil|crude|brent|wti|opec|gold|silver|copper|natgas|natural gas|wheat)\b/i.test(titre)) return "matieres";
  if (/\b(eur\/|usd\/|gbp\/|jpy|yen|yuan|dollar|fx options|forex)\b/i.test(titre)) return "forex";
  return "annonces";
}
__name(categorieAnnonce, "categorieAnnonce");
function parser(xml, flux) {
  const blocs = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const depeches = [];
  for (const bloc of blocs) {
    const titre = decoder(balise(bloc, "title") ?? "").replace(/^FinancialJuice:\s*/i, "");
    if (!titre || /-\s*FJElite\s*$/i.test(titre)) continue;
    const estFJ = flux.source === "FinancialJuice";
    const donnee = estFJ ? analyserDonnee(titre) : void 0;
    const lienBrut = balise(bloc, "link") ?? lienAtom(bloc) ?? balise(bloc, "guid") ?? "";
    const lien = decoder(lienBrut);
    const dateBrute = balise(bloc, "pubDate") ?? balise(bloc, "published") ?? balise(bloc, "updated") ?? balise(bloc, "dc:date") ?? "";
    const date = Date.parse(decoder(dateBrute)) || Date.now();
    const important = MOTS_IMPORTANTS.some((r) => r.test(titre));
    const sourceBing = balise(bloc, "News:Source");
    depeches.push({
      id: `${flux.source}:${hacher(titre)}`,
      titre,
      lien,
      source: sourceBing ? decoder(sourceBing) : flux.source,
      categorie: estFJ ? donnee ? "annonces" : categorieAnnonce(titre) : flux.categorie,
      langue: flux.langue,
      date,
      // Une donnée économique très éloignée de la prévision est signalée comme importante.
      important: important || donnee?.ecart !== null && donnee?.ecart !== void 0 && donnee.ecart !== 0 && MOTS_IMPORTANTS[3].test(donnee.indicateur),
      donnee
    });
  }
  return depeches;
}
__name(parser, "parser");
function hacher(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
__name(hacher, "hacher");
function normaliserTitre(t) {
  return t.toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç ]/g, "").replace(/\s+/g, " ").trim();
}
__name(normaliserTitre, "normaliserTitre");
var memoireFlux = /* @__PURE__ */ new Map();
var secoursCharge = null;
var secoursModifie = false;
var origine = "https://parnassa-actualites.neobank.workers.dev";
var cleSecours = /* @__PURE__ */ __name(() => new Request(`${origine}/__cache/secours-flux-v3`), "cleSecours");
async function chargerSecours(forcer = false) {
  if (secoursCharge && !forcer) return secoursCharge;
  const r = await caches.default.match(cleSecours());
  secoursCharge = r ? await r.json() : {};
  return secoursCharge;
}
__name(chargerSecours, "chargerSecours");
async function sauverSecours() {
  if (!secoursModifie || !secoursCharge) return;
  secoursModifie = false;
  await caches.default.put(cleSecours(), new Response(JSON.stringify(secoursCharge), { headers: { "Cache-Control": "max-age=86400" } }));
}
__name(sauverSecours, "sauverSecours");
var echecsRecents = /* @__PURE__ */ new Map();
async function recupererTexte(url, fraicheur) {
  const enMemoire = memoireFlux.get(url);
  if (enMemoire && Date.now() - enMemoire.recuLe < fraicheur * 1e3) return enMemoire.texte;
  const dernierEchec = echecsRecents.get(url);
  if (dernierEchec && Date.now() - dernierEchec < 6e4) return enMemoire?.texte ?? (await chargerSecours())[url] ?? (await chargerSecours(true))[url] ?? null;
  try {
    const reponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, application/json;q=0.9, */*;q=0.8"
      },
      signal: AbortSignal.timeout(6e3),
      redirect: "follow"
    });
    if (reponse.ok) {
      const texte = await reponse.text();
      memoireFlux.set(url, { recuLe: Date.now(), texte });
      const secours2 = await chargerSecours();
      if (secours2[url] !== texte) {
        secours2[url] = texte;
        secoursModifie = true;
      }
      return texte;
    }
    echecsRecents.set(url, Date.now());
  } catch {
    echecsRecents.set(url, Date.now());
  }
  if (enMemoire) return enMemoire.texte;
  const secours = await chargerSecours();
  return secours[url] ?? (await chargerSecours(true))[url] ?? null;
}
__name(recupererTexte, "recupererTexte");
var dictionnaires = { fr: null, en: null };
var dictionnaireModifie = { fr: false, en: false };
var cleDictionnaire = /* @__PURE__ */ __name((cible) => new Request(`${origine}/__cache/dictionnaire-${cible}-v2`), "cleDictionnaire");
async function dictionnaire(cible) {
  const existant = dictionnaires[cible];
  if (existant) return existant;
  const r = await caches.default.match(cleDictionnaire(cible));
  const carte = new Map(r ? Object.entries(await r.json()) : []);
  dictionnaires[cible] = carte;
  return carte;
}
__name(dictionnaire, "dictionnaire");
async function sauverDictionnaires() {
  for (const cible of ["fr", "en"]) {
    const carte = dictionnaires[cible];
    if (!carte || !dictionnaireModifie[cible]) continue;
    dictionnaireModifie[cible] = false;
    const entrees = [...carte.entries()].slice(-5e3);
    if (entrees.length < carte.size) dictionnaires[cible] = new Map(entrees);
    await caches.default.put(
      cleDictionnaire(cible),
      new Response(JSON.stringify(Object.fromEntries(entrees)), { headers: { "Cache-Control": "max-age=604800" } })
    );
  }
}
__name(sauverDictionnaires, "sauverDictionnaires");
async function appelTraduction(textes, source, cible) {
  const corps = new URLSearchParams();
  for (const t of textes) corps.append("q", t);
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=${source}&tl=${cible}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; ParnassaTrading/1.0)" },
      body: corps.toString(),
      signal: AbortSignal.timeout(8e3)
    });
    if (!r.ok) return null;
    const brut = await r.json();
    const liste = Array.isArray(brut) ? brut : [brut];
    const sortie = liste.map((x) => Array.isArray(x) ? String(x[0]) : String(x));
    return sortie.length === textes.length ? sortie : null;
  } catch {
    return null;
  }
}
__name(appelTraduction, "appelTraduction");
async function traduire(textes, source, cible) {
  if (textes.length === 0) return [];
  const carte = await dictionnaire(cible);
  const manquants = [...new Set(textes.filter((t) => !carte.has(t)))];
  const lots = [];
  let lot = [];
  let taille = 0;
  for (const t of manquants) {
    if (lot.length >= 60 || taille + t.length > 6e3) {
      lots.push(lot);
      lot = [];
      taille = 0;
    }
    lot.push(t);
    taille += t.length;
  }
  if (lot.length) lots.push(lot);
  await Promise.all(
    lots.slice(0, 12).map(async (l) => {
      const traductions = await appelTraduction(l, source, cible);
      if (!traductions) return;
      l.forEach((t, k) => carte.set(t, traductions[k]));
      dictionnaireModifie[cible] = true;
    })
  );
  return textes.map((t) => carte.get(t) ?? t);
}
__name(traduire, "traduire");
async function bilingue(depeches) {
  const versFr = depeches.filter((d) => d.langue === "en");
  const versEn = depeches.filter((d) => d.langue === "fr");
  const indicateurs = versFr.filter((d) => d.donnee).map((d) => d.donnee.indicateur);
  const [fr, en, indicFr] = await Promise.all([
    traduire(versFr.map((d) => d.titre), "en", "fr"),
    traduire(versEn.map((d) => d.titre), "fr", "en"),
    traduire(indicateurs, "en", "fr")
  ]);
  const tradFr = new Map(versFr.map((d, i) => [d.id, fr[i]]));
  const tradEn = new Map(versEn.map((d, i) => [d.id, en[i]]));
  const tradIndic = new Map(indicateurs.map((t, i) => [t, indicFr[i]]));
  return depeches.map((d) => ({
    ...d,
    titreFr: d.langue === "fr" ? d.titre : tradFr.get(d.id) ?? d.titre,
    titreEn: d.langue === "en" ? d.titre : tradEn.get(d.id) ?? d.titre,
    donnee: d.donnee ? { ...d.donnee, indicateurEn: d.donnee.indicateur, indicateurFr: tradIndic.get(d.donnee.indicateur) ?? d.donnee.indicateur } : void 0
  }));
}
__name(bilingue, "bilingue");
var envGlobal;
var contexteRequete;
var CLE_KV_FJ = "financialjuice-rss";
var memoireFJ = null;
async function lireCopieFJ(env) {
  const brut = await env.ANNONCES.get(CLE_KV_FJ);
  if (!brut) return null;
  if (brut.startsWith("{")) {
    try {
      return JSON.parse(brut);
    } catch {
      return null;
    }
  }
  return { t: 0, texte: brut };
}
__name(lireCopieFJ, "lireCopieFJ");
async function texteFinancialJuice(ctx) {
  if (memoireFJ && Date.now() - memoireFJ.lueLe < 2e4) return memoireFJ.texte;
  if (!envGlobal) return null;
  const copie = await lireCopieFJ(envGlobal);
  memoireFJ = { lueLe: Date.now(), texte: copie?.texte ?? null };
  if (!copie || Date.now() - copie.t > 3e5) {
    const verrou = new Request(`${origine}/__cache/fj-tentative`);
    if (!await caches.default.match(verrou)) {
      await caches.default.put(verrou, new Response("1", { headers: { "Cache-Control": "max-age=120" } }));
      const env = envGlobal;
      const tache = rafraichirFinancialJuice(env).then((etat) => console.log(`FinancialJuice (plan B) : ${etat}`));
      if (ctx) ctx.waitUntil(tache);
    }
  }
  return memoireFJ.texte;
}
__name(texteFinancialJuice, "texteFinancialJuice");
async function rafraichirFinancialJuice(env) {
  const actuelle = await lireCopieFJ(env);
  if (actuelle && Date.now() - actuelle.t < 1e5) return "d\xE9j\xE0 \xE0 jour";
  try {
    const r = await fetch(FLUX_FINANCIALJUICE.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)", Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!r.ok) return `refus ${r.status}`;
    const texte = await r.text();
    if (!/<item>/i.test(texte)) return "flux vide";
    await env.ANNONCES.put(CLE_KV_FJ, JSON.stringify({ t: Date.now(), texte }));
    memoireFJ = { lueLe: Date.now(), texte };
    return "mis \xE0 jour";
  } catch (e) {
    return `erreur ${e instanceof Error ? e.message : ""}`;
  }
}
__name(rafraichirFinancialJuice, "rafraichirFinancialJuice");
async function lireFlux(flux) {
  if (flux.source === "FinancialJuice") {
    const texte2 = await texteFinancialJuice(contexteRequete);
    return texte2 ? parser(texte2, flux) : [];
  }
  const texte = await recupererTexte(flux.url, 90);
  return texte ? parser(texte, flux) : [];
}
__name(lireFlux, "lireFlux");
var PAYS_CALENDRIER = "US,EU,DE,FR,GB,JP,CN,CA,AU,CH,IT,ES,NZ";
async function calendrier() {
  const jour = 864e5;
  const debut = new Date(Math.floor(Date.now() / jour) * jour - jour).toISOString();
  const fin = new Date(Math.floor(Date.now() / jour) * jour + 7 * jour).toISOString();
  const url = `https://economic-calendar.tradingview.com/events?from=${debut}&to=${fin}&countries=${PAYS_CALENDRIER}`;
  let texte = null;
  try {
    const r = await fetch(url, { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0 (compatible; ParnassaTrading/1.0)" }, signal: AbortSignal.timeout(8e3) });
    if (r.ok) texte = await r.text();
  } catch {
    texte = null;
  }
  if (!texte) return [];
  try {
    const brut = JSON.parse(texte).result ?? [];
    return brut.map((e) => ({
      id: String(e.id),
      titre: String(e.title ?? ""),
      pays: String(e.country ?? ""),
      devise: String(e.currency ?? ""),
      periode: String(e.period ?? ""),
      date: Date.parse(String(e.date)),
      importance: Number(e.importance ?? -1),
      actuel: typeof e.actual === "number" ? e.actual : null,
      prevision: typeof e.forecast === "number" ? e.forecast : null,
      precedent: typeof e.previous === "number" ? e.previous : null,
      unite: String(e.unit ?? ""),
      echelle: String(e.scale ?? "")
    })).filter((e) => Number.isFinite(e.date) && e.titre).sort((a, b) => a.date - b.date);
  } catch {
    return [];
  }
}
__name(calendrier, "calendrier");
var INVERSES = /unemployment|jobless|claims|chômage|layoff|bankrupt|insolvenc|deficit/i;
async function surprises() {
  const jour = 864e5;
  const debut = new Date(Date.now() - 30 * jour).toISOString();
  const fin = (/* @__PURE__ */ new Date()).toISOString();
  let brut = [];
  try {
    const r = await fetch(`https://economic-calendar.tradingview.com/events?from=${debut}&to=${fin}&countries=${PAYS_CALENDRIER}`, {
      headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0 (compatible; ParnassaTrading/1.0)" },
      signal: AbortSignal.timeout(1e4)
    });
    if (r.ok) brut = (await r.json()).result ?? [];
  } catch {
    brut = [];
  }
  const parPays = /* @__PURE__ */ new Map();
  for (const e of brut) {
    const actuel = typeof e.actual === "number" ? e.actual : null;
    const prevision = typeof e.forecast === "number" ? e.forecast : null;
    const importance = Number(e.importance ?? -1);
    if (actuel === null || prevision === null || importance < 0) continue;
    const titre = String(e.title ?? "");
    const pays = String(e.country ?? "");
    const brutSigne = Math.sign(actuel - prevision);
    const signe = INVERSES.test(titre) ? -brutSigne : brutSigne;
    const poids = importance >= 1 ? 2 : 1;
    const entree = parPays.get(pays) ?? { pays, devise: String(e.currency ?? ""), indice: 0, publies: 0, meilleurs: 0, moins_bons: 0, conformes: 0, marquants: [], somme: 0, poids: 0 };
    entree.publies += 1;
    entree.somme += signe * poids;
    entree.poids += poids;
    if (signe > 0) entree.meilleurs += 1;
    else if (signe < 0) entree.moins_bons += 1;
    else entree.conformes += 1;
    if (signe !== 0 && importance >= 1) {
      entree.marquants.push({
        titre,
        titreFr: titre,
        date: Date.parse(String(e.date)),
        actuel,
        prevision,
        unite: String(e.unit ?? ""),
        echelle: String(e.scale ?? ""),
        signe,
        importance
      });
    }
    parPays.set(pays, entree);
  }
  const liste = [...parPays.values()].filter((p) => p.publies >= 3).map(({ somme, poids, ...p }) => ({
    ...p,
    indice: poids ? Math.round(somme / poids * 100) : 0,
    marquants: p.marquants.sort((a, b) => b.date - a.date).slice(0, 5)
  })).sort((a, b) => b.indice - a.indice);
  const titres = [...new Set(liste.flatMap((p) => p.marquants.map((m) => m.titre)))];
  const fr = await traduire(titres, "en", "fr");
  const carte = new Map(titres.map((t, i) => [t, fr[i]]));
  for (const p of liste) for (const m of p.marquants) m.titreFr = carte.get(m.titre) ?? m.titre;
  return liste;
}
__name(surprises, "surprises");
var BANQUES = {
  US: { nom: "Federal Reserve", nomFr: "R\xE9serve f\xE9d\xE9rale (Fed)" },
  EU: { nom: "European Central Bank", nomFr: "Banque centrale europ\xE9enne (BCE)" },
  GB: { nom: "Bank of England", nomFr: "Banque d'Angleterre (BoE)" },
  JP: { nom: "Bank of Japan", nomFr: "Banque du Japon (BoJ)" },
  CH: { nom: "Swiss National Bank", nomFr: "Banque nationale suisse (BNS)" },
  CA: { nom: "Bank of Canada", nomFr: "Banque du Canada (BoC)" },
  AU: { nom: "Reserve Bank of Australia", nomFr: "Banque de r\xE9serve d'Australie (RBA)" },
  NZ: { nom: "Reserve Bank of New Zealand", nomFr: "Banque de r\xE9serve de Nouvelle-Z\xE9lande (RBNZ)" },
  CN: { nom: "People's Bank of China (1-year LPR)", nomFr: "Banque populaire de Chine (LPR 1 an)" }
};
async function evenementsBruts(debut, fin, pays) {
  try {
    const r = await fetch(
      `https://economic-calendar.tradingview.com/events?from=${new Date(debut).toISOString()}&to=${new Date(fin).toISOString()}&countries=${pays}`,
      { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0 (compatible; ParnassaTrading/1.0)" }, signal: AbortSignal.timeout(1e4) }
    );
    return r.ok ? (await r.json()).result ?? [] : [];
  } catch {
    return [];
  }
}
__name(evenementsBruts, "evenementsBruts");
var EST_DECISION = /* @__PURE__ */ __name((titre) => /(interest rate decision|loan prime rate 1y)/i.test(titre) && !/minutes/i.test(titre), "EST_DECISION");
async function banquesCentrales() {
  const jour = 864e5;
  const maintenant = Date.now();
  const pays = Object.keys(BANQUES).join(",");
  const tranches = await Promise.all([
    evenementsBruts(maintenant - 100 * jour, maintenant - 50 * jour, pays),
    evenementsBruts(maintenant - 50 * jour, maintenant, pays),
    evenementsBruts(maintenant, maintenant + 120 * jour, pays)
  ]);
  const decisions = tranches.flat().filter((e) => EST_DECISION(String(e.title ?? ""))).map((e) => ({
    pays: String(e.country),
    devise: String(e.currency ?? ""),
    date: Date.parse(String(e.date)),
    actuel: typeof e.actual === "number" ? e.actual : null,
    prevision: typeof e.forecast === "number" ? e.forecast : null,
    precedent: typeof e.previous === "number" ? e.previous : null
  })).sort((a, b) => a.date - b.date);
  return Object.entries(BANQUES).map(([code, b]) => {
    const liste = decisions.filter((d) => d.pays === code);
    const passees = liste.filter((d) => d.actuel !== null && d.date <= maintenant);
    const derniere = passees[passees.length - 1] ?? null;
    const prochaine = liste.find((d) => d.date > maintenant) ?? null;
    return {
      pays: code,
      devise: liste[0]?.devise ?? "",
      nom: b.nom,
      nomFr: b.nomFr,
      taux: derniere?.actuel ?? prochaine?.precedent ?? null,
      derniere: derniere ? {
        date: derniere.date,
        actuel: derniere.actuel,
        precedent: derniere.precedent,
        variation: derniere.precedent !== null ? Math.round((derniere.actuel - derniere.precedent) * 100) / 100 : null
      } : null,
      prochaine: prochaine ? { date: prochaine.date, prevision: prochaine.prevision } : null
    };
  });
}
__name(banquesCentrales, "banquesCentrales");
function nombreDollars(v) {
  if (typeof v !== "string" || !v.trim() || v === "N/A") return null;
  const n = Number(v.replace(/[$,()]/g, ""));
  return Number.isFinite(n) ? v.includes("(") ? -n : n : null;
}
__name(nombreDollars, "nombreDollars");
async function resultatsDuJour(date) {
  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
      signal: AbortSignal.timeout(8e3)
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data?.rows ?? []).map((l) => ({
      date,
      symbole: l.symbol,
      nom: l.name,
      moment: l.time === "time-pre-market" ? "avant-ouverture" : l.time === "time-after-hours" ? "apres-cloture" : "inconnu",
      capitalisation: nombreDollars(l.marketCap),
      bpaPrevu: l.epsForecast || null,
      bpaReel: l.eps || null,
      surprisePct: l.surprise && l.surprise !== "N/A" ? Number(l.surprise) : null,
      bpaAnDernier: l.lastYearEPS || null,
      trimestre: l.fiscalQuarterEnding ?? ""
    }));
  } catch {
    return [];
  }
}
__name(resultatsDuJour, "resultatsDuJour");
async function resultats() {
  const jour = 864e5;
  const dates = [];
  for (let i = -1; i <= 7; i++) {
    const d = new Date(Date.now() + i * jour);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    dates.push(d.toISOString().slice(0, 10));
  }
  const parJour = await Promise.all(dates.map(resultatsDuJour));
  return parJour.flatMap((l) => l.sort((a, b) => (b.capitalisation ?? 0) - (a.capitalisation ?? 0)).slice(0, 40));
}
__name(resultats, "resultats");
async function calendrierBilingue() {
  const evenements = await calendrier();
  const titres = [...new Set(evenements.map((e) => e.titre))];
  const fr = await traduire(titres, "en", "fr");
  const carte = new Map(titres.map((t, i) => [t, fr[i]]));
  return evenements.map((e) => ({ ...e, titreFr: carte.get(e.titre) ?? e.titre }));
}
__name(calendrierBilingue, "calendrierBilingue");
async function agreger(fluxs, limite) {
  const listes = await Promise.all(fluxs.map(lireFlux));
  const vus = /* @__PURE__ */ new Set();
  const toutes = listes.flat().filter((d) => d.date <= Date.now() + 36e5).sort((a, b) => b.date - a.date).filter((d) => {
    const cle = normaliserTitre(d.titre).slice(0, 80);
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
  return toutes.slice(0, limite);
}
__name(agreger, "agreger");
function json(donnees, maxAge) {
  return new Response(JSON.stringify(donnees), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
__name(json, "json");
var actualites_default = {
  async scheduled(evenement, env, ctx) {
    envGlobal = env;
    ctx.waitUntil(
      (async () => {
        const etat = await rafraichirFinancialJuice(env);
        console.log(`FinancialJuice : ${etat}`);
        const bilan = await tourneePush(env, evenement.scheduledTime);
        console.log(`Push : ${bilan}`);
        await Promise.all([sauverSecours(), sauverDictionnaires()]);
      })()
    );
  },
  async fetch(requete, env, ctx) {
    envGlobal = env;
    contexteRequete = ctx;
    if (requete.method === "OPTIONS") return json(null, 86400);
    const url = new URL(requete.url);
    origine = url.origin;
    if (url.pathname.startsWith("/__cache/")) return json({ erreur: "Route inconnue." }, 0);
    if (url.pathname.startsWith("/push/")) return routePush(requete, url, env);
    const cache = caches.default;
    const cleCache = new Request(url.toString(), { method: "GET" });
    const enCache = await cache.match(cleCache);
    if (enCache) return enCache;
    let reponse;
    if (url.pathname === "/flux") {
      const depeches = await bilingue(await agreger(FLUX, 500));
      reponse = json({ gener\u00E9Le: Date.now(), depeches }, 30);
    } else if (url.pathname === "/annonces") {
      const depeches = await bilingue(await agreger([FLUX_FINANCIALJUICE], 200));
      reponse = json({ gener\u00E9Le: Date.now(), depeches }, 20);
    } else if (url.pathname === "/banques-centrales") {
      reponse = json({ gener\u00E9Le: Date.now(), banques: await banquesCentrales() }, 3600);
    } else if (url.pathname === "/resultats") {
      reponse = json({ gener\u00E9Le: Date.now(), resultats: await resultats() }, 1800);
    } else if (url.pathname === "/surprises") {
      reponse = json({ gener\u00E9Le: Date.now(), jours: 30, pays: await surprises() }, 1800);
    } else if (url.pathname === "/calendrier") {
      reponse = json({ gener\u00E9Le: Date.now(), evenements: await calendrierBilingue() }, 60);
    } else if (url.pathname === "/recherche") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
      const ticker = (url.searchParams.get("ticker") ?? "").trim().slice(0, 20);
      if (!q && !ticker) return json({ erreur: "Param\xE8tre q ou ticker requis." }, 0);
      const fluxs = [];
      if (q) {
        fluxs.push({ url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=fr&cc=FR`, source: "Bing Actualit\xE9s", categorie: "marches", langue: "fr" });
        fluxs.push({ url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en&cc=US`, source: "Bing News", categorie: "marches", langue: "en" });
      }
      if (ticker && /^[A-Z0-9.^=-]+$/i.test(ticker)) {
        fluxs.push({ url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`, source: "Yahoo Finance", categorie: "marches", langue: "en" });
      }
      const depeches = await bilingue(await agreger(fluxs, 80));
      reponse = json({ gener\u00E9Le: Date.now(), depeches }, 120);
    } else if (url.pathname === "/" || url.pathname === "/sante") {
      reponse = json({ service: "parnassa-actualites", flux: FLUX.length, routes: ["/flux", "/annonces", "/calendrier", "/surprises", "/banques-centrales", "/resultats", "/recherche?q=\u2026&ticker=\u2026"] }, 0);
    } else {
      return json({ erreur: "Route inconnue." }, 0);
    }
    ctx.waitUntil(Promise.all([cache.put(cleCache, reponse.clone()), sauverSecours(), sauverDictionnaires()]));
    return reponse;
  }
};
var URL_APP = "https://akhimysah.github.io/parnassa-trading/";
var SERVICES_PUSH = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i;
async function cleAbonnement(endpoint) {
  const empreinte = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return `abo:${[...new Uint8Array(empreinte)].slice(0, 12).map((o) => o.toString(16).padStart(2, "0")).join("")}`;
}
__name(cleAbonnement, "cleAbonnement");
function nettoyerPreferences(p) {
  return {
    langue: p?.langue === "en" ? "en" : "fr",
    annonces: p?.annonces === "toutes" || p?.annonces === "aucune" ? p.annonces : "importantes",
    motsCles: (p?.motsCles ?? []).filter((m) => typeof m === "string").slice(0, 30).map((m) => m.slice(0, 40)),
    rappels: {
      ids: (p?.rappels?.ids ?? []).filter((x) => typeof x === "string").slice(0, 100),
      delaiMinutes: Math.min(60, Math.max(1, Number(p?.rappels?.delaiMinutes) || 5)),
      fortImpactAuto: Boolean(p?.rappels?.fortImpactAuto)
    },
    alertes: (p?.alertes ?? []).filter((a) => a && typeof a.id === "string" && /^BINANCE:[A-Z0-9]{2,20}$/.test(a.symbole) && Number.isFinite(a.seuil)).slice(0, 50).map((a) => ({ id: a.id, symbole: a.symbole, condition: a.condition === "en-dessous" ? "en-dessous" : "au-dessus", seuil: Number(a.seuil), note: a.note?.slice(0, 80) }))
  };
}
__name(nettoyerPreferences, "nettoyerPreferences");
function vapid(env) {
  return { publique: env.VAPID_PUBLIQUE, privee: JSON.parse(env.VAPID_PRIVEE), contact: URL_APP };
}
__name(vapid, "vapid");
async function routePush(requete, url, env) {
  if (url.pathname === "/push/cle") return json({ cle: env.VAPID_PUBLIQUE }, 3600);
  if (requete.method !== "POST") return json({ erreur: "M\xE9thode non autoris\xE9e." }, 0);
  let corps;
  try {
    corps = await requete.json();
  } catch {
    return json({ erreur: "Corps JSON invalide." }, 0);
  }
  const endpoint = corps.abonnement?.endpoint ?? corps.endpoint ?? "";
  if (!SERVICES_PUSH.test(endpoint)) return json({ erreur: "Service de push non reconnu." }, 0);
  const cle = await cleAbonnement(endpoint);
  if (url.pathname === "/push/abonnement") {
    const a = corps.abonnement;
    if (!a?.keys?.p256dh || !a.keys.auth) return json({ erreur: "Abonnement incomplet." }, 0);
    const existant = await env.ANNONCES.get(cle, "json");
    const enregistrement = {
      abonnement: { endpoint: a.endpoint, keys: { p256dh: a.keys.p256dh, auth: a.keys.auth } },
      preferences: nettoyerPreferences(corps.preferences),
      envoyes: existant?.envoyes ?? [],
      majLe: Date.now()
    };
    await env.ANNONCES.put(cle, JSON.stringify(enregistrement), { expirationTtl: 60 * 86400 });
    return json({ ok: true }, 0);
  }
  if (url.pathname === "/push/desabonnement") {
    await env.ANNONCES.delete(cle);
    return json({ ok: true }, 0);
  }
  if (url.pathname === "/push/test") {
    const e = await env.ANNONCES.get(cle, "json");
    if (!e) return json({ erreur: "Abonnement inconnu." }, 0);
    const fr = e.preferences.langue === "fr";
    const r = await envoyerPush(
      e.abonnement,
      { titre: "Parnassa Trading", corps: fr ? "Les notifications push fonctionnent, m\xEAme application ferm\xE9e." : "Push notifications work, even with the app closed.", url: URL_APP, tag: "test" },
      vapid(env)
    );
    return json({ resultat: r }, 0);
  }
  return json({ erreur: "Route inconnue." }, 0);
}
__name(routePush, "routePush");
function titreLangue(d, langue) {
  if (d.donnee) {
    const indic = langue === "fr" ? d.donnee.indicateurFr ?? d.donnee.indicateur : d.donnee.indicateur;
    return `${indic} : ${langue === "fr" ? "r\xE9el" : "actual"} ${d.donnee.actuel} (${langue === "fr" ? "pr\xE9v." : "fcst"} ${d.donnee.prevision ?? "\u2013"}, ${langue === "fr" ? "pr\xE9c." : "prev."} ${d.donnee.precedent ?? "\u2013"})`;
  }
  return langue === "fr" ? d.titreFr ?? d.titre : d.titreEn ?? d.titre;
}
__name(titreLangue, "titreLangue");
function motCleTrouve(texte, motsCles) {
  const sans = /* @__PURE__ */ __name((t2) => t2.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), "sans");
  const t = sans(texte);
  for (const m of motsCles) {
    const mot = sans(m.trim());
    if (!mot) continue;
    const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${echappe}([^a-z0-9]|$)`).test(t)) return m;
  }
  return null;
}
__name(motCleTrouve, "motCleTrouve");
function valeurTexte(v, unite, echelle) {
  if (v === null) return "\u2013";
  return `${v}${echelle ? ` ${echelle}` : ""}${unite === "%" ? " %" : unite ? ` ${unite}` : ""}`;
}
__name(valeurTexte, "valeurTexte");
async function tourneePush(env, heurePlanifiee) {
  const liste = await env.ANNONCES.list({ prefix: "abo:" });
  if (liste.keys.length === 0) return "aucun abonn\xE9";
  const enregistrements = (await Promise.all(liste.keys.slice(0, 15).map(async (k) => ({ cle: k.name, e: await env.ANNONCES.get(k.name, "json") })))).filter((x) => x.e !== null);
  const fin = heurePlanifiee;
  const debut = fin - 12e4;
  const texteFJ = (await lireCopieFJ(env))?.texte ?? null;
  const nouvelles = texteFJ ? parser(texteFJ, FLUX_FINANCIALJUICE).filter((d) => d.date >= debut && d.date < fin) : [];
  const nouvellesBilingues = nouvelles.length ? await bilingue(nouvelles) : [];
  const besoinCalendrier = enregistrements.some((x) => x.e.preferences.rappels.ids.length > 0 || x.e.preferences.rappels.fortImpactAuto);
  const evenements = besoinCalendrier ? await calendrierBilingue() : [];
  const paires = [...new Set(enregistrements.flatMap((x) => x.e.preferences.alertes.filter((a) => !x.e.envoyes.includes(`alerte:${a.id}`)).map((a) => a.symbole.split(":")[1])))].slice(0, 10);
  const bougies = /* @__PURE__ */ new Map();
  await Promise.all(
    paires.map(async (p) => {
      try {
        const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${p}&interval=1m&limit=3`, { signal: AbortSignal.timeout(5e3) });
        if (!r.ok) return;
        const k = await r.json();
        if (k.length === 0) return;
        bougies.set(p, {
          ouverture: Number(k[0][1]),
          haut: Math.max(...k.map((x) => Number(x[2]))),
          bas: Math.min(...k.map((x) => Number(x[3]))),
          cloture: Number(k[k.length - 1][4])
        });
      } catch {
      }
    })
  );
  let envois = 0;
  let expires = 0;
  const cles = vapid(env);
  for (const { cle, e } of enregistrements) {
    const p = e.preferences;
    const fr = p.langue === "fr";
    const messages = [];
    let modifie = false;
    const retenues = nouvellesBilingues.filter((d) => {
      const titre = `${d.titreFr ?? ""} ${d.titreEn ?? ""} ${d.titre}`;
      return p.annonces === "toutes" || p.annonces === "importantes" && d.important || motCleTrouve(titre, p.motsCles) !== null;
    });
    if (retenues.length > 3) {
      messages.push({
        titre: `FinancialJuice \xB7 ${retenues.length} ${fr ? "nouvelles annonces" : "new headlines"}`,
        corps: retenues.slice(0, 3).map((d) => `\u2022 ${titreLangue(d, p.langue)}`).join("\n"),
        url: `${URL_APP}#actualites`,
        tag: `fj-lot-${fin}`
      });
    } else {
      for (const d of retenues) {
        const mot = motCleTrouve(`${d.titreFr ?? ""} ${d.titreEn ?? ""} ${d.titre}`, p.motsCles);
        messages.push({
          titre: mot ? `\u{1F4F0} ${mot} \xB7 FinancialJuice` : d.important ? `\u2605 FinancialJuice` : "FinancialJuice",
          corps: titreLangue(d, p.langue),
          url: `${URL_APP}#actualites`,
          tag: `fj-${d.id}`
        });
      }
    }
    const suivis = new Set(p.rappels.ids);
    for (const ev of evenements) {
      const concerne = suivis.has(ev.id) || p.rappels.fortImpactAuto && ev.importance >= 1;
      if (!concerne) continue;
      const nom = fr ? ev.titreFr ?? ev.titre : ev.titre;
      const moment = ev.date - p.rappels.delaiMinutes * 6e4;
      if (moment >= debut && moment < fin) {
        messages.push({
          titre: `\u23F0 ${fr ? "Dans" : "In"} ${p.rappels.delaiMinutes} min \xB7 ${ev.pays}`,
          corps: `${nom} \u2014 ${fr ? "pr\xE9vision" : "forecast"} ${valeurTexte(ev.prevision, ev.unite, ev.echelle)}, ${fr ? "pr\xE9c\xE9dent" : "previous"} ${valeurTexte(ev.precedent, ev.unite, ev.echelle)}`,
          url: `${URL_APP}#calendrier`,
          tag: `rappel-${ev.id}`
        });
      }
      const clePublie = `publie:${ev.id}`;
      if (ev.actuel !== null && ev.date <= fin && fin - ev.date < 3 * 36e5 && !e.envoyes.includes(clePublie)) {
        const ecart = ev.prevision !== null ? Math.sign(ev.actuel - ev.prevision) : 0;
        messages.push({
          titre: `\u{1F4CA} ${fr ? "Publi\xE9" : "Released"} \xB7 ${ev.pays}`,
          corps: `${nom} \u2014 ${fr ? "r\xE9el" : "actual"} ${valeurTexte(ev.actuel, ev.unite, ev.echelle)}${ecart > 0 ? " \u25B2" : ecart < 0 ? " \u25BC" : ""}, ${fr ? "pr\xE9vision" : "forecast"} ${valeurTexte(ev.prevision, ev.unite, ev.echelle)}`,
          url: `${URL_APP}#calendrier`,
          tag: `publie-${ev.id}`
        });
        e.envoyes.push(clePublie);
        modifie = true;
      }
    }
    for (const a of p.alertes) {
      const cleAlerte = `alerte:${a.id}`;
      if (e.envoyes.includes(cleAlerte)) continue;
      const b = bougies.get(a.symbole.split(":")[1]);
      if (!b) continue;
      const franchie = a.condition === "au-dessus" ? b.ouverture < a.seuil && b.haut >= a.seuil : b.ouverture > a.seuil && b.bas <= a.seuil;
      if (!franchie) continue;
      messages.push({
        titre: `\u{1F514} ${a.symbole.split(":")[1]} ${a.condition === "au-dessus" ? fr ? "au-dessus de" : "above" : fr ? "sous" : "below"} ${a.seuil}`,
        corps: `${fr ? "Dernier prix" : "Last price"} ${b.cloture}${a.note ? ` \u2014 ${a.note}` : ""}`,
        url: `${URL_APP}#alertes`,
        tag: `alerte-${a.id}`
      });
      e.envoyes.push(cleAlerte);
      modifie = true;
    }
    for (const m of messages.slice(0, 6)) {
      if (envois >= 20) break;
      const r = await envoyerPush(e.abonnement, m, cles);
      envois += 1;
      if (r === "expire") {
        await env.ANNONCES.delete(cle);
        expires += 1;
        modifie = false;
        break;
      }
    }
    if (modifie) {
      e.envoyes = e.envoyes.slice(-200);
      await env.ANNONCES.put(cle, JSON.stringify(e), { expirationTtl: 60 * 86400 });
    }
  }
  return `${enregistrements.length} abonn\xE9(s), ${nouvelles.length} annonce(s) dans la fen\xEAtre, ${envois} envoi(s), ${expires} expir\xE9(s)`;
}
__name(tourneePush, "tourneePush");

// ../../modele-whop/node_modules/.pnpm/wrangler@4.124.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../modele-whop/node_modules/.pnpm/wrangler@4.124.0/node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// ../../modele-whop/node_modules/.pnpm/wrangler@4.124.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-y42tPn/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = actualites_default;

// ../../modele-whop/node_modules/.pnpm/wrangler@4.124.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-y42tPn/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=actualites.js.map
