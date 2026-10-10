import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { DispositionSauvee, Etat } from './types';
import { chargerEtat, sauverEtat } from './stockage';
import { BarreHaut, INTERVALLES } from './composants/BarreHaut';
import { RailGauche } from './composants/RailGauche';
import { RechercheSymbole } from './composants/RechercheSymbole';
import { GestionListeSuivi } from './composants/GestionListeSuivi';
import { Parametres } from './composants/Parametres';
import { Aide } from './composants/Aide';
import { WidgetTradingView } from './composants/WidgetTradingView';
import { Graphique } from './pages/Graphique';
// Pages chargées à la demande (l'accueil et le graphique sont dans le premier chargement), puis préchargées en
// arrière-plan une fois l'application affichée : navigation instantanée et application complète hors ligne.
const chargerPages = {
  marches: () => import('./pages/Marches'),
  screener: () => import('./pages/Screener'),
  symbole: () => import('./pages/Symbole'),
  actualites: () => import('./pages/Actualites'),
  calendrier: () => import('./pages/Calendrier'),
  alertes: () => import('./pages/Alertes'),
  trading: () => import('./pages/Trading'),
};
const Marches = lazy(() => chargerPages.marches().then((m) => ({ default: m.Marches })));
const Screener = lazy(() => chargerPages.screener().then((m) => ({ default: m.Screener })));
const Symbole = lazy(() => chargerPages.symbole().then((m) => ({ default: m.Symbole })));
const Actualites = lazy(() => chargerPages.actualites().then((m) => ({ default: m.Actualites })));
const Calendrier = lazy(() => chargerPages.calendrier().then((m) => ({ default: m.Calendrier })));
const Alertes = lazy(() => chargerPages.alertes().then((m) => ({ default: m.Alertes })));
const Trading = lazy(() => chargerPages.trading().then((m) => ({ default: m.Trading })));
import { Accueil } from './pages/Accueil';
import { notifier, sonner, useMoteurAlertes } from './alertes';
import { useFluxBinance } from './binance';
import { motsClesTrouves, texteRecherche, titrePrincipal, useFilActualites } from './actualites';
import { annoncer, couperSquawk, doitEtreLue, langueParlee, texteParle } from './squawk';
import { useMoteurRappels } from './rappels';
import { useSynchroPush } from './push';
import { useSynchro } from './synchro';
import { useCompteTrading } from './comptes';
import { evaluerDiscipline } from './discipline';
import { estCrypto, estWeekendMarche, regleWeekendActive } from './weekend';
import { symbolesConversion, useCotationsScanner } from './instruments';
import { estBinance, paireBinance } from './binance';
import { appliquerFlux, cloturer, enregistrerCapital, MESSAGE_CRAME, valeurPortefeuille } from './trading';
import { evaluerChallenge } from './challenge';
import { nomSymbole } from './symboles';
import { symboleDepuisUrl } from './site';
import { ecrireHash, lienPartage, lireHash } from './url';

