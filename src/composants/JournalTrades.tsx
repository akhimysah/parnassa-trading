import { useMemo, useState } from 'react';
import type { Operation } from '../types';
import { ETIQUETTES_MENTAL, ETIQUETTES_SETUP, statsParEtiquette } from '../journal';
import { formaterCotation } from '../instruments';
import { formaterLots, formaterQuantite, formaterUsdt } from '../trading';
import { ticker } from '../symboles';

interface Props {
  journal: Operation[];
  origines: Record<string, string>;
  dateCourte: (ms: number) => string;
  ouvrirSymbole: (id: string) => void;
  editerNote: (id: string) => void;
  etiqueter: (id: string, etiquettes: string[]) => void;
}

/** Choix des étiquettes d'un trade : propositions (setup, état d'esprit) et étiquette libre. */
function ChoixEtiquettes({ actuelles, choisir, fermer }: { actuelles: string[]; choisir: (e: string) => void; fermer: () => void }) {
  const [libre, setLibre] = useState('');
  const proposer = (liste: string[]) =>
    liste
      .filter((e) => !actuelles.includes(e))
      .map((e) => (
        <button key={e} className="puce-bascule" onClick={() => choisir(e)}>
          {e}
        </button>
      ));
  return (
    <div className="choix-etiquettes">
      <div>{proposer(ETIQUETTES_SETUP)}</div>
      <div>{proposer(ETIQUETTES_MENTAL)}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (libre.trim()) choisir(libre.trim());
          setLibre('');
        }}
      >
        <input className="champ" placeholder="Autre étiquette…" maxLength={24} value={libre} onChange={(e) => setLibre(e.target.value)} />
        <button className="lien discret" type="button" onClick={fermer}>
          Fermer
        </button>
      </form>
    </div>
  );
}

/** Journal des trades clôturés : étiquettes, performance par étiquette, filtre, notes. */
export function JournalTrades({ journal, origines, dateCourte, ouvrirSymbole, editerNote, etiqueter }: Props) {
  const [filtre, setFiltre] = useState<string | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(100);
  const stats = useMemo(() => statsParEtiquette(journal), [journal]);
  const liste = filtre ? journal.filter((o) => o.etiquettes?.includes(filtre)) : journal;

  if (journal.length === 0) return <p className="vide">Le journal se remplit à chaque clôture : résultat, prix d'entrée et de sortie, vos notes et vos étiquettes.</p>;

  return (
    <>
      {stats.length > 0 && (
        <div className="perf-etiquettes">
          <h4>Performance par étiquette</h4>
          <div className="defilement-x">
            <table className="tableau-prix">
              <thead>
                <tr>
                  <th>Étiquette</th>
                  <th className="num">Trades</th>
                  <th className="num">Réussite</th>
                  <th className="num">Résultat</th>
                  <th className="num">Par trade</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.etiquette} className={filtre === s.etiquette ? 'selectionnee' : ''} onClick={() => setFiltre(filtre === s.etiquette ? null : s.etiquette)} title="Filtrer le journal">
                    <td>
                      <span className="etiquette">{s.etiquette}</span>
                    </td>
                    <td className="num">{s.nb}</td>
                    <td className="num">{Math.round((s.gagnants / s.nb) * 100)} %</td>
                    <td className={`num ${s.net >= 0 ? 'hausse' : 'baisse'}`}>{formaterUsdt(s.net, true)}</td>
                    <td className={`num ${s.esperance >= 0 ? 'hausse' : 'baisse'}`}>{formaterUsdt(s.esperance, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {filtre && (
        <p className="filtre-journal">
          Filtre : <span className="etiquette">{filtre}</span> · {liste.length} trade{liste.length > 1 ? 's' : ''}{' '}
          <button className="lien discret" onClick={() => setFiltre(null)}>
            Retirer le filtre
          </button>
        </p>
      )}
      <ul className="journal">
        {liste.slice(0, visibles).map((o) => {
          const pct = o.prixEntree ? ((o.resultat ?? 0) / (o.prixEntree * o.quantite)) * 100 : null;
          const etiquettes = o.etiquettes ?? [];
          return (
            <li key={o.id}>
              <div className="journal-entete">
                <button className="lien" onClick={() => ouvrirSymbole(o.symbole)}>
                  <strong>{ticker(o.symbole)}</strong>
                </button>
                <span className={o.sens === 'vente' ? 'hausse' : 'baisse'}>{o.sens === 'vente' ? 'Long' : 'Short'}</span>
                <span className="muet">{dateCourte(o.date)}</span>
                {o.origine && o.origine !== 'marche' && <span className="note">{origines[o.origine]}</span>}
                <div className="espace" />
                <strong className={(o.resultat ?? 0) >= 0 ? 'hausse' : 'baisse'}>
                  {formaterUsdt(o.resultat ?? 0, true)}
                  {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`}
                </strong>
              </div>
              <div className="journal-detail muet">
                {o.lots !== undefined ? formaterLots(o.lots) : formaterQuantite(o.quantite)} · entrée {o.prixEntree ? formaterCotation(o.symbole, o.prixEntree) : '—'} → sortie {formaterCotation(o.symbole, o.prix)} · frais{' '}
                {formaterUsdt(o.frais)}
              </div>
              <div className="journal-etiquettes">
                {etiquettes.map((e) => (
                  <span key={e} className="etiquette">
                    {e}
                    <button aria-label={`Retirer ${e}`} onClick={() => etiqueter(o.id, etiquettes.filter((x) => x !== e))}>
                      ×
                    </button>
                  </span>
                ))}
                <button className="lien discret" onClick={() => setEdition(edition === o.id ? null : o.id)}>
                  ＋ étiquette
                </button>
              </div>
              {edition === o.id && <ChoixEtiquettes actuelles={etiquettes} choisir={(e) => etiqueter(o.id, [...etiquettes, e])} fermer={() => setEdition(null)} />}
              <button className="journal-note" onClick={() => editerNote(o.id)}>
                {o.note ? o.note : 'Ajouter une note de journal…'}
              </button>
            </li>
          );
        })}
      </ul>
      {liste.length > visibles && (
        <button className="lien discret plus-positions" onClick={() => setVisibles((n) => n + 200)}>
          Afficher {Math.min(200, liste.length - visibles)} trades de plus ({liste.length - visibles} masqués)
        </button>
      )}
    </>
  );
}
