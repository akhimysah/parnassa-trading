# Parnassa Trading

Plateforme de graphiques et d'analyse de marché façon TradingView, construite sur les
**widgets libre-service officiels de TradingView** (gratuits, sans clé d'API, sans serveur de données).

## Lancer

```bash
corepack pnpm install
corepack pnpm dev        # http://localhost:5200
```

## Sections

| Section | Widgets TradingView utilisés |
| --- | --- |
| Graphique | Graphique avancé (outils de dessin, indicateurs, liste de suivi, détails, hotlists, calendrier) en disposition 1, 2 ou 4 graphiques |
| Marchés | Vue d'ensemble, hotlists US, heatmaps actions / crypto / forex, taux croisés |
| Screener | Screener actions (US, France, Allemagne, UK), crypto et forex |
| Symbole | Infos, mini-graphique, analyse technique, actualités, données financières, profil |
| Actualités | Fil de dépêches en direct façon salle de marché : 11 sources agrégées (MarketWatch, CNBC, Investing.com, FXStreet, ForexLive, Fed, BCE, CoinDesk, Cointelegraph, ABC Bourse, BFM), filtres par catégorie et langue, dépêches importantes signalées avec bandeau et son, recherche, dépêches du symbole courant, calendrier économique |
| Calendrier | Calendrier économique filtrable par pays et importance |
| Alertes | Alertes de prix en temps réel sur les paires Binance (flux WebSocket public, son + notification), tableau crypto en direct avec variation 7 j et mini-courbe 30 j |
| Trading | Trading papier : portefeuille virtuel de 100 000 USDT, ordres marché / limite / stop long et short aux prix Binance en direct, stop-loss et take-profit automatiques, clôture partielle, journal de trading avec notes, dimensionnement par risque, statistiques (taux de réussite, profit factor, par paire), P&L latent et réalisé, courbe de capital, historique exportable en CSV |

Bandeau de cotations défilant en haut, thème sombre / clair, comparaison de symboles superposés au graphique,
dispositions nommées sauvegardées, liaison des graphiques en disposition multiple,
gestion de la liste de suivi (ordre, ajout, suppression), lien de partage reprenant la vue courante
(`#page/SYMBOLE/intervalle`), installation comme application (PWA) et barre de navigation en bas sur téléphone.

Paramètres (engrenage) : fuseau horaire des graphiques, frais simulés, capital de départ, son des alertes, sauvegarde et restauration complètes en JSON.

Raccourcis clavier : une lettre ouvre la recherche de symbole, `/` aussi, `1` à `7` changent l'intervalle, `Échap` ferme.
Les préférences (symbole, intervalle, style, indicateurs, comparaisons, liste de suivi, disposition, thème) sont conservées dans le navigateur.

## Relais d'actualités (Cloudflare Worker)

Le fil d'actualités est servi par `worker/actualites.ts`, déployé sur Cloudflare Workers à
`https://parnassa-actualites.neobank.workers.dev` : il agrège les flux RSS publics, les met en cache 60 s et
les renvoie en JSON avec CORS. Déploiement :

```bash
cd worker && npx wrangler deploy -c wrangler.json
```

## Limites des widgets gratuits

- Certains indices ne sont servis que via des CFD (ex. `FOREXCOM:SPXUSD` pour le S&P 500) ; `src/symboles.ts` contient la table de correspondance.
- Le widget ne remonte pas au parent le symbole choisi dans sa propre barre de recherche : utiliser la recherche de l'application pour garder la liste de suivi et la fiche Symbole synchronisées.
- La bibliothèque complète « Charting Library » (données personnalisées, trading intégré) nécessite une demande de licence gratuite auprès de TradingView ; elle n'est pas en libre service.
