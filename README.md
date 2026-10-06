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
| Actualités | Fil d'actualités par symbole ou par marché |
| Calendrier | Calendrier économique filtrable par pays et importance |
| Alertes | Alertes de prix en temps réel sur les paires Binance (flux WebSocket public, son + notification), tableau crypto en direct |
| Trading | Trading papier : portefeuille virtuel de 100 000 USDT, ordres marché / limite / stop long et short aux prix Binance en direct, stop-loss et take-profit automatiques, P&L latent et réalisé, courbe de capital, historique |

Bandeau de cotations défilant en haut, thème sombre / clair, comparaison de symboles superposés au graphique,
dispositions nommées sauvegardées, liaison des graphiques en disposition multiple,
gestion de la liste de suivi (ordre, ajout, suppression), lien de partage reprenant la vue courante
(`#page/SYMBOLE/intervalle`), installation comme application (PWA) et barre de navigation en bas sur téléphone.

Raccourcis clavier : une lettre ouvre la recherche de symbole, `/` aussi, `1` à `7` changent l'intervalle, `Échap` ferme.
Les préférences (symbole, intervalle, style, indicateurs, comparaisons, liste de suivi, disposition, thème) sont conservées dans le navigateur.

## Limites des widgets gratuits

- Certains indices ne sont servis que via des CFD (ex. `FOREXCOM:SPXUSD` pour le S&P 500) ; `src/symboles.ts` contient la table de correspondance.
- Le widget ne remonte pas au parent le symbole choisi dans sa propre barre de recherche : utiliser la recherche de l'application pour garder la liste de suivi et la fiche Symbole synchronisées.
- La bibliothèque complète « Charting Library » (données personnalisées, trading intégré) nécessite une demande de licence gratuite auprès de TradingView ; elle n'est pas en libre service.
