import { useCallback, useEffect, useState } from 'react';
import type { CompteDistant, TypeCompte } from '../compteLocal';
import { CAPITAUX, FORMULES, FORMULES_OUVERTES } from '../challenge';
import { CAPITAUX_DEMO, fermerCompteDistant, listerComptes, ouvrirCompte, regenererMotsDePasse, renommerCompte, SERVEURS, type Acces, type GestionCompte } from '../comptes';
import { lienLiaison } from '../synchro';
import { IconeCroix } from './Icones';

const montant = (v: number) => `${v.toLocaleString('fr-FR')} $`;
/** Montant demandé par un lien (?capital=…), gardé pendant la liaison au compte Parnassa. */
export const CLE_CAPITAL_DEMANDE = 'parnassa-trading:capital-demande';

/** Lit ?capital= dans l'adresse, le met de côté et l'efface de l'adresse. Vrai s'il y a un montant en attente. */
export function capitalDemande(): number | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('capital');
    if (v && /^\d{3,11}$/.test(v)) {
      sessionStorage.setItem(CLE_CAPITAL_DEMANDE, v);
      params.delete('capital');
      const reste = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${reste ? `?${reste}` : ''}${window.location.hash}`);
    }
    const garde = sessionStorage.getItem(CLE_CAPITAL_DEMANDE);
    return garde ? Number(garde) : null;
  } catch {
    return null;
  }
}

const CAPITAL_LIBRE_MIN = 100;
const CAPITAL_LIBRE_MAX = 10_000_000_000;

/** Bandeau du compte en cours, en haut de la page Trading. */
export function BarreCompte({ gestion, ouvrir }: { gestion: GestionCompte; ouvrir: () => void }) {
  const s = gestion.session;
  if (!s) {
    return (
      <div className="barre-compte">
        <span className="bc-pastille local" />
        <span>
          <strong>Compte local</strong> <span className="muet">· portefeuille de cet appareil</span>
        </span>
        <div className="espace" />
        <button className="bouton-secondaire" onClick={ouvrir}>
          Comptes et accès
        </button>
      </div>
    );
  }
  return (
    <div className={`barre-compte connecte ${s.lecture ? 'lecture' : ''}`}>
      <span className={`bc-pastille ${gestion.statut}`} title={gestion.erreur ?? undefined} />
      <span>
        <strong>
          {s.compte.nom} · n° {s.compte.login}
        </strong>{' '}
        <span className="muet">
          · {s.compte.serveur}
          {gestion.statut === 'envoi' ? ' · enregistrement…' : gestion.statut === 'erreur' ? ` · ${gestion.erreur ?? 'erreur'}` : ''}
        </span>
        {s.lecture && <span className="bc-lecture">Lecture seule (investisseur)</span>}
      </span>
      <div className="espace" />
      <button className="bouton-secondaire" onClick={ouvrir}>
        Comptes et accès
      </button>
      <button className="bouton-secondaire" onClick={() => void gestion.deconnecter()}>
        Déconnecter
      </button>
    </div>
  );
}

/** Solde, résultat et statut d'un compte dans la liste. */
function EtatCompte({ compte }: { compte: CompteDistant }) {
  const r = compte.resume;
  if (!r) return null; // serveur sans résumé
  if (r.balance === null) return <span className="lc-badge neutre">Jamais utilisé</span>;
  const resultat = r.balance - compte.capital;
  const pctRes = (resultat / compte.capital) * 100;
  return (
    <>
      <span className={`lc-resultat ${resultat > 0 ? 'hausse' : resultat < 0 ? 'baisse' : ''}`}>
        {montant(Math.round(r.balance))} ({pctRes >= 0 ? '+' : ''}
        {pctRes.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)
      </span>
      {r.crame ? (
        <span className="lc-badge echoue">Cramé 🔥</span>
      ) : r.statut === 'reussi' ? (
        <span className="lc-badge reussi">Réussi 🏆</span>
      ) : r.statut === 'echoue' ? (
        <span className="lc-badge echoue">Échoué</span>
      ) : r.statut === 'en-cours' ? (
        <span className="lc-badge en-cours">Challenge en cours</span>
      ) : null}
      {r.positions > 0 && (
        <span className="lc-badge neutre">
          {r.positions} position{r.positions > 1 ? 's' : ''}
        </span>
      )}
    </>
  );
}

/** Vue d'ensemble de tous les comptes. */
function SyntheseComptes({ comptes }: { comptes: CompteDistant[] }) {
  const utilises = comptes.filter((c) => c.resume?.balance !== null && c.resume?.balance !== undefined);
  const capital = comptes.reduce((s, c) => s + c.capital, 0);
  const resultat = utilises.reduce((s, c) => s + (c.resume!.balance! - c.capital), 0);
  const reussis = comptes.filter((c) => c.resume?.statut === 'reussi').length;
  const challenges = comptes.filter((c) => c.type === 'challenge').length;
  return (
    <div className="synthese-comptes">
      <div>
        <span>Comptes</span>
        <strong>{comptes.length}</strong>
      </div>
      <div>
        <span>Capital total</span>
        <strong>{montant(capital)}</strong>
      </div>
      <div>
        <span>Résultat cumulé</span>
        <strong className={resultat > 0 ? 'hausse' : resultat < 0 ? 'baisse' : ''}>
          {resultat >= 0 ? '+' : '−'}
          {montant(Math.abs(Math.round(resultat)))}
        </strong>
      </div>
      <div>
        <span>Challenges réussis</span>
        <strong>
          {reussis} / {challenges}
        </strong>
      </div>
    </div>
  );
}

function CarteAcces({ acces, nom, fermer }: { acces: Acces & { serveur: string }; nom: string; fermer: () => void }) {
  const [copie, setCopie] = useState<string | null>(null);
  const copier = (texte: string, quoi: string) => {
    void navigator.clipboard?.writeText(texte).then(() => {
      setCopie(quoi);
      window.setTimeout(() => setCopie(null), 1500);
    });
  };
  const tout = `Parnassa Trading · ${nom}\nServeur : ${acces.serveur}\nNuméro de compte : ${acces.login}\nMot de passe : ${acces.motDePasse}\nMot de passe investisseur (lecture seule) : ${acces.motDePasseInvestisseur}\n${window.location.origin}${window.location.pathname}`;
  const lignes: [string, string, string][] = [
    ['Serveur', acces.serveur, 'serveur'],
    ['Numéro de compte', acces.login, 'login'],
    ['Mot de passe', acces.motDePasse, 'mdp'],
    ['Mot de passe investisseur', acces.motDePasseInvestisseur, 'inv'],
  ];
  return (
    <div className="carte-acces" role="status">
      <div className="ca-entete">
        <strong>Accès de « {nom} »</strong>
        <button className="icone petit" onClick={fermer} aria-label="Masquer les accès">
          <IconeCroix />
        </button>
      </div>
      <p className="ca-avertissement">Notez-les maintenant : les mots de passe ne seront plus jamais affichés. En cas de perte, générez-en de nouveaux.</p>
      <dl>
        {lignes.map(([libelle, valeur, cle]) => (
          <div key={cle}>
            <dt>{libelle}</dt>
            <dd>
              <code>{valeur}</code>
              <button className="lien discret" onClick={() => copier(valeur, cle)}>
                {copie === cle ? 'Copié ✓' : 'Copier'}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <p className="muet petit">Le mot de passe investisseur permet de suivre le compte sans pouvoir trader : à partager avec un coach ou un ami.</p>
      <button className="bouton-secondaire" onClick={() => copier(tout, 'tout')}>
        {copie === 'tout' ? 'Accès copiés ✓' : 'Copier tous les accès'}
      </button>
    </div>
  );
}

/** Fenêtre « Comptes et accès » : connexion avec des accès, comptes du client, ouverture d'un compte. */
export function FenetreComptes({
  ouvert,
  fermer,
  gestion,
  lie,
  signaler,
  accesInitial,
}: {
  ouvert: boolean;
  fermer: () => void;
  gestion: GestionCompte;
  lie: boolean;
  signaler: (m: string) => void;
  /** Accès d'un compte ouvert ailleurs (phase suivante d'un challenge), à montrer une fois. */
  accesInitial?: { acces: Acces & { serveur: string }; nom: string } | null;
}) {
  const [login, setLogin] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [serveur, setServeur] = useState(SERVEURS[0]);
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [comptes, setComptes] = useState<CompteDistant[] | null>(null);
  const [max, setMax] = useState(20);
  const [erreurComptes, setErreurComptes] = useState<string | null>(null);
  const [acces, setAcces] = useState<{ acces: Acces & { serveur: string }; nom: string } | null>(null);
  const [type, setType] = useState<TypeCompte>('demo');
  const [formule, setFormule] = useState(FORMULES[0].id);
  const [capital, setCapital] = useState(100000);
  /** Montant libre (comptes démo), tel que saisi. */
  const [libre, setLibre] = useState('');
  const [nom, setNom] = useState('');

  const charger = useCallback(async () => {
    const r = await listerComptes();
    if (typeof r === 'string') {
      setErreurComptes(r);
      return;
    }
    setComptes(r.comptes);
    setMax(r.max);
    setErreurComptes(null);
  }, []);

  useEffect(() => {
    if (ouvert && lie) void charger();
  }, [ouvert, lie, charger]);

  useEffect(() => {
    if (accesInitial) setAcces(accesInitial);
  }, [accesInitial]);

  // Montant venu d'un lien : compte démo pré-rempli.
  useEffect(() => {
    if (!ouvert) return;
    const demande = capitalDemande();
    if (demande) {
      setType('demo');
      setCapital(demande);
      setLibre(demande.toLocaleString('fr-FR'));
    }
  }, [ouvert]);

  // Le login choisit le serveur : 5… démo, 7… challenge.
  useEffect(() => {
    if (/^5/.test(login)) setServeur('Parnassa-Demo');
    else if (/^7/.test(login)) setServeur('Parnassa-Challenge');
  }, [login]);

  if (!ouvert) return null;

  const seConnecter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{8}$/.test(login.trim()) || !motDePasse) {
      setErreurConnexion('Saisissez le numéro de compte (8 chiffres) et le mot de passe.');
      return;
    }
    setOccupe('connexion');
    const err = await gestion.connecterAvecAcces(login, motDePasse, serveur);
    setOccupe(null);
    setErreurConnexion(err);
    if (!err) {
      setMotDePasse('');
      fermer();
    }
  };

  const creer = async () => {
    const f = FORMULES.find((x) => x.id === formule)!;
    if (type === 'demo' && !(Number.isSafeInteger(capital) && capital >= CAPITAL_LIBRE_MIN && capital <= CAPITAL_LIBRE_MAX)) {
      setErreurComptes('Montant du compte démo : de 100 $ à 10 milliards de $, en dollars entiers.');
      return;
    }
    const demande = type === 'demo' ? { type, capital, nom: nom.trim() || undefined } : { type, capital, nom: nom.trim() || undefined, regles: { formule: f.nom, ...f.regles } };
    const resume = type === 'demo' ? `un compte démo de ${montant(capital)}` : `un compte challenge ${f.nom} de ${montant(capital)}`;
    if (!window.confirm(`Ouvrir ${resume} ?\n\nVous recevrez un numéro de compte, un mot de passe et un mot de passe investisseur, affichés une seule fois.`)) return;
    setOccupe('creation');
    const r = await ouvrirCompte(demande);
    setOccupe(null);
    if (typeof r === 'string') {
      setErreurComptes(r);
      return;
    }
    setAcces({ acces: { ...r.acces, serveur: r.compte.serveur }, nom: r.compte.nom });
    setNom('');
    setLibre('');
    // Le nouveau compte devient le compte actif tout de suite.
    const err = await gestion.connecterAvecAcces(r.acces.login, r.acces.motDePasse, r.compte.serveur);
    if (err) setErreurComptes(`Compte ouvert, mais connexion impossible : ${err}`);
    try {
      sessionStorage.removeItem(CLE_CAPITAL_DEMANDE);
    } catch {
      // stockage indisponible
    }
    if (lie) void charger();
  };

  const nouveauxMdp = async (c: CompteDistant) => {
    if (!window.confirm(`Générer de nouveaux mots de passe pour le compte ${c.login} ?\n\nLes anciens ne marcheront plus et tous les appareils connectés à ce compte seront déconnectés.`)) return;
    setOccupe(c.login);
    const r = await regenererMotsDePasse(c.login);
    setOccupe(null);
    if (typeof r === 'string') return setErreurComptes(r);
    setAcces({ acces: { ...r, serveur: c.serveur }, nom: c.nom });
  };

  const renommer = async (c: CompteDistant) => {
    const n = window.prompt('Nouveau nom du compte :', c.nom);
    if (!n || n.trim() === c.nom) return;
    const err = await renommerCompte(c.login, n);
    if (err) setErreurComptes(err);
    else void charger();
  };

  const fermerCompte = async (c: CompteDistant) => {
    if (!window.confirm(`Fermer définitivement le compte ${c.login} (« ${c.nom} ») ?\n\nSes accès ne marcheront plus et son historique sera effacé.`)) return;
    setOccupe(c.login);
    const err = await fermerCompteDistant(c.login);
    setOccupe(null);
    if (err) return setErreurComptes(err);
    if (gestion.session?.compte.login === c.login) await gestion.deconnecter('Compte fermé : retour au portefeuille de cet appareil.');
    void charger();
  };

  const seConnecterProprietaire = async (c: CompteDistant) => {
    setOccupe(c.login);
    const err = await gestion.connecterProprietaire(c.login);
    setOccupe(null);
    if (err) setErreurComptes(err);
    else fermer();
  };

  const capitaux = type === 'demo' ? CAPITAUX_DEMO : CAPITAUX;
  const blocCreation = (
      <div className="ct-creation">
        <div className="pc-capital">
          <button className={`puce-bascule ${type === 'demo' ? 'actif' : ''}`} onClick={() => setType('demo')}>
            Démo
          </button>
          <button
            className={`puce-bascule ${type === 'challenge' ? 'actif' : ''}`}
            disabled={!lie}
            title={lie ? undefined : 'Les comptes challenge s’ouvrent avec un compte Parnassa relié.'}
            onClick={() => {
              setType('challenge');
              setLibre('');
              if (!CAPITAUX.includes(capital)) setCapital(100000);
            }}
          >
            Challenge prop firm
          </button>
        </div>
        {type === 'challenge' && (
          <div className="pc-formules">
            {FORMULES_OUVERTES.map((f) => (
              <button key={f.id} className={`pc-formule ${formule === f.id ? 'actif' : ''}`} onClick={() => setFormule(f.id)}>
                <strong>{f.nom}</strong>
                <span className="muet">{f.description}</span>
              </button>
            ))}
          </div>
        )}
        <div className="pc-capital">
          <span className="muet">Capital</span>
          {capitaux.map((c) => (
            <button
              key={c}
              className={`puce-bascule ${capital === c && !libre ? 'actif' : ''}`}
              onClick={() => {
                setCapital(c);
                setLibre('');
              }}
            >
              {c >= 1000000 ? `${c / 1000000} M$` : `${(c / 1000).toLocaleString('fr-FR')} k$`}
            </button>
          ))}
        </div>
        {type === 'demo' && (
          <div className="pc-capital">
            <span className="muet">Ou montant libre</span>
            <input
              className="champ champ-montant"
              inputMode="numeric"
              placeholder="ex. 2 431 029 210"
              value={libre}
              onChange={(e) => {
                const chiffres = e.target.value.replace(/\D/g, '').slice(0, 11);
                setLibre(chiffres ? Number(chiffres).toLocaleString('fr-FR') : '');
                if (chiffres) setCapital(Number(chiffres));
                else setCapital(100000);
              }}
            />
            <span className="muet">$ (de 100 $ à 10 milliards)</span>
          </div>
        )}
        <div className="pc-capital">
          <input className="champ" placeholder="Nom du compte (facultatif)" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button className="bouton-principal" onClick={() => void creer()} disabled={occupe === 'creation'}>
            {occupe === 'creation' ? 'Ouverture…' : 'Ouvrir le compte'}
          </button>
        </div>
      </div>
  );

  const actif = gestion.session?.compte.login;

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale comptes-trading" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Comptes et accès">
        <div className="modale-entete">
          <h2>Comptes et accès</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="parametres-corps">
          {acces && <CarteAcces acces={acces.acces} nom={acces.nom} fermer={() => setAcces(null)} />}

          <section>
            <h4>Se connecter à un compte</h4>
            <form className="ct-connexion" onSubmit={(e) => void seConnecter(e)} autoComplete="on">
              <label>
                <span>Numéro de compte</span>
                <input
                  className="champ"
                  inputMode="numeric"
                  autoComplete="username"
                  maxLength={8}
                  placeholder="5xxxxxxx"
                  value={login}
                  onChange={(e) => setLogin(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              <label>
                <span>Mot de passe</span>
                <input className="champ" type="password" autoComplete="current-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
              </label>
              <label>
                <span>Serveur</span>
                <select className="selecteur" value={serveur} onChange={(e) => setServeur(e.target.value)}>
                  {SERVEURS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <button className="bouton-principal" type="submit" disabled={occupe === 'connexion'}>
                {occupe === 'connexion' ? 'Connexion…' : 'Connexion'}
              </button>
            </form>
            {erreurConnexion && <p className="erreur">{erreurConnexion}</p>}
            <p className="muet petit">
              Mot de passe principal : trading complet. Mot de passe investisseur : lecture seule. Votre portefeuille local est mis de côté et revient à la
              déconnexion.
            </p>
          </section>

          <section>
            <h4>Ouvrir un compte</h4>
            {lie && comptes && comptes.length >= max ? <p className="muet">{max} comptes ouverts au plus : fermez-en un pour en ouvrir un autre.</p> : blocCreation}
            {erreurComptes && <p className="erreur">{erreurComptes}</p>}
            {!lie && (
              <p className="muet petit">
                Sans compte Parnassa, le compte démo s'ouvre tout de suite : gardez bien ses accès, ce sont eux qui permettent d'y revenir depuis un autre
                appareil.
              </p>
            )}
          </section>

          <section>
            <h4>Mes comptes</h4>
            {!lie ? (
              <>
                <p className="muet">
                  Reliez l'application à votre compte Parnassa pour retrouver tous vos comptes ici, ouvrir des challenges et changer les mots de passe.
                </p>
                <a className="bouton-secondaire lien-bouton" href={lienLiaison()}>
                  Se connecter avec Parnassa
                </a>
              </>
            ) : comptes === null ? (
              <p className="muet">{erreurComptes ?? 'Chargement…'}</p>
            ) : (
              <>
                {comptes.length === 0 && <p className="muet">Aucun compte pour l'instant : ouvrez-en un ci-dessous.</p>}
                {comptes.length > 0 && <SyntheseComptes comptes={comptes} />}
                <ul className="liste-comptes">
                  {comptes.map((c) => (
                    <li key={c.login} className={actif === c.login ? 'actif' : ''}>
                      <div className="lc-infos">
                        <strong>{c.nom}</strong>
                        <div className="lc-etat">
                          <EtatCompte compte={c} />
                        </div>
                        <span className="muet">
                          n° {c.login} · {c.serveur} · {montant(c.capital)}
                          {c.regles ? ` · objectif +${c.regles.objectifPct} %, perte max ${c.regles.perteMaxPct} %` : ''}
                        </span>
                        <span className="muet petit">
                          Ouvert le {new Date(c.creeLe).toLocaleDateString('fr-FR')}
                          {c.derniereConnexion ? ` · dernière connexion ${new Date(c.derniereConnexion).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                        </span>
                      </div>
                      <div className="lc-actions">
                        {actif === c.login ? (
                          <span className="pc-statut reussi">Connecté</span>
                        ) : (
                          <button className="bouton-principal" disabled={occupe === c.login} onClick={() => void seConnecterProprietaire(c)}>
                            Trader
                          </button>
                        )}
                        <button className="lien discret" onClick={() => void nouveauxMdp(c)} disabled={occupe === c.login}>
                          Nouveaux mots de passe
                        </button>
                        <button className="lien discret" onClick={() => void renommer(c)}>
                          Renommer
                        </button>
                        <button className="lien discret danger" onClick={() => void fermerCompte(c)} disabled={occupe === c.login}>
                          Fermer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
