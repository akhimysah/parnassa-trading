import { useMemo, useState } from 'react';
import type { Alerte, Etat } from '../types';
import type { Tick } from '../binance';
import { estBinance, formaterPrix, paireBinance } from '../binance';
import { CATALOGUE, bourse, nomSymbole, normaliser, ticker } from '../symboles';
import { conditionRemplie, demanderNotifications } from '../alertes';
import { IconeCroix } from '../composants/Icones';

interface Props {
  etat: Etat;
  ticks: Record<string, Tick>;
  maj: (p: Partial<Etat>) => void;
  ouvrirSymbole: (id: string) => void;
}

const CRYPTOS = CATALOGUE.filter((s) => s.id.startsWith('BINANCE:'));

function dateCourte(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function Alertes({ etat, ticks, maj, ouvrirSymbole }: Props) {
  const defaut = estBinance(etat.symbole) ? etat.symbole : 'BINANCE:BTCUSDT';
  const [symbole, setSymbole] = useState(defaut);
  const [condition, setCondition] = useState<Alerte['condition']>('au-dessus');
  const [seuil, setSeuil] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const prixCourant = ticks[paireBinance(symbole)]?.prix;
  const actives = etat.alertes.filter((a) => !a.declencheeLe);
  const historique = etat.alertes.filter((a) => a.declencheeLe).sort((a, b) => (b.declencheeLe ?? 0) - (a.declencheeLe ?? 0));

  const suivisCrypto = useMemo(() => etat.listeSuivi.filter(estBinance), [etat.listeSuivi]);

  const creer = (e: React.FormEvent) => {
    e.preventDefault();
    const id = normaliser(symbole);
    if (!estBinance(id)) {
      setErreur('Les alertes temps réel fonctionnent avec les paires Binance (ex. BTCUSDT, ETHUSDT).');
      return;
    }
    const valeur = Number(seuil.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Indiquez un prix valide.');
      return;
    }
    setErreur(null);
    demanderNotifications();
    const alerte: Alerte = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbole: id,
      condition,
      seuil: valeur,
      note: note.trim() || undefined,
      creeLe: Date.now(),
    };
    maj({ alertes: [...etat.alertes, alerte] });
    setSeuil('');
    setNote('');
  };

  const supprimer = (id: string) => maj({ alertes: etat.alertes.filter((a) => a.id !== id) });
  const rearmer = (id: string) =>
    maj({
      alertes: etat.alertes.map((a) =>
        a.id === id ? { ...a, declencheeLe: undefined, prixDeclenchement: undefined, dernierPrix: undefined } : a,
      ),
    });

  const prefixerSeuil = (pct: number) => {
    if (!prixCourant) return;
    setSeuil(String(Math.round(prixCourant * (1 + pct / 100) * 100) / 100));
    setCondition(pct >= 0 ? 'au-dessus' : 'en-dessous');
  };

  return (
    <div className="page defilable alertes">
      <div className="grille-alertes">
        <form className="carte formulaire-alerte" onSubmit={creer}>
          <h3>Nouvelle alerte de prix</h3>
          <label>
            Paire
            <div className="champ-double">
              <input
                list="paires-binance"
                value={symbole}
                onChange={(e) => setSymbole(e.target.value.toUpperCase())}
                placeholder="BINANCE:BTCUSDT"
              />
              <datalist id="paires-binance">
                {CRYPTOS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </datalist>
              <span className="prix-direct">{prixCourant ? formaterPrix(prixCourant) : '…'}</span>
            </div>
          </label>
          <label>
            Condition
            <div className="segmente">
              <button type="button" className={condition === 'au-dessus' ? 'actif hausse' : ''} onClick={() => setCondition('au-dessus')}>
                Passe au-dessus de
              </button>
              <button type="button" className={condition === 'en-dessous' ? 'actif baisse' : ''} onClick={() => setCondition('en-dessous')}>
                Passe sous
              </button>
            </div>
          </label>
          <label>
            Prix
            <input inputMode="decimal" value={seuil} onChange={(e) => setSeuil(e.target.value)} placeholder={prixCourant ? formaterPrix(prixCourant) : '0,00'} />
          </label>
          <div className="puces">
            {[-5, -2, -1, 1, 2, 5].map((p) => (
              <button type="button" key={p} onClick={() => prefixerSeuil(p)} disabled={!prixCourant}>
                {p > 0 ? `+${p}` : p} %
              </button>
            ))}
          </div>
          <label>
            Note (facultatif)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. zone de résistance" />
          </label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button type="submit" className="bouton-principal">
            Créer l'alerte
          </button>
          <p className="muet petit">
            Les alertes sont vérifiées en direct tant que l'application est ouverte, avec son et notification du navigateur.
          </p>
        </form>

        <div className="carte">
          <h3>Alertes actives ({actives.length})</h3>
          {actives.length === 0 && <p className="vide">Aucune alerte active.</p>}
          <ul className="liste-alertes">
            {actives.map((a) => {
              const prix = ticks[paireBinance(a.symbole)]?.prix;
              const distance = prix ? ((a.seuil - prix) / prix) * 100 : null;
              const proche = prix !== undefined && conditionRemplie(a, prix);
              return (
                <li key={a.id}>
                  <button className="ligne" onClick={() => ouvrirSymbole(a.symbole)} title="Ouvrir le graphique">
                    <strong>{ticker(a.symbole)}</strong>
                    <span className={a.condition === 'au-dessus' ? 'hausse' : 'baisse'}>
                      {a.condition === 'au-dessus' ? '↑ au-dessus de' : '↓ sous'} {formaterPrix(a.seuil)}
                    </span>
                    <span className="muet">
                      {prix ? `actuel ${formaterPrix(prix)}` : 'en attente du flux…'}
                      {distance !== null && ` · ${distance > 0 ? '+' : ''}${distance.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`}
                      {proche && ' · en attente de franchissement'}
                    </span>
                    {a.note && <span className="note">{a.note}</span>}
                  </button>
                  <button className="icone petit" aria-label="Supprimer" onClick={() => supprimer(a.id)}>
                    <IconeCroix width={14} height={14} />
                  </button>
                </li>
              );
            })}
          </ul>

          <h3>Déclenchées ({historique.length})</h3>
          {historique.length === 0 && <p className="vide">Rien pour l'instant.</p>}
          <ul className="liste-alertes">
            {historique.map((a) => (
              <li key={a.id} className="declenchee">
                <button className="ligne" onClick={() => ouvrirSymbole(a.symbole)}>
                  <strong>{ticker(a.symbole)}</strong>
                  <span>
                    {a.condition === 'au-dessus' ? '↑' : '↓'} {formaterPrix(a.seuil)} · déclenchée à {formaterPrix(a.prixDeclenchement ?? 0)}
                  </span>
                  <span className="muet">{a.declencheeLe ? dateCourte(a.declencheeLe) : ''}</span>
                  {a.note && <span className="note">{a.note}</span>}
                </button>
                <button className="lien" onClick={() => rearmer(a.id)}>
                  Réarmer
                </button>
                <button className="icone petit" aria-label="Supprimer" onClick={() => supprimer(a.id)}>
                  <IconeCroix width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="carte">
        <h3>Crypto en direct (liste de suivi)</h3>
        {suivisCrypto.length === 0 && <p className="vide">Ajoutez des paires Binance à votre liste de suivi pour les voir ici.</p>}
        <table className="tableau-prix">
          <thead>
            <tr>
              <th>Paire</th>
              <th>Nom</th>
              <th className="num">Dernier</th>
              <th className="num">24 h</th>
              <th className="num">Plus haut</th>
              <th className="num">Plus bas</th>
              <th className="num">Volume (USDT)</th>
            </tr>
          </thead>
          <tbody>
            {suivisCrypto.map((id) => {
              const t = ticks[paireBinance(id)];
              const variation = t && t.ouverture24h ? ((t.prix - t.ouverture24h) / t.ouverture24h) * 100 : null;
              return (
                <tr key={id} onClick={() => ouvrirSymbole(id)}>
                  <td>
                    <strong>{ticker(id)}</strong> <span className="pastille">{bourse(id)}</span>
                  </td>
                  <td className="muet">{nomSymbole(id)}</td>
                  <td className="num">{t ? formaterPrix(t.prix) : '…'}</td>
                  <td className={`num ${variation === null ? '' : variation >= 0 ? 'hausse' : 'baisse'}`}>
                    {variation === null ? '…' : `${variation >= 0 ? '+' : ''}${variation.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
                  </td>
                  <td className="num muet">{t?.haut24h ? formaterPrix(t.haut24h) : '…'}</td>
                  <td className="num muet">{t?.bas24h ? formaterPrix(t.bas24h) : '…'}</td>
                  <td className="num muet">{t?.volume24h ? Math.round(t.volume24h).toLocaleString('fr-FR') : '…'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
