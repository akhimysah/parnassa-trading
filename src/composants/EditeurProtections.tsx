import { useState } from 'react';
import type { Position } from '../types';
import type { Tick } from '../binance';
import { formaterCotation } from '../instruments';
import { formaterUsdt, pnlLatent } from '../trading';

interface Props {
  position: Position;
  prixActuel: number | undefined;
  ticks: Record<string, Tick>;
  enregistrer: (prot: { stopLoss?: number; takeProfit?: number; suiveur?: number }) => void;
  breakEven: () => void;
  fermer: () => void;
}

const lire = (texte: string): number | undefined => {
  const v = Number(texte.replace(/\s/g, '').replace(',', '.'));
  return texte.trim() && Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Stop-loss, take-profit et stop suiveur d'une position ouverte, avec ce que chaque niveau rapporte ou coûte. */
export function EditeurProtections({ position, prixActuel, ticks, enregistrer, breakEven, fermer }: Props) {
  const [sl, setSl] = useState(position.stopLoss ? String(position.stopLoss) : '');
  const [tp, setTp] = useState(position.takeProfit ? String(position.takeProfit) : '');
  const [suiveur, setSuiveur] = useState(position.suiveur ? String(position.suiveur) : '');
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
      <div className="ep-boutons">
        <button className="bouton-secondaire" onClick={breakEven} disabled={!enGain} title={enGain ? 'Stop-loss au prix d’entrée' : 'Possible quand la position est en gain'}>
          Break-even
        </button>
        <button className="bouton-principal" onClick={() => enregistrer({ stopLoss: slNum, takeProfit: tpNum, suiveur: suiveurNum })}>
          Enregistrer
        </button>
        <button className="lien discret" onClick={() => enregistrer({})}>
          Tout retirer
        </button>
        <button className="lien discret" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}
