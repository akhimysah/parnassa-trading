import { useMemo, useState } from 'react';
import type { Alerte, Etat } from '../types';
import type { Tick } from '../binance';
import { estBinance, formaterPrix, paireBinance, useCloturesJournalieres } from '../binance';
import { MiniCourbe } from '../composants/MiniCourbe';
import { CATALOGUE, bourse, nomSymbole, normaliser, ticker } from '../symboles';
import { conditionRemplie, demanderNotifications } from '../alertes';
import { IconeCroix, IconeTelecharger } from '../composants/Icones';
import { horodatageFichier, telecharger, versCsv } from '../export';

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
  const historiques = useCloturesJournalieres(suivisCrypto.map(paireBinance), 30);
  const [tri, setTri] = useState<{ col: 'paire' | 'prix' | 'j1' | 'j7' | 'j30' | 'volume'; desc: boolean }>({ col: 'j1', desc: true });

  const lignesCrypto = useMemo(() => {
    const lignes = suivisCrypto.map((id) => {
      const t = ticks[paireBinance(id)];
      const serie = historiques[paireBinance(id)] ?? [];
      const var1 = t && t.ouverture24h ? ((t.prix - t.ouverture24h) / t.ouverture24h) * 100 : null;
      const ref7 = serie.length >= 8 ? serie[serie.length - 8] : null;
      const var7 = ref7 && t ? ((t.prix - ref7) / ref7) * 100 : null;
      const ref30 = serie.length > 0 ? serie[0] : null;
      const var30 = ref30 && t ? ((t.prix - ref30) / ref30) * 100 : null;
      return { id, t, serie, var1, var7, var30 };
    });
    const valeur = (l: (typeof lignes)[number]): number | string | null => {
      switch (tri.col) {
        case 'paire':
          return ticker(l.id);
        case 'prix':
          return l.t?.prix ?? null;
        case 'j1':
          return l.var1;
        case 'j7':
          return l.var7;
        case 'j30':
          return l.var30;
        case 'volume':
          return l.t?.volume24h ?? null;
      }
    };
    return lignes.sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return tri.desc ? -c : c;
    });
  }, [suivisCrypto, ticks, historiques, tri]);

  const entete = (col: typeof tri.col, libelle: string, num = true) => (
    <th
      className={`${num ? 'num' : ''} triable ${tri.col === col ? 'trie' : ''}`}
      onClick={() => setTri((t) => ({ col, desc: t.col === col ? !t.desc : col !== 'paire' }))}
      aria-sort={tri.col === col ? (tri.desc ? 'descending' : 'ascending') : 'none'}
    >
      {libelle}
      {tri.col === col && <span className="fleche-tri">{tri.desc ? ' ↓' : ' ↑'}</span>}
    </th>
  );

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
          <div className="entete-carte">
            <h3>Alertes actives ({actives.length})</h3>
            {etat.alertes.length > 0 && (
              <button
                className="bouton-secondaire avec-icone"
                title="Exporter toutes les alertes en CSV"
                onClick={() =>
                  telecharger(
                    `parnassa-trading-alertes-${horodatageFichier()}.csv`,
                    versCsv(
                      ['Paire', 'Condition', 'Seuil', 'Note', 'Créée le', 'Déclenchée le', 'Prix de déclenchement'],
                      etat.alertes.map((a) => [
                        ticker(a.symbole),
                        a.condition,
                        a.seuil,
                        a.note ?? '',
                        new Date(a.creeLe).toLocaleString('fr-FR'),
                        a.declencheeLe ? new Date(a.declencheeLe).toLocaleString('fr-FR') : '',
                        a.prixDeclenchement ?? '',
                      ]),
                    ),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                <IconeTelecharger width={14} height={14} /> CSV
              </button>
            )}
          </div>
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
        <div className="defilement-x">
<table className="tableau-prix">
          <thead>
            <tr>
              {entete('paire', 'Paire', false)}
              <th>Nom</th>
              {entete('prix', 'Dernier')}
              {entete('j1', '24 h')}
              {entete('j7', '7 j')}
              {entete('j30', '30 j')}
              <th>Tendance</th>
              <th className="num">Plus haut</th>
              <th className="num">Plus bas</th>
              {entete('volume', 'Volume (USDT)')}
            </tr>
          </thead>
          <tbody>
            {lignesCrypto.map(({ id, t, serie, var1: variation, var7, var30 }) => {
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
                  <td className={`num ${var7 === null ? '' : var7 >= 0 ? 'hausse' : 'baisse'}`}>
                    {var7 === null ? '…' : `${var7 >= 0 ? '+' : ''}${var7.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
                  </td>
                  <td className={`num ${var30 === null ? '' : var30 >= 0 ? 'hausse' : 'baisse'}`}>
                    {var30 === null ? '…' : `${var30 >= 0 ? '+' : ''}${var30.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
                  </td>
                  <td>
                    <MiniCourbe valeurs={serie} />
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
    </div>
  );
}
