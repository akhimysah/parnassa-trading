# Parnassa Trading

Plateforme de graphiques et d'analyse de marché façon TradingView, construite sur les
**widgets libre-service officiels de TradingView** (gratuits, sans clé d'API, sans serveur de données).

## Lancer

```bash
corepack pnpm install
corepack pnpm dev        # http://localhost:5200
```

## Sections

| Section | Contenu |
| --- | --- |
| Accueil | Tableau de bord : dernières annonces FinancialJuice, prochaines annonces à fort impact (avec rappels) et dernières publications, crypto en direct, portefeuille papier, prochaines réunions des banques centrales, indice de surprise, résultats du jour, sessions de marché |
| Graphique | Graphique avancé (outils de dessin, indicateurs, liste de suivi, détails, hotlists, calendrier) en disposition 1, 2 ou 4 graphiques |
| Marchés | Vue d'ensemble, hotlists US, heatmaps actions / crypto / forex, taux croisés |
| Screener | Screener actions (US, France, Allemagne, UK), crypto et forex |
| Symbole | Infos, mini-graphique, analyse technique, actualités, données financières, profil |
| Actualités | Fil de dépêches en direct façon salle de marché. Chaque dépêche existe en français et en anglais (traduction automatique côté relais) : boutons FR, EN ou FR + EN. Onglet « Annonces » : flux FinancialJuice en direct, chiffres économiques affichés réel / prévision / précédent. Panneau « Annonces économiques » : prochaines publications avec compte à rebours et publications récentes avec valeur réelle. 12 sources agrégées (FinancialJuice, MarketWatch, CNBC, Investing.com, FXStreet, ForexLive, Fed, BCE, CoinDesk, Cointelegraph, ABC Bourse, BFM), filtres par catégorie et langue, dépêches importantes signalées avec bandeau et son, recherche, squawk vocal (lecture à voix haute des nouvelles annonces en français ou en anglais, sur toutes les pages), mots-clés surveillés (alerte sur toutes les pages, onglet « Ma sélection », surlignage), dépêches du symbole courant, calendrier économique |
| Calendrier | Trois vues. Banques centrales : taux directeur actuel de 9 banques (Fed, BCE, BoE, BoJ, BNS, BoC, RBA, RBNZ, PBoC), dernière variation, prochaine réunion avec compte à rebours. Résultats : publications trimestrielles des sociétés américaines (BPA prévu / publié / surprise, source Nasdaq). Horloge des sessions (Sydney, Tokyo, Hong Kong, Francfort, Paris, Londres, New York). Économie : indice de surprise économique par pays sur 30 jours (publications au-dessus / en dessous des prévisions, détail des chiffres marquants). Calendrier économique de la semaine (d'hier à J+6), bilingue : valeurs publiées réel / prévision / précédent avec écart coloré, prochain événement surligné avec compte à rebours, rappels par événement (🔔 : notification N minutes avant puis à la publication du chiffre réel) et rappel automatique des annonces à fort impact, filtres par pays, impact et recherche ; cartes compactes sur téléphone |
| Alertes | Alertes de prix en temps réel sur tous les instruments (or, forex, indices, énergie, actions, crypto), avec son, notification et push application fermée, tableau crypto en direct triable avec variations 24 h / 7 j / 30 j et mini-courbe |
| Trading | Mode challenge façon prop firm (FTMO) : formules Évaluation (+10 %), Vérification (+5 %) et Express (+8 %) de 10 k$ à 200 k$, perte journalière et perte maximale surveillées en direct (échec et fermeture des positions dès qu'une limite est franchie), jours de trading minimum, jauges de progression, historique ; le portefeuille habituel est mis de côté pendant le challenge. Trading papier : portefeuille virtuel de 100 000 USDT sur les instruments les plus suivis, choisis dans un sélecteur avec recherche et catégories : or XAUUSD, argent, platine, cuivre, forex (EURUSD, GBPUSD, USDJPY…), indices (S&P 500, Nasdaq 100, Dow Jones, DAX, CAC 40, FTSE, Nikkei, VIX, DXY), pétrole WTI / Brent, gaz, grandes actions US et françaises, crypto (et toute autre paire Binance en la tapant). Cotations rafraîchies chaque seconde par un hub partagé (`src/flux.ts`) : flux Binance pour la crypto, flux continu Yahoo Finance pour le forex, le dollar index, les indices et les actions, or animé seconde par seconde par le PAX Gold de Binance et recalé en continu sur XAUUSD, scanner public TradingView interrogé chaque seconde pour le reste (argent, platine, cuivre, pétrole et gaz, ces trois derniers différés de 10 min). Les prix clignotent en vert ou en rouge à chaque mouvement. Volume en lots de 0,01 à 500 (1 lot = 100 000 unités en forex, 100 onces d'or, 5 000 onces d'argent, 1 000 barils de pétrole, 1 × l'indice, 100 actions, 1 BTC…), effet de levier réglable de 1:1 à 1:500 (marge = notionnel ÷ levier), P&L converti en USD pour les instruments cotés en EUR / GBP / JPY / CHF / CAD, valeur du pip ou du point, commission CFD 0,005 %, niveau de marge et stop-out à 50 %. Ordres marché / limite / stop long et short, stop-loss et take-profit automatiques, clôture partielle, journal de trading avec notes, dimensionnement par risque, statistiques (taux de réussite, profit factor, par paire), P&L latent et réalisé, courbe de capital, répartition du portefeuille, calendrier des trades (résultat net par jour en vert / rouge, nombre de trades et taux de réussite, totaux par semaine et par mois, détail du jour au clic), historique exportable en CSV |

Bandeau de cotations défilant en haut, thème sombre / clair, comparaison de symboles superposés au graphique,
dispositions nommées sauvegardées, liaison des graphiques en disposition multiple,
gestion de la liste de suivi (ordre, ajout, suppression), lien de partage reprenant la vue courante
(`#page/SYMBOLE/intervalle`), installation comme application (PWA avec service worker : consultation hors ligne, notifications y compris sur Android) et barre de navigation en bas sur téléphone.

Paramètres (engrenage) : fuseau horaire des graphiques, frais simulés, capital de départ, son des alertes, sauvegarde et restauration complètes en JSON.

Raccourcis clavier : une lettre ouvre la recherche de symbole, `/` aussi, `1` à `7` changent l'intervalle, `Échap` ferme.
Les préférences (symbole, intervalle, style, indicateurs, comparaisons, liste de suivi, disposition, thème) sont conservées dans le navigateur.

## Relais d'actualités (Cloudflare Worker)

Le fil d'actualités et le calendrier des annonces (`/flux`, `/annonces`, `/calendrier`, `/recherche`) sont servis par `worker/actualites.ts`, déployé sur Cloudflare Workers à
`https://parnassa-actualites.neobank.workers.dev` : il agrège les flux RSS publics, traduit chaque titre en français et en anglais (dictionnaire en cache 7 jours), et met le tout en cache. FinancialJuice bloquant les appels trop fréquents, seule une tâche planifiée l'interroge toutes les 2 minutes et dépose son flux dans KV (si la tâche ne tourne pas, une visite rafraîchit la copie quand elle a plus de 150 s, au plus une tentative toutes les 2 minutes) et
les renvoie en JSON avec CORS. Déploiement :

```bash
cd worker && npx wrangler deploy -c wrangler.json
```

## Notifications push (application fermée)

Paramètres → « Notifications push » abonne l'appareil (Web Push standard, sans service tiers). Toutes les 2 minutes,
la tâche planifiée du relais envoie à chaque appareil : les annonces FinancialJuice (importantes, toutes, ou seulement
celles qui contiennent un mot-clé surveillé), les rappels d'événements économiques et leur publication, et les alertes
de prix franchies (bougies 1 min Binance pour la crypto, scanner pour les autres instruments, comparé au prix noté à la création de l'alerte). Chiffrement aes128gcm et signature VAPID faits dans `worker/push.ts` ; la clé privée est un
secret Cloudflare (`wrangler secret put VAPID_PRIVEE`), la clé publique est dans `wrangler.json`. Les abonnements sont
stockés dans KV (préfixe `abo:`, expiration 60 jours). Sur iPhone / iPad, le push exige l'application installée sur
l'écran d'accueil (iOS 16.4+).

## Limites des widgets gratuits

- Certains indices ne sont servis que via des CFD (ex. `FOREXCOM:SPXUSD` pour le S&P 500) ; `src/symboles.ts` contient la table de correspondance.
- Le widget ne remonte pas au parent le symbole choisi dans sa propre barre de recherche : utiliser la recherche de l'application pour garder la liste de suivi et la fiche Symbole synchronisées.
- La bibliothèque complète « Charting Library » (données personnalisées, trading intégré) nécessite une demande de licence gratuite auprès de TradingView ; elle n'est pas en libre service.
