import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tick } from '../binance';
import { useFluxBinance } from '../binance';
import {
  CATEGORIES_INSTRUMENTS,
  INSTRUMENTS,
  cleCotation,
  formaterCotation,
  instrument,
  useCotationsScanner,
  type CategorieInstrument,
} from '../instruments';
import { IconeChevron, IconeRecherche } from './Icones';

interface Props {
  valeur: string;
  onChange: (id: string) => void;
  /** Prix déjà connus (flux de l'application), complétés par ceux chargés à l'ouverture. */
  ticks: Record<string, Tick>;
}

type Filtre = 'tous' | CategorieInstrument;

/** Sélecteur d'instrument : or, forex, indices, énergie, actions et crypto, avec recherche et prix en direct. */
export function SelecteurInstrument({ valeur, onChange, ticks }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [surbrillance, setSurbrillance] = useState(0);
  const refRacine = useRef<HTMLDivElement>(null);
  const refSaisie = useRef<HTMLInputElement>(null);

  // Prix de tout le catalogue, seulement pendant que la liste est ouverte.
  const scanner = useCotationsScanner(ouvert ? INSTRUMENTS.map((i) => i.id) : [], 5000);
  const crypto = useFluxBinance(ouvert ? INSTRUMENTS.filter((i) => i.source === 'binance').map((i) => cleCotation(i.id)) : []);
  const prix = (id: string) => ticks[cleCotation(id)] ?? scanner[cleCotation(id)] ?? crypto[cleCotation(id)];

  useEffect(() => {
    if (!ouvert) return;
    setRecherche('');
    setSurbrillance(0);
    setTimeout(() => refSaisie.current?.focus(), 0);
    const clic = (e: MouseEvent) => {
      if (refRacine.current && !refRacine.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', clic);
    return () => document.removeEventListener('mousedown', clic);
  }, [ouvert]);

  const q = recherche.trim().toUpperCase().replace(/[\s/]/g, '');
  const resultats = useMemo(
    () =>
      INSTRUMENTS.filter(
        (i) =>
          (filtre === 'tous' || i.categorie === filtre) &&
          (!q || i.code.replace('/', '').includes(q) || i.nom.toUpperCase().includes(q) || i.id.toUpperCase().includes(q)),
      ),
    [filtre, q],
  );
  // Toute autre paire Binance peut être saisie librement (ex. WIFUSDT).
  const libre = q && /^[A-Z0-9]{2,15}(USDT|USDC|FDUSD)$/.test(q) && !resultats.some((i) => cleCotation(i.id) === q) ? `BINANCE:${q}` : null;
  const options = libre ? [libre, ...resultats.map((i) => i.id)] : resultats.map((i) => i.id);

  const choisir = (id: string) => {
    onChange(id);
    setOuvert(false);
  };

  const actuel = instrument(valeur);
  const tickActuel = prix(valeur);

  return (
    <div className="selecteur-instrument" ref={refRacine}>
      <button type="button" className="si-bouton" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="listbox">
        <span className="si-code">{actuel?.code ?? cleCotation(valeur)}</span>
        <span className="si-nom muet">{actuel?.nom ?? 'Paire Binance'}</span>
        {actuel && actuel.differe > 0 && <span className="pastille">différé {actuel.differe} min</span>}
        <span className="si-prix">{tickActuel ? formaterCotation(valeur, tickActuel.prix) : '…'}</span>
        <IconeChevron width={14} height={14} />
      </button>

      {ouvert && (
        <div className="si-panneau" role="listbox">
          <div className="si-recherche">
            <IconeRecherche width={15} height={15} />
            <input
              ref={refSaisie}
              value={recherche}
              placeholder="XAUUSD, EURUSD, Nasdaq, BTC, AAPL…"
              onChange={(e) => {
                setRecherche(e.target.value);
                setSurbrillance(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOuvert(false);
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSurbrillance((i) => Math.min(i + 1, options.length - 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSurbrillance((i) => Math.max(i - 1, 0));
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (options[surbrillance]) choisir(options[surbrillance]);
                }
              }}
            />
          </div>
          <div className="si-filtres">
            {(['tous', ...CATEGORIES_INSTRUMENTS.map((c) => c.id)] as Filtre[]).map((f) => (
              <button
                type="button"
                key={f}
                className={filtre === f ? 'actif' : ''}
                onClick={() => {
                  setFiltre(f);
                  setSurbrillance(0);
                }}
              >
                {f === 'tous' ? 'Tous' : CATEGORIES_INSTRUMENTS.find((c) => c.id === f)?.libelle}
              </button>
            ))}
          </div>
          <ul className="si-liste">
            {options.map((id, idx) => {
              const i = instrument(id);
              const t = prix(id);
              const variation = t && t.ouverture24h ? ((t.prix - t.ouverture24h) / t.ouverture24h) * 100 : null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`${idx === surbrillance ? 'surbrillance' : ''} ${id === valeur ? 'choisi' : ''}`}
                    onMouseEnter={() => setSurbrillance(idx)}
                    onClick={() => choisir(id)}
                  >
                    <span className="si-code">{i?.code ?? cleCotation(id)}</span>
                    <span className="si-nom muet">
                      {i?.nom ?? 'Autre paire Binance'}
                      {i && i.differe > 0 && <em> · différé {i.differe} min</em>}
                    </span>
                    <span className="si-prix">{t ? formaterCotation(id, t.prix) : '…'}</span>
                    <span className={`si-var ${variation === null ? '' : variation >= 0 ? 'hausse' : 'baisse'}`}>
                      {variation === null ? '' : `${variation >= 0 ? '+' : ''}${variation.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
                    </span>
                  </button>
                </li>
              );
            })}
            {options.length === 0 && <li className="vide">Aucun instrument. Pour une autre crypto, tapez sa paire complète (ex. WIFUSDT).</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
