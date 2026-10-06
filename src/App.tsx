import { useCallback, useEffect, useState } from 'react';
import type { Etat } from './types';
import { chargerEtat, sauverEtat } from './stockage';
import { BarreHaut } from './composants/BarreHaut';
import { RailGauche } from './composants/RailGauche';
import { RechercheSymbole } from './composants/RechercheSymbole';
import { WidgetTradingView } from './composants/WidgetTradingView';
import { Graphique } from './pages/Graphique';
import { Marches } from './pages/Marches';
import { Screener } from './pages/Screener';
import { Symbole } from './pages/Symbole';
import { Actualites } from './pages/Actualites';
import { Calendrier } from './pages/Calendrier';
import { nomSymbole } from './symboles';
import { symboleDepuisUrl } from './site';

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

export function App() {
  const [etat, setEtat] = useState<Etat>(() => {
    const charge = chargerEtat();
    const recu = symboleDepuisUrl();
    if (!recu) return charge;
    const emplacements = [...charge.emplacements];
    emplacements[0] = recu;
    return { ...charge, page: 'graphique', symbole: recu, emplacements };
  });
  const [recherche, setRecherche] = useState<{ ouvert: boolean; saisie?: string }>({ ouvert: false });
  const [emplacementActif, setEmplacementActif] = useState(0);

  const maj = useCallback((p: Partial<Etat>) => setEtat((e) => ({ ...e, ...p })), []);

  useEffect(() => sauverEtat(etat), [etat]);

  useEffect(() => {
    document.documentElement.dataset.theme = etat.theme;
    document.title = `${nomSymbole(etat.symbole)} — Parnassa Trading`;
  }, [etat.theme, etat.symbole]);

  const choisirSymbole = useCallback(
    (id: string) => {
      setEtat((e) => {
        const emplacements = [...e.emplacements];
        emplacements[e.disposition > 1 ? emplacementActif : 0] = id;
        return { ...e, symbole: id, emplacements };
      });
    },
    [emplacementActif],
  );

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

  // Comme sur TradingView : taper une lettre ouvre la recherche de symbole.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (recherche.ouvert || e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)) return;
      if (/^[a-zA-Z0-9]$/.test(e.key)) setRecherche({ ouvert: true, saisie: e.key });
      if (e.key === '/') {
        e.preventDefault();
        setRecherche({ ouvert: true });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [recherche.ouvert]);

  const ouvrirRecherche = useCallback(() => setRecherche({ ouvert: true }), []);
  const fermerRecherche = useCallback(() => setRecherche({ ouvert: false }), []);

  return (
    <div className="application">
      <BarreHaut etat={etat} maj={maj} ouvrirRecherche={ouvrirRecherche} />
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
      </main>
      <RechercheSymbole
        ouvert={recherche.ouvert}
        saisieInitiale={recherche.saisie}
        fermer={fermerRecherche}
        choisir={choisirSymbole}
        listeSuivi={etat.listeSuivi}
        basculerSuivi={basculerSuivi}
      />
    </div>
  );
}