const TICKER = [
  { proName: 'BINANCE:BTCUSDT', title: 'Bitcoin' },
  { proName: 'BINANCE:ETHUSDT', title: 'Ethereum' },
  { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
  { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq 100' },
  { proName: 'INDEX:CAC40', title: 'CAC 40' },
  { proName: 'INDEX:DEU40', title: 'DAX' },
  { proName: 'FX:EURUSD', title: 'EUR / USD' },
  { proName: 'TVC:GOLD', title: 'Or' },
  { proName: 'TVC:USOIL', title: 'Pétrole WTI' },
  { proName: 'NASDAQ:AAPL', title: 'Apple' },
  { proName: 'NASDAQ:NVDA', title: 'NVIDIA' },
  { proName: 'EURONEXT:MC', title: 'LVMH' },
];

type Recherche = { ouvert: boolean; saisie?: string; mode: 'symbole' | 'comparer' };

export function App() {
  const [etat, setEtat] = useState<Etat>(() => {
    const charge = { ...chargerEtat(), ...lireHash() };
    const recu = symboleDepuisUrl();
    if (!recu) return charge;
    const emplacements = [...charge.emplacements];
    emplacements[0] = recu;
    return { ...charge, page: 'graphique', symbole: recu, emplacements };
  });
  const [recherche, setRecherche] = useState<Recherche>({ ouvert: false, mode: 'symbole' });
  const [gestionSuivi, setGestionSuivi] = useState(false);
  const [parametresOuverts, setParametresOuverts] = useState(false);
  const [aideOuverte, setAideOuverte] = useState(false);
  const [emplacementActif, setEmplacementActif] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const maj = useCallback((p: Partial<Etat>) => setEtat((e) => ({ ...e, ...p })), []);

  // Préchargement des autres pages quand le navigateur est libre (et mise en cache hors ligne par le service worker).
  useEffect(() => {
    const precharger = () => Object.values(chargerPages).forEach((f) => void f().catch(() => undefined));
    const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const t = ric ? ric(precharger, { timeout: 5000 }) : window.setTimeout(precharger, 2500);
    return () => {
      if (!ric) window.clearTimeout(t);
    };
  }, []);

  // Moteur d'alertes : actif sur toutes les pages tant que l'application est ouverte.
  const majAlertes = useCallback(
    (f: (a: Etat['alertes']) => Etat['alertes']) => setEtat((e) => ({ ...e, alertes: f(e.alertes) })),
    [],
  );
  const pairesSuivies = [
    ...etat.listeSuivi.filter(estBinance).map(paireBinance),
    // Seules les paires Binance vont au flux Binance (un symbole inconnu y couperait tout le flux).
    ...etat.portefeuille.positions.filter((pos) => estBinance(pos.symbole)).map((pos) => paireBinance(pos.symbole)),
    ...etat.portefeuille.ordres.filter((o) => estBinance(o.symbole)).map((o) => paireBinance(o.symbole)),
    ...(etat.page === 'trading' || etat.page === 'alertes' ? ['BTCUSDT', 'ETHUSDT'] : []),
  ];
  const alertesActives = etat.alertes.filter((a) => !a.declencheeLe);
  const ticksBinance = useFluxBinance([...pairesSuivies, ...alertesActives.filter((a) => estBinance(a.symbole)).map((a) => paireBinance(a.symbole))]);
  // Or, forex, indices, énergie, actions : cotations du scanner pour les positions, ordres et la page Trading.
  const symbolesOuverts = [
    ...etat.portefeuille.positions.map((pos) => pos.symbole),
    ...etat.portefeuille.ordres.map((o) => o.symbole),
    ...alertesActives.map((a) => a.symbole),
  ];
  // Les taux de change servent à convertir en USD le P&L des instruments cotés en EUR, GBP, JPY…
  const ticksScanner = useCotationsScanner([...symbolesOuverts, ...symbolesConversion(symbolesOuverts)]);
  const ticks = useMemo(() => ({ ...ticksBinance, ...ticksScanner }), [ticksBinance, ticksScanner]);
  // Alertes de prix sur tous les instruments, vérifiées sur la table de prix commune.
  useMoteurAlertes(etat.alertes, ticks, majAlertes, setToast, etat.parametres.son);

  // Fil d'actualités : chargé sur la page Actualités, ou partout si des mots-clés sont surveillés.
  const motsCles = etat.parametres.motsCles;
  const squawk = etat.parametres.squawk;
  const fil = useFilActualites(
    etat.page === 'actualites' || squawk.actif ? 20000 : 60000,
    etat.page === 'actualites' || etat.page === 'accueil' || motsCles.length > 0 || squawk.actif,
  );

  // Squawk : lecture à voix haute des nouvelles dépêches retenues, sur toutes les pages.
  useEffect(() => {
    if (!squawk.actif || fil.nouvelles.length === 0) return;
    const langue = langueParlee(etat.parametres.langueActualites);
    const aLire = fil.nouvelles
      .filter((d) => doitEtreLue(d, etat.parametres))
      .sort((a, b) => a.date - b.date)
      .map((d) => texteParle(d, langue));
    annoncer(aLire, langue, squawk.vitesse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fil.nouvelles]);
  useEffect(() => {
    if (!squawk.actif) couperSquawk();
  }, [squawk.actif]);
  useEffect(() => {
    if (motsCles.length === 0 || fil.nouvelles.length === 0) return;
    const touchees = fil.nouvelles.filter((d) => motsClesTrouves(texteRecherche(d), motsCles).length > 0);
    if (touchees.length === 0) return;
    const premiere = touchees[0];
    const mots = motsClesTrouves(texteRecherche(premiere), motsCles).join(', ');
    const titre = titrePrincipal(premiere, etat.parametres.langueActualites);
    setToast(`📰 ${mots} : ${titre}${touchees.length > 1 ? ` (+${touchees.length - 1})` : ''}`);
    notifier(`Actualité : ${mots}`, `${titre} — ${premiere.source}`, undefined, `fj-${premiere.id}`);
    if (etat.parametres.son) sonner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fil.nouvelles]);

  // Rappels d'événements économiques (avant publication, puis chiffre réel), sur toutes les pages.
  useMoteurRappels(etat, maj, setToast);
  useSynchroPush(etat);
  // Compte Parnassa : sauvegarde en ligne et synchronisation entre appareils.
  const synchro = useSynchro(etat, setEtat, setToast);
  // Comptes de trading à accès (numéro, mot de passe, serveur) : le portefeuille affiché est celui du compte connecté.
  const compteTrading = useCompteTrading(etat, setEtat, setToast);
  const lectureSeule = useRef(false);
  lectureSeule.current = Boolean(compteTrading.session?.lecture);

  // Moteur de trading papier : ordres en attente, stop-loss / take-profit, courbe de capital.
  useEffect(() => {
    // Accès investisseur : le moteur tourne sur l'appareil du titulaire, ici on ne fait que regarder.
    if (Object.keys(ticks).length === 0 || lectureSeule.current) return;
    setEtat((e) => {
      const resultat = appliquerFlux(e.portefeuille, ticks, e.parametres.frais);
      let portefeuille = resultat.portefeuille;
      const messages = [...resultat.messages];
      if (portefeuille.crameLe && !e.portefeuille.crameLe) notifier('Compte cramé 🔥', MESSAGE_CRAME, undefined, `crame-${portefeuille.crameLe}`);
      const compte = valeurPortefeuille(portefeuille, ticks);
      let capital = compte.capital;

      // Mode challenge : règles de perte journalière, perte maximale et objectif.
      let challenge = e.challenge;
      const toutesCotees = portefeuille.positions.every((pos) => ticks[paireBinance(pos.symbole)]);
      if (challenge && challenge.statut === 'en-cours' && toutesCotees) {
        const verdict = evaluerChallenge(challenge, capital, portefeuille.solde, compte.immobilise, portefeuille.positions.length, portefeuille.operations);
        challenge = verdict.challenge;
        if (verdict.fermerTout) {
          for (const pos of [...portefeuille.positions]) {
            const r = cloturer(portefeuille, pos.id, ticks[paireBinance(pos.symbole)].prix, ticks, { tauxCrypto: e.parametres.frais });
            if (typeof r !== 'string') portefeuille = r;
          }
          portefeuille = { ...portefeuille, ordres: [] };
          capital = valeurPortefeuille(portefeuille, ticks).capital;
        }
        if (verdict.message) {
          messages.push(verdict.message);
          notifier('Challenge', verdict.message, undefined, `challenge-${challenge.id}`);
        }
      }

      // Fermeture du week-end : positions et ordres hors crypto fermés du vendredi soir au dimanche soir.
      if (regleWeekendActive({ ...e, challenge }) && estWeekendMarche()) {
        const aFermer = portefeuille.positions.filter((x) => !estCrypto(x.symbole) && ticks[paireBinance(x.symbole)]);
        const ordresHors = portefeuille.ordres.filter((o) => !estCrypto(o.symbole));
        if (aFermer.length || ordresHors.length) {
          for (const pos of aFermer) {
            const r = cloturer(portefeuille, pos.id, ticks[paireBinance(pos.symbole)].prix, ticks, { tauxCrypto: e.parametres.frais });
            if (typeof r !== 'string') portefeuille = r;
          }
          portefeuille = { ...portefeuille, ordres: portefeuille.ordres.filter((o) => estCrypto(o.symbole)) };
          capital = valeurPortefeuille(portefeuille, ticks).capital;
          const m = `📅 Fermeture du week-end : ${aFermer.length} position${aFermer.length > 1 ? 's' : ''} et ${ordresHors.length} ordre${ordresHors.length > 1 ? 's' : ''} hors crypto fermés.`;
          messages.push(m);
          notifier('Fermeture du week-end', m, undefined, `weekend-${new Date().toISOString().slice(0, 10)}`);
        }
      }

      // Discipline du jour : perte max, objectif et nombre de trades, pour tout compte.
      if (e.parametres.discipline?.actif && toutesCotees) {
        const d = evaluerDiscipline(portefeuille, capital, e.parametres.discipline);
        portefeuille = d.portefeuille;
        if (d.fermerTout && portefeuille.positions.length > 0) {
          for (const pos of [...portefeuille.positions]) {
            const r = cloturer(portefeuille, pos.id, ticks[paireBinance(pos.symbole)].prix, ticks, { tauxCrypto: e.parametres.frais });
            if (typeof r !== 'string') portefeuille = r;
          }
          capital = valeurPortefeuille(portefeuille, ticks).capital;
        }
        if (d.message) {
          messages.push(d.message);
          notifier('Discipline du jour', d.message, undefined, `discipline-${portefeuille.journee?.date}`);
        }
      }

      const avecCapital = enregistrerCapital(portefeuille, capital, messages.length > 0);
      if (messages.length > 0) {
        setTimeout(() => setToast(messages.join(' · ')), 0);
        if (e.parametres.son) sonner();
      }
      if (avecCapital === e.portefeuille && challenge === e.challenge) return e;
      return { ...e, portefeuille: avecCapital, challenge };
    });
  }, [ticks]);

  useEffect(() => {
    sauverEtat(etat);
    ecrireHash(etat);
  }, [etat]);

  // Navigation par l'adresse (lien de partage ouvert dans un onglet déjà chargé, bouton Précédent…).
  useEffect(() => {
    const h = () => {
      const lu = lireHash();
      if (Object.keys(lu).length > 0) setEtat((e) => ({ ...e, ...lu }));
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = etat.theme;
    document.title = `${nomSymbole(etat.symbole)} — Parnassa Trading`;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', etat.theme === 'dark' ? '#131722' : '#ffffff');
  }, [etat.theme, etat.symbole]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const choisirSymbole = useCallback(
    (id: string) => {
      setEtat((e) => {
        const emplacements = e.lier && e.disposition > 1 ? e.emplacements.map(() => id) : [...e.emplacements];
        if (!(e.lier && e.disposition > 1)) emplacements[e.disposition > 1 ? emplacementActif : 0] = id;
        const resteSurPage = e.page === 'graphique' || e.page === 'symbole' || e.page === 'actualites';
        return { ...e, page: resteSurPage ? e.page : 'graphique', symbole: id, emplacements };
      });
    },
    [emplacementActif],
  );

  const ajouterComparaison = useCallback((id: string) => {
    setEtat((e) =>
      e.comparaisons.includes(id) || id === e.symbole ? e : { ...e, comparaisons: [...e.comparaisons, id] },
    );
    setToast(`${nomSymbole(id)} ajouté à la comparaison`);
  }, []);

  const choisirEmplacement = useCallback((i: number) => {
    setEmplacementActif(i);
    setEtat((e) => ({ ...e, symbole: e.emplacements[i] ?? e.symbole }));
  }, []);

  const basculerSuivi = useCallback((id: string) => {
    setEtat((e) => ({
      ...e,
      listeSuivi: e.listeSuivi.includes(id) ? e.listeSuivi.filter((s) => s !== id) : [...e.listeSuivi, id],
    }));
  }, []);

  const sauverDisposition = useCallback((nom: string) => {
    setEtat((e) => {
      const d: DispositionSauvee = {
        id: `${Date.now()}`,
        nom,
        creeLe: Date.now(),
        disposition: e.disposition,
        emplacements: e.emplacements,
        symbole: e.symbole,
        intervalle: e.intervalle,
        style: e.style,
        etudes: e.etudes,
        comparaisons: e.comparaisons,
      };
      return { ...e, dispositionsSauvees: [...e.dispositionsSauvees, d] };
    });
    setToast(`Disposition « ${nom} » enregistrée`);
  }, []);

  const chargerDisposition = useCallback((d: DispositionSauvee) => {
    setEtat((e) => ({
      ...e,
      page: 'graphique',
      disposition: d.disposition,
      emplacements: d.emplacements,
      symbole: d.symbole,
      intervalle: d.intervalle,
      style: d.style,
      etudes: d.etudes,
      comparaisons: d.comparaisons,
    }));
    setEmplacementActif(0);
    setToast(`Disposition « ${d.nom} » chargée`);
  }, []);

  const partager = useCallback(async () => {
    const lien = lienPartage(etat);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: document.title, url: lien });
        return;
      }
      await navigator.clipboard.writeText(lien);
      setToast('Lien copié dans le presse-papiers');
    } catch {
      window.prompt('Copiez ce lien :', lien);
    }
  }, [etat]);

  // Raccourcis façon TradingView : une lettre ouvre la recherche, 1-7 changent l'intervalle, « / » cherche.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (recherche.ouvert || gestionSuivi || parametresOuverts || aideOuverte || e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)) return;
      if (e.key === '?') {
        e.preventDefault();
        setAideOuverte(true);
        return;
      }
      // Maj + B/S/X/R : trading en un clic (géré par la barre), pas la recherche de symbole.
      if (e.shiftKey && etat.page === 'graphique' && ['b', 's', 'x', 'r'].includes(e.key.toLowerCase())) return;
      if (/^[1-7]$/.test(e.key) && etat.page === 'graphique') {
        maj({ intervalle: INTERVALLES[Number(e.key) - 1].valeur });
        return;
      }
      if (/^[a-zA-Z]$/.test(e.key)) setRecherche({ ouvert: true, saisie: e.key, mode: 'symbole' });
      if (e.key === '/') {
        e.preventDefault();
        setRecherche({ ouvert: true, mode: 'symbole' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [recherche.ouvert, gestionSuivi, parametresOuverts, aideOuverte, etat.page, maj]);

  const ouvrirRecherche = useCallback(() => setRecherche({ ouvert: true, mode: 'symbole' }), []);
  const ouvrirComparaison = useCallback(() => setRecherche({ ouvert: true, mode: 'comparer' }), []);
  const fermerRecherche = useCallback(() => setRecherche((r) => ({ ...r, ouvert: false })), []);

  return (
    <div className="application">
      <BarreHaut
        etat={etat}
        maj={maj}
        ouvrirRecherche={ouvrirRecherche}
        ouvrirComparaison={ouvrirComparaison}
        ouvrirListeSuivi={() => setGestionSuivi(true)}
        partager={() => void partager()}
        ouvrirParametres={() => setParametresOuverts(true)}
        ouvrirAide={() => setAideOuverte(true)}
        sauverDisposition={sauverDisposition}
        chargerDisposition={chargerDisposition}
        nbAlertes={etat.alertes.filter((a) => !a.declencheeLe).length}
      />
      <div className="bandeau">
        <WidgetTradingView
          widget="ticker-tape"
          config={{
            symbols: TICKER,
            showSymbolLogo: true,
            isTransparent: true,
            displayMode: 'adaptive',
            colorTheme: etat.theme,
            locale: 'fr',
          }}
          caches={[{ coin: 'haut-droite', largeur: 56, hauteur: 46, couleur: 'var(--fond)' }]}
        />
      </div>
      <RailGauche page={etat.page} changer={(page) => maj({ page })} />
      <main className="contenu">
        <Suspense fallback={<p className="chargement-page" role="status">Chargement…</p>}>
        {etat.page === 'accueil' && (
          <Accueil
            etat={etat}
            fil={fil}
            ticks={ticks}
            maj={maj}
            aller={(page) => maj({ page })}
            ouvrirSymbole={(id) => {
              choisirSymbole(id);
              maj({ page: 'graphique' });
            }}
          />
        )}
        {etat.page === 'graphique' && (
          <Graphique
            etat={etat}
            emplacementActif={emplacementActif}
            choisirEmplacement={choisirEmplacement}
            ouvrirRecherche={ouvrirRecherche}
            ticks={ticks}
            maj={maj}
            lecture={Boolean(compteTrading.session?.lecture)}
            signaler={setToast}
          />
        )}
        {etat.page === 'marches' && <Marches theme={etat.theme} />}
        {etat.page === 'screener' && <Screener theme={etat.theme} />}
        {etat.page === 'symbole' && <Symbole etat={etat} ouvrirRecherche={ouvrirRecherche} />}
        {etat.page === 'actualites' && <Actualites etat={etat} fil={fil} maj={maj} />}
        {etat.page === 'calendrier' && <Calendrier etat={etat} maj={maj} />}
        {etat.page === 'trading' && (
          <Trading
            etat={etat}
            ticks={ticks}
            maj={maj}
            compte={compteTrading}
            lie={synchro.statut !== 'deconnecte'}
            signaler={setToast}
            ouvrirSymbole={(id) => {
              choisirSymbole(id);
              maj({ page: 'graphique' });
            }}
          />
        )}
        {etat.page === 'alertes' && (
          <Alertes
            etat={etat}
            ticks={ticks}
            maj={maj}
            ouvrirSymbole={(id) => {
              choisirSymbole(id);
              maj({ page: 'graphique' });
            }}
          />
        )}
        </Suspense>
      </main>
      <RechercheSymbole
        ouvert={recherche.ouvert}
        mode={recherche.mode}
        saisieInitiale={recherche.saisie}
        fermer={fermerRecherche}
        choisir={recherche.mode === 'comparer' ? ajouterComparaison : choisirSymbole}
        listeSuivi={etat.listeSuivi}
        basculerSuivi={basculerSuivi}
      />
      <GestionListeSuivi
        ouvert={gestionSuivi}
        fermer={() => setGestionSuivi(false)}
        liste={etat.listeSuivi}
        changer={(listeSuivi) => maj({ listeSuivi })}
        ouvrirSymbole={(id) => {
          choisirSymbole(id);
          maj({ page: 'graphique' });
        }}
      />
      <Aide ouvert={aideOuverte} fermer={() => setAideOuverte(false)} aller={(page) => maj({ page })} />
      <Parametres
        ouvert={parametresOuverts}
        fermer={() => setParametresOuverts(false)}
        etat={etat}
        maj={maj}
        remplacerEtat={(e) => setEtat(e)}
        signaler={setToast}
        synchro={synchro}
        compteConnecte={compteTrading.session?.compte.login ?? null}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
