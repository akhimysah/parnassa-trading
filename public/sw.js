/* Service worker de Parnassa Trading : application installable, consultation hors ligne, notifications. */
const VERSION = 'parnassa-trading-v1';
const COQUILLE = ['./', './index.html', './manifest.webmanifest', './icone.svg', './icone-192.png', './icone-512.png'];
const RELAIS = 'parnassa-actualites.neobank.workers.dev';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function reseauPuisCache(requete) {
  const cache = await caches.open(VERSION);
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch (erreur) {
    const enCache = await cache.match(requete, { ignoreSearch: requete.mode === 'navigate' });
    if (enCache) return enCache;
    if (requete.mode === 'navigate') {
      const accueil = await cache.match('./index.html');
      if (accueil) return accueil;
    }
    throw erreur;
  }
}

async function cachePuisReseau(requete) {
  const cache = await caches.open(VERSION);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok) cache.put(requete, reponse.clone());
  return reponse;
}

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  // Pages : réseau d'abord (toujours la dernière version), copie locale hors ligne.
  if (requete.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(reseauPuisCache(requete));
    return;
  }
  // Fichiers compilés (noms à empreinte) : immuables, servis depuis le cache.
  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    e.respondWith(cachePuisReseau(requete));
    return;
  }
  // Actualités et calendrier : réseau d'abord, dernière copie si hors ligne.
  if (url.hostname === RELAIS) {
    e.respondWith(reseauPuisCache(requete));
    return;
  }
  // Le reste (widgets, flux Binance…) passe directement au réseau.
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ('focus' in f) {
          if (cible !== './' && 'navigate' in f) f.navigate(cible);
          return f.focus();
        }
      }
      return self.clients.openWindow(cible);
    }),
  );
});
