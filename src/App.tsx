import { useCallback, useEffect, useState } from 'react';
import type { DispositionSauvee, Etat } from './types';
import { chargerEtat, sauverEtat } from './stockage';
import { BarreHaut, INTERVALLES } from './composants/BarreHaut';
import { RailGauche } from './composants/RailGauche';
import { RechercheSymbole } from './composants/RechercheSymbole';
import { GestionListeSuivi } from './composants/GestionListeSuivi';
import { WidgetTradingView } from './composants/WidgetTradingView';
import { Graphique } from './pages/Graphique';
import { Marches } from './pages/Marches';
import { Screener } from './pages/Screener';
import { Symbole } from './pages/Symbole';
import { Actualites } from './pages/Actualites';
import { Calendrier } from './pages/Calendrier';
import { Alertes } from './pages/Alertes';
import { useMoteurAlertes } from './alertes';
import { estBinance, paireBinance } from './binance';
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
  const [emplacementActif, setEmplacementActif] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const maj = useCallback((p: Partial<Etat>) => setEtat((e) => ({ ...e, ...p })), []);

  // Moteur d'alertes : actif sur toutes les pages tant que l'application est ouverte.
  const majAlertes = useCallback(
    (f: (a: Etat['alertes']) => Etat['alertes']) => setEtat((e) => ({ ...e, alertes: f(e.alertes) })),
    [],
  );
  const pairesSuivies = etat.listeSuivi.filter(estBinance).map(paireBinance);
  const ticks = useMoteurAlertes(etat.alertes, pairesSuivies, majAlertes, setToast);

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
      if (recherche.ouvert || gestionSuivi || e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)) return;
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
  }, [recherche.ouvert, gestionSuivi, etat.page, maj]);

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
        {etat.page === 'graphique' && (
          <Graphique
            etat={etat}
            emplacementActif={emplacementActif}
            choisirEmplacement={choisirEmplacement}
            ouvrirRecherche={ouvrirRecherche}
          />
        )}
        {etat.page === 'marches' && <Marches theme={etat.theme} />}
        {etat.page === 'screener' && <Screener theme={etat.theme} />}
        {etat.page === 'symbole' && <Symbole etat={etat} ouvrirRecherche={ouvrirRecherche} />}
        {etat.page === 'actualites' && <Actualites etat={etat} />}
        {etat.page === 'calendrier' && <Calendrier theme={etat.theme} />}
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
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
