import { useMemo, useState } from 'react';
import type { Operation } from '../types';
import { formaterCotation, instrument } from '../instruments';
import { formaterLots, formaterUsdt } from '../trading';

interface Props {
  operations: Operation[];
  ouvrirSymbole: (id: string) => void;
}

interface Jour {
  net: number;
  trades: number;
  gagnants: number;
  operations: Operation[];
}

const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function cleJour(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function montantCourt(v: number): string {
  const abs = Math.abs(v);
  const texte = abs >= 10000 ? `${(abs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : abs.toLocaleString('fr-FR', { maximumFractionDigits: abs >= 100 ? 0 : 2 });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${texte} $`;
}

/**
 * Calendrier des trades : résultat net de chaque jour (clôtures, frais inclus), nombre de trades,
 * totaux par semaine et par mois ; un clic sur un jour affiche ses opérations.
 */
export function CalendrierTrades({ operations, ouvrirSymbole }: Props) {
  const [decalage, setDecalage] = useState(0);
  const [jourChoisi, setJourChoisi] = useState<string | null>(null);

  // Résultat par jour : clôtures (résultat − frais) et frais des ouvertures, comme le P&L réalisé.
  const parJour = useMemo(() => {
    const m = new Map<string, Jour>();
    for (const o of operations) {
      const cle = cleJour(new Date(o.date));
      const j = m.get(cle) ?? { net: 0, trades: 0, gagnants: 0, operations: [] };
      j.net += (o.resultat ?? 0) - o.frais;
      if (o.type === 'cloture') {
        j.trades += 1;
        if ((o.resultat ?? 0) > 0) j.gagnants += 1;
      }
      j.operations.push(o);
      m.set(cle, j);
    }
    return m;
  }, [operations]);

  const maintenant = new Date();
  const mois = new Date(maintenant.getFullYear(), maintenant.getMonth() + decalage, 1);
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const decalageDebut = (mois.getDay() + 6) % 7; // lundi = 0

  const cases: (Date | null)[] = [];
  for (let i = 0; i < decalageDebut; i++) cases.push(null);
  for (let d = 1; d <= nbJours; d++) cases.push(new Date(mois.getFullYear(), mois.getMonth(), d));
  while (cases.length % 7 !== 0) cases.push(null);
  const semaines: (Date | null)[][] = [];
  for (let i = 0; i < cases.length; i += 7) semaines.push(cases.slice(i, i + 7));

  const joursDuMois = cases.filter((d): d is Date => d !== null).map((d) => parJour.get(cleJour(d))).filter((j): j is Jour => Boolean(j));
  const totalMois = joursDuMois.reduce((s, j) => s + j.net, 0);
  const tradesMois = joursDuMois.reduce((s, j) => s + j.trades, 0);
  const gagnantsMois = joursDuMois.reduce((s, j) => s + j.gagnants, 0);
  const joursActifs = joursDuMois.filter((j) => j.operations.length > 0);
  const joursPositifs = joursActifs.filter((j) => j.net > 0).length;
  const meilleur = joursActifs.reduce<number | null>((m, j) => (m === null || j.net > m ? j.net : m), null);
  const pire = joursActifs.reduce<number | null>((m, j) => (m === null || j.net < m ? j.net : m), null);
  const echelle = Math.max(1, ...joursActifs.map((j) => Math.abs(j.net)));

  const detail = jourChoisi ? parJour.get(jourChoisi) : undefined;
  const dateDetail = jourChoisi ? cases.find((d) => d && cleJour(d) === jourChoisi) : null;

  return (
    <div className="carte calendrier-trades">
      <div className="ct-entete">
        <h3>Calendrier des trades</h3>
        <div className="ct-navigation">
          <button className="icone petit" onClick={() => setDecalage((d) => d - 1)} aria-label="Mois précédent">
            ‹
          </button>
          <strong>{mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
          <button className="icone petit" onClick={() => setDecalage((d) => d + 1)} aria-label="Mois suivant" disabled={decalage >= 0}>
            ›
          </button>
          {decalage !== 0 && (
            <button className="lien discret" onClick={() => setDecalage(0)}>
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      <div className="ct-resume">
        <div>
          <span>Résultat du mois</span>
          <strong className={totalMois > 0 ? 'hausse' : totalMois < 0 ? 'baisse' : ''}>{formaterUsdt(totalMois, true)}</strong>
        </div>
        <div>
          <span>Trades</span>
          <strong>{tradesMois}</strong>
          <em className="muet">{tradesMois ? `${Math.round((gagnantsMois / tradesMois) * 100)} % gagnants` : '—'}</em>
        </div>
        <div>
          <span>Jours tradés</span>
          <strong>{joursActifs.length}</strong>
          <em className="muet">{joursActifs.length ? `${joursPositifs} positif${joursPositifs > 1 ? 's' : ''}` : '—'}</em>
        </div>
        <div>
          <span>Meilleur / pire jour</span>
          <strong>
            <span className="hausse">{meilleur !== null ? montantCourt(meilleur) : '—'}</span>
            {' / '}
            <span className="baisse">{pire !== null ? montantCourt(pire) : '—'}</span>
          </strong>
        </div>
      </div>

      <div className="ct-grille" role="grid" aria-label="Résultat par jour">
        {[...JOURS_SEMAINE, 'Semaine'].map((j) => (
          <div key={j} className="ct-jour-semaine" role="columnheader">
            {j}
          </div>
        ))}
        {semaines.map((semaine, i) => {
          const joursSemaine = semaine.map((d) => (d ? parJour.get(cleJour(d)) : undefined)).filter((j): j is Jour => Boolean(j));
          const totalSemaine = joursSemaine.reduce((s, j) => s + j.net, 0);
          const tradesSemaine = joursSemaine.reduce((s, j) => s + j.trades, 0);
          return (
            <div key={i} className="ct-ligne" role="row">
              {semaine.map((d, k) => {
                if (!d) return <div key={k} className="ct-case vide" />;
                const cle = cleJour(d);
                const j = parJour.get(cle);
                const aujourdhui = cle === cleJour(maintenant);
                const intensite = j ? Math.min(1, Math.abs(j.net) / echelle) : 0;
                const fond = j && j.net !== 0 ? `rgba(${j.net > 0 ? '38, 166, 154' : '239, 83, 80'}, ${0.12 + intensite * 0.38})` : undefined;
                return (
                  <button
                    key={k}
                    className={`ct-case ${aujourdhui ? 'aujourdhui' : ''} ${jourChoisi === cle ? 'choisie' : ''} ${j ? 'active' : ''}`}
                    style={fond ? { background: fond } : undefined}
                    onClick={() => setJourChoisi(jourChoisi === cle ? null : cle)}
                    disabled={!j}
                    title={j ? `${d.toLocaleDateString('fr-FR')} : ${formaterUsdt(j.net, true)}, ${j.trades} trade(s)` : d.toLocaleDateString('fr-FR')}
                  >
                    <span className="ct-num">{d.getDate()}</span>
                    {j && (
                      <>
                        <strong className={j.net > 0 ? 'hausse' : j.net < 0 ? 'baisse' : ''}>{montantCourt(j.net)}</strong>
                        <span className="ct-trades">
                          {j.trades} trade{j.trades > 1 ? 's' : ''}
                          {j.trades > 0 && ` · ${Math.round((j.gagnants / j.trades) * 100)} %`}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              <div className={`ct-case semaine ${joursSemaine.length ? 'active' : ''}`}>
                {joursSemaine.length > 0 && (
                  <>
                    <strong className={totalSemaine > 0 ? 'hausse' : totalSemaine < 0 ? 'baisse' : ''}>{montantCourt(totalSemaine)}</strong>
                    <span className="ct-trades">
                      {tradesSemaine} trade{tradesSemaine > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detail && dateDetail && (
        <div className="ct-detail">
          <h4>
            {dateDetail.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            <span className={detail.net > 0 ? 'hausse' : detail.net < 0 ? 'baisse' : ''}>{formaterUsdt(detail.net, true)}</span>
          </h4>
          <ul>
            {[...detail.operations]
              .sort((a, b) => a.date - b.date)
              .map((o) => (
                <li key={o.id}>
                  <time>{new Date(o.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
                  <button className="lien" onClick={() => ouvrirSymbole(o.symbole)}>
                    {instrument(o.symbole)?.code ?? o.symbole.split(':').pop()}
                  </button>
                  <span className={o.sens === 'achat' ? 'hausse' : 'baisse'}>
                    {o.type === 'ouverture' ? 'Ouverture' : 'Clôture'} {o.sens === 'achat' ? 'achat' : 'vente'}
                  </span>
                  <span className="muet">{o.lots !== undefined ? formaterLots(o.lots) : `${o.quantite.toLocaleString('fr-FR', { maximumFractionDigits: 6 })} u.`}</span>
                  <span className="muet">
                    {o.type === 'cloture' && o.prixEntree ? `${formaterCotation(o.symbole, o.prixEntree)} → ` : ''}
                    {formaterCotation(o.symbole, o.prix)}
                  </span>
                  <strong className={o.resultat === undefined ? 'muet' : o.resultat >= 0 ? 'hausse' : 'baisse'}>
                    {o.resultat === undefined ? `frais ${formaterUsdt(o.frais)}` : formaterUsdt(o.resultat - o.frais, true)}
                  </strong>
                </li>
              ))}
          </ul>
        </div>
      )}
      {operations.length === 0 && <p className="vide">Le calendrier se remplit à chaque trade : résultat net du jour, nombre de trades et taux de réussite.</p>}
    </div>
  );
}
