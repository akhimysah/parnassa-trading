import { useState } from 'react';
import type { Palier, Position } from '../types';
import type { Tick } from '../binance';
import { formaterCotation } from '../instruments';
import { formaterUsdt, pnlLatent } from '../trading';

interface Props {
  position: Position;
  prixActuel: number | undefined;
  ticks: Record<string, Tick>;
  enregistrer: (prot: { stopLoss?: number; takeProfit?: number; suiveur?: number; paliers?: Palier[]; beApresPalier?: boolean }) => void;
  breakEven: () => void;
  fermer: () => void;
  /** Programme la clôture au marché à cette date, ou l'annule (undefined). */
  programmer: (fermerLe: number | undefined) => void;
}

/** Prochaine occurrence de HH:MM (aujourd'hui si elle est à venir, sinon demain), heure locale. */
export function prochaineHeure(hhmm: string, maintenant = Date.now()): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return undefined;
  const d = new Date(maintenant);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= maintenant) d.setDate(d.getDate() + 1);
  return d.getTime();
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const lire = (texte: string): number | undefined => {
  const v = Number(texte.replace(/\s/g, '').replace(',', '.'));
  return texte.trim() && Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Stop-loss, take-profit et stop suiveur d'une position ouverte, avec ce que chaque niveau rapporte ou coûte. */
export function EditeurProtections({ position, prixActuel, ticks, enregistrer, breakEven, fermer, programmer }: Props) {
  const [heureFermeture, setHeureFermeture] = useState(position.fermerLe ? hhmm(position.fermerLe) : '');
  const [sl, setSl] = useState(position.stopLoss ? String(position.stopLoss) : '');
  const [tp, setTp] = useState(position.takeProfit ? String(position.takeProfit) : '');
  const [suiveur, setSuiveur] = useState(position.suiveur ? String(position.suiveur) : '');
  const faits = (position.paliers ?? []).filter((x) => x.fait);
  const [lignes, setLignes] = useState<{ prix: string; pct: string }[]>(() => {
    const restants = (position.paliers ?? []).filter((x) => !x.fait).map((x) => ({ prix: String(x.prix), pct: String(Math.round(x.part * 100)) }));
    while (restants.length < 3) restants.push({ prix: '', pct: '' });
    return restants.slice(0, 3);
  });
  const [beApresPalier, setBeApresPalier] = useState(Boolean(position.beApresPalier));
  const paliers: Palier[] = lignes
    .map((l) => ({ prix: lire(l.prix), part: (lire(l.pct) ?? 0) / 100 }))
    .filter((x): x is Palier => x.prix !== undefined && x.part > 0);
  const reference = position.quantiteInitiale && faits.length ? position.quantiteInitiale : position.quantite;
  const slNum = lire(sl);
  const tpNum = lire(tp);
  const suiveurNum = lire(suiveur);
  // Résultat si la position se fermait à ce niveau (frais non compris).
  const aNiveau = (niveau: number | undefined) => (niveau === undefined ? null : pnlLatent(position, niveau, ticks));
  const resultatSl = aNiveau(slNum);
  const resultatTp = aNiveau(tpNum);
  const ecartSuiveur = suiveurNum !== undefined ? Math.abs(pnlLatent(position, position.prixEntree + suiveurNum, ticks) - pnlLatent(position, position.prixEntree, ticks)) : null;
  const enGain = prixActuel !== undefined && (position.sens === 'achat' ? prixActuel > position.prixEntree : prixActuel < position.prixEntree);

  const montant = (v: number | null) => (v === null ? '' : <em className={v >= 0 ? 'hausse' : 'baisse'}>{formaterUsdt(v, true)}</em>);

  return (
    <div className="editeur-protections">
      <span className="muet">
        Entrée {formaterCotation(position.symbole, position.prixEntree)}
        {prixActuel ? ` · actuel ${formaterCotation(position.symbole, prixActuel)}` : ''}
      </span>
      <label>
        <span>Stop-loss</span>
        <input inputMode="decimal" value={sl} placeholder="aucun" onChange={(e) => setSl(e.target.value)} />
        {montant(resultatSl)}
      </label>
      <label>
        <span>Take-profit</span>
        <input inputMode="decimal" value={tp} placeholder="aucun" onChange={(e) => setTp(e.target.value)} />
        {montant(resultatTp)}
      </label>
      <label title="Le stop-loss suit le meilleur prix à cette distance et ne recule jamais.">
        <span>Stop suiveur (distance)</span>
        <input inputMode="decimal" value={suiveur} placeholder="aucun" onChange={(e) => setSuiveur(e.target.value)} />
        {ecartSuiveur !== null && <em className="muet">≈ {formaterUsdt(ecartSuiveur)} derrière le meilleur prix</em>}
      </label>
      <div className="ep-paliers">
        <span className="muet">Prises de profit partielles (part du volume de départ)</span>
        {faits.map((x, i) => (
          <span key={`f${i}`} className="ep-palier-fait">
            ✓ {formaterCotation(position.symbole, x.prix)} · {Math.round(x.part * 100)} % pris
          </span>
        ))}
        {lignes.map((l, i) => {
          const prixPalier = lire(l.prix);
          const part = (lire(l.pct) ?? 0) / 100;
          const gain = prixPalier !== undefined && part > 0 ? pnlLatent(position, prixPalier, ticks) * ((part * reference) / position.quantite) : null;
          return (
            <div key={i} className="ep-palier">
              <span className="muet">TP{faits.length + i + 1}</span>
              <input
                inputMode="decimal"
                placeholder="prix"
                value={l.prix}
                onChange={(e) => setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, prix: e.target.value } : x)))}
                aria-label={`Prix du palier ${faits.length + i + 1}`}
              />
              <input
                className="ep-pct"
                inputMode="numeric"
                placeholder="%"
                value={l.pct}
                onChange={(e) => setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                aria-label={`Part du palier ${faits.length + i + 1} en %`}
              />
              <span className="muet">%</span>
              {gain !== null && montant(gain)}
            </div>
          );
        })}
        <label className="case">
          <input type="checkbox" checked={beApresPalier} onChange={(e) => setBeApresPalier(e.target.checked)} />
          Stop au prix d'entrée dès le 1er palier atteint
        </label>
      </div>
      <div className="ep-programme">
        <span>⏰ Fermer à</span>
        <input type="time" value={heureFermeture} onChange={(e) => setHeureFermeture(e.target.value)} aria-label="Heure de clôture programmée" />
        <button className="bouton-secondaire" disabled={!prochaineHeure(heureFermeture)} onClick={() => programmer(prochaineHeure(heureFermeture))}>
          Programmer
        </button>
        <button className="lien discret" onClick={() => programmer(Date.now() + 3600000)}>
          dans 1 h
        </button>
        {position.fermerLe && (
          <button className="lien discret danger" onClick={() => programmer(undefined)}>
            Annuler ({new Date(position.fermerLe).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})
          </button>
        )}
        <span className="muet petit">Fermeture au marché à l'heure dite, ou à la réouverture si le marché est fermé.</span>
      </div>
      <div className="ep-boutons">
        <button className="bouton-secondaire" onClick={breakEven} disabled={!enGain} title={enGain ? 'Stop-loss au prix d’entrée' : 'Possible quand la position est en gain'}>
          Break-even
        </button>
        <button className="bouton-principal" onClick={() => enregistrer({ stopLoss: slNum, takeProfit: tpNum, suiveur: suiveurNum, paliers: [...faits, ...paliers], beApresPalier })}>
          Enregistrer
        </button>
        <button className="lien discret" onClick={() => enregistrer({ paliers: [] })}>
          Tout retirer
        </button>
        <button className="lien discret" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}
