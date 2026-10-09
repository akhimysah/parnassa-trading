import { useCallback, useEffect, useState } from 'react';
import { chargerClassement, type GestionCompte, type LigneClassement } from '../comptes';
import { formaterUsdt } from '../trading';

const MEDAILLES = ['🥇', '🥈', '🥉'];

function montantCourt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md$`;
  if (abs >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M$`;
  if (abs >= 1e4) return `${(v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k$`;
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`;
}

/** Classement public des comptes inscrits, et inscription du compte connecté sous un pseudo. */
export function ClassementTraders({ gestion, ouvrirComptes, signaler }: { gestion: GestionCompte; ouvrirComptes: () => void; signaler: (m: string) => void }) {
  const [lignes, setLignes] = useState<LigneClassement[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [tout, setTout] = useState(false);
  const session = gestion.session;
  const pseudo = session?.compte.pseudo ?? null;

  const charger = useCallback(async () => {
    const r = await chargerClassement();
    if (typeof r === 'string') setErreur(r);
    else {
      setLignes(r);
      setErreur(null);
    }
  }, []);

  useEffect(() => {
    void charger();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void charger();
    }, 60000);
    return () => window.clearInterval(t);
  }, [charger]);

  const inscrire = async (nouveau: string | null) => {
    setOccupe(true);
    const err = await gestion.changerPseudo(nouveau);
    setOccupe(false);
    if (err) return setErreur(err);
    setSaisie('');
    signaler(nouveau ? `Compte inscrit au classement sous « ${nouveau} »` : 'Compte retiré du classement');
    void charger();
  };

  const visibles = lignes ? (tout ? lignes : lignes.slice(0, 10)) : [];
  const moi = pseudo && lignes ? lignes.find((l) => l.pseudo === pseudo) : undefined;

  return (
    <div className="carte classement-traders">
      <div className="ct-entete">
        <h3>🏆 Classement des traders</h3>
        <span className="muet petit">performance réalisée (positions fermées) · mis à jour chaque minute</span>
      </div>

      <div className="cl-inscription">
        {!session ? (
          <>
            <span className="muet">Connectez-vous à un compte à accès pour y figurer sous un pseudo.</span>
            <button className="bouton-secondaire" onClick={ouvrirComptes}>
              Comptes et accès
            </button>
          </>
        ) : session.lecture ? (
          <span className="muet">Accès investisseur : seul le titulaire peut inscrire ce compte.</span>
        ) : pseudo ? (
          <>
            <span>
              Votre compte figure sous <strong>« {pseudo} »</strong>
              {moi ? ` · ${moi.rang}${moi.rang === 1 ? 'er' : 'e'} sur ${lignes?.length ?? 0}` : ''}
            </span>
            <button className="lien discret" disabled={occupe} onClick={() => void inscrire(null)}>
              Me retirer du classement
            </button>
          </>
        ) : (
          <form
            className="cl-formulaire"
            onSubmit={(e) => {
              e.preventDefault();
              if (saisie.trim()) void inscrire(saisie.trim());
            }}
          >
            <input className="champ" placeholder="Votre pseudo (3 à 20 caractères)" maxLength={20} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
            <button className="bouton-principal" type="submit" disabled={occupe || saisie.trim().length < 3}>
              Apparaître au classement
            </button>
            <span className="muet petit">Seuls le pseudo et les chiffres du compte sont publiés, jamais son numéro.</span>
          </form>
        )}
      </div>

      {erreur && <p className="erreur">{erreur}</p>}
      {lignes && lignes.length === 0 && <p className="vide">Personne encore : soyez le premier à vous inscrire.</p>}
      {visibles.length > 0 && (
        <div className="cl-tableau" role="table" aria-label="Classement des traders">
          <div className="cl-ligne cl-titres" role="row">
            <span>#</span>
            <span>Trader</span>
            <span>Performance</span>
            <span>Solde</span>
            <span>Trades</span>
          </div>
          {visibles.map((l) => (
            <div key={l.pseudo} className={`cl-ligne ${l.pseudo === pseudo ? 'moi' : ''} ${l.rang <= 3 ? 'podium' : ''}`} role="row">
              <span className="cl-rang">{MEDAILLES[l.rang - 1] ?? l.rang}</span>
              <span className="cl-trader">
                <strong>{l.pseudo}</strong>
                <span className="cl-badges">
                  <span className="lc-badge neutre">{l.type === 'challenge' ? (l.formule ?? 'Challenge') : `Démo ${montantCourt(l.capital)}`}</span>
                  {l.crame ? (
                    <span className="lc-badge echoue">Cramé 🔥</span>
                  ) : l.statut === 'reussi' ? (
                    <span className="lc-badge reussi">Réussi 🏆</span>
                  ) : l.statut === 'echoue' ? (
                    <span className="lc-badge echoue">Échoué</span>
                  ) : null}
                </span>
              </span>
              <strong className={l.performance > 0 ? 'hausse' : l.performance < 0 ? 'baisse' : ''}>
                {l.performance > 0 ? '+' : ''}
                {l.performance.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %
              </strong>
              <span title={formaterUsdt(l.balance)}>{montantCourt(l.balance)}</span>
              <span>{l.trades.toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}
      {lignes && lignes.length > 10 && (
        <button className="lien discret" onClick={() => setTout((x) => !x)}>
          {tout ? 'Voir le top 10' : `Voir les ${lignes.length} traders`}
        </button>
      )}
    </div>
  );
}
