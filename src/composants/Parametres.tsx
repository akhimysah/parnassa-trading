import { useEffect, useRef, useState } from 'react';
import type { Etat } from '../types';
import { exporterEtat, importerEtat } from '../stockage';
import { reinitialiser } from '../trading';
import { horodatageFichier, telecharger } from '../export';
import { notifier } from '../alertes';
import { abonnementActuel, activerPush, desactiverPush, iosHorsApplication, pushDisponible, testerPush } from '../push';
import { lienLiaison, type Synchro } from '../synchro';
import { IconeCroix } from './Icones';

interface Props {
  ouvert: boolean;
  fermer: () => void;
  etat: Etat;
  maj: (p: Partial<Etat>) => void;
  remplacerEtat: (e: Etat) => void;
  signaler: (message: string) => void;
  synchro: Synchro;
}

const FUSEAUX = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Zurich',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Etc/UTC',
];

export function Parametres({ ouvert, fermer, etat, maj, remplacerEtat, signaler, synchro }: Props) {
  const refFichier = useRef<HTMLInputElement>(null);
  const [capital, setCapital] = useState(String(etat.portefeuille.capitalInitial));
  const [erreur, setErreur] = useState<string | null>(null);
  const [etatPush, setEtatPush] = useState<'inconnu' | 'actif' | 'inactif'>('inconnu');
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    void abonnementActuel().then((a) => setEtatPush(a ? 'actif' : 'inactif'));
  }, [ouvert]);
  if (!ouvert) return null;

  const basculerPush = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      if (etatPush === 'actif') {
        await desactiverPush();
        maj({ parametres: { ...etat.parametres, push: { ...etat.parametres.push, actif: false } } });
        setEtatPush('inactif');
        signaler('Notifications push désactivées sur cet appareil');
      } else {
        await activerPush(etat);
        maj({ parametres: { ...etat.parametres, push: { ...etat.parametres.push, actif: true } } });
        setEtatPush('actif');
        signaler('Notifications push activées : vous serez prévenu même application fermée');
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Activation impossible.');
    } finally {
      setOccupe(false);
    }
  };
  const p = etat.parametres;

  const exporter = () => {
    telecharger(`parnassa-trading-sauvegarde-${horodatageFichier()}.json`, exporterEtat(etat), 'application/json');
    signaler('Sauvegarde téléchargée');
  };

  const importer = async (fichier: File) => {
    try {
      const texte = await fichier.text();
      const nouvel = importerEtat(texte);
      if (!window.confirm('Remplacer toutes les données actuelles (liste de suivi, alertes, portefeuille, réglages) par cette sauvegarde ?')) return;
      remplacerEtat(nouvel);
      setErreur(null);
      signaler('Sauvegarde restaurée');
      fermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible.');
    }
  };

  const changerCapital = () => {
    const v = Number(capital.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 100) {
      setErreur('Capital invalide (minimum 100 USDT).');
      return;
    }
    if (!window.confirm(`Repartir avec un portefeuille papier de ${v.toLocaleString('fr-FR')} USDT ? Positions, ordres et historique seront effacés.`)) return;
    maj({ portefeuille: reinitialiser(v) });
    setErreur(null);
    signaler('Portefeuille réinitialisé');
  };

  const testerNotification = async () => {
    if (!('Notification' in window)) {
      setErreur('Ce navigateur ne gère pas les notifications.');
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      setErreur('Notifications refusées par le navigateur : autorisez-les dans les réglages du site.');
      return;
    }
    notifier('Parnassa Trading', 'Les notifications fonctionnent.');
    setErreur(null);
  };

  const toutEffacer = () => {
    if (!window.confirm('Effacer toutes les données locales de Parnassa Trading et recharger ? Pensez à exporter une sauvegarde avant.')) return;
    try {
      localStorage.clear();
    } finally {
      window.location.hash = '';
      window.location.reload();
    }
  };

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale parametres" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Paramètres">
        <div className="modale-entete">
          <h2>Paramètres</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>

        <div className="parametres-corps">
          <section>
            <h4>Compte Parnassa · synchronisation</h4>
            {synchro.statut === 'deconnecte' ? (
              <>
                <p className="muet">
                  Reliez l'application à votre compte Parnassa pour sauvegarder en ligne votre portefeuille papier, vos challenges, alertes,
                  rappels et réglages, et les retrouver sur tous vos appareils.
                </p>
                <a className="bouton-principal lien-bouton" href={lienLiaison()}>
                  Se connecter avec Parnassa
                </a>
              </>
            ) : (
              <>
                <div className="ligne-parametre">
                  <span>
                    {synchro.compte ? (
                      <>
                        Relié à <strong>{synchro.compte.email}</strong>
                      </>
                    ) : (
                      'Connexion au compte…'
                    )}
                  </span>
                  <span className={`etat-synchro ${synchro.statut}`}>
                    {synchro.statut === 'a-jour' ? 'À jour' : synchro.statut === 'envoi' ? 'Envoi…' : synchro.statut === 'erreur' ? 'Erreur' : 'Connexion…'}
                  </span>
                </div>
                <p className="muet">
                  {synchro.derniereSynchro ? `Dernière synchronisation : ${new Date(synchro.derniereSynchro).toLocaleTimeString('fr-FR')}.` : ''}
                  {synchro.erreur ? ` ${synchro.erreur}` : ''}
                </p>
                <div className="boutons-parametres">
                  <button className="bouton-secondaire" onClick={synchro.synchroniser}>
                    Synchroniser maintenant
                  </button>
                  <button
                    className="bouton-secondaire danger"
                    onClick={() => {
                      if (window.confirm('Déconnecter le compte Parnassa de cet appareil ? Vos données restent sur cet appareil et sur le compte.')) void synchro.deconnecter();
                    }}
                  >
                    Déconnecter
                  </button>
                </div>
              </>
            )}
          </section>

          <section>
            <h4>Graphiques</h4>
            <label className="ligne-parametre">
              <span>Fuseau horaire</span>
              <select className="selecteur" value={p.fuseau} onChange={(e) => maj({ parametres: { ...p, fuseau: e.target.value } })}>
                {FUSEAUX.map((f) => (
                  <option key={f} value={f}>
                    {f.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h4>Alertes</h4>
            <label className="ligne-parametre">
              <span>Son au déclenchement</span>
              <input type="checkbox" checked={p.son} onChange={(e) => maj({ parametres: { ...p, son: e.target.checked } })} />
            </label>
            <label className="ligne-parametre">
              <span>Rappel avant un événement du calendrier</span>
              <select
                className="selecteur"
                value={p.rappels.delaiMinutes}
                onChange={(e) => maj({ parametres: { ...p, rappels: { ...p.rappels, delaiMinutes: Number(e.target.value) } } })}
              >
                {[1, 2, 5, 10, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min avant
                  </option>
                ))}
              </select>
            </label>
            <label className="ligne-parametre">
              <span>Rappel automatique des annonces à fort impact</span>
              <input type="checkbox" checked={p.rappels.fortImpactAuto} onChange={(e) => maj({ parametres: { ...p, rappels: { ...p.rappels, fortImpactAuto: e.target.checked } } })} />
            </label>
            <div className="ligne-parametre">
              <span>Notifications du navigateur</span>
              <button className="bouton-secondaire" onClick={() => void testerNotification()}>
                Tester
              </button>
            </div>
          </section>

          <section>
            <h4>Notifications push · application fermée</h4>
            {!pushDisponible() ? (
              <p className="muet">Ce navigateur ne gère pas les notifications push.</p>
            ) : (
              <>
                <div className="ligne-parametre">
                  <span>
                    Sur cet appareil :{' '}
                    <strong className={etatPush === 'actif' ? 'hausse' : ''}>{etatPush === 'actif' ? 'activées' : etatPush === 'inactif' ? 'désactivées' : '…'}</strong>
                  </span>
                  <span className="champ-unite">
                    {etatPush === 'actif' && (
                      <button
                        className="bouton-secondaire"
                        disabled={occupe}
                        onClick={async () => {
                          try {
                            const r = await testerPush();
                            signaler(r === 'ok' ? 'Notification de test envoyée' : `Échec de l'envoi (${r})`);
                          } catch (e) {
                            setErreur(e instanceof Error ? e.message : 'Test impossible.');
                          }
                        }}
                      >
                        Tester
                      </button>
                    )}
                    <button className={etatPush === 'actif' ? 'bouton-secondaire' : 'bouton-principal'} disabled={occupe || etatPush === 'inconnu'} onClick={() => void basculerPush()}>
                      {etatPush === 'actif' ? 'Désactiver' : 'Activer'}
                    </button>
                  </span>
                </div>
                <label className="ligne-parametre">
                  <span>Annonces FinancialJuice reçues</span>
                  <select
                    className="selecteur"
                    value={p.push.annonces}
                    onChange={(e) => maj({ parametres: { ...p, push: { ...p.push, annonces: e.target.value as 'aucune' | 'importantes' | 'toutes' } } })}
                  >
                    <option value="importantes">Importantes seulement</option>
                    <option value="toutes">Toutes</option>
                    <option value="aucune">Aucune (mots-clés seulement)</option>
                  </select>
                </label>
                <p className="muet">
                  Vous recevez aussi vos mots-clés surveillés, vos rappels d'événements (et les annonces à fort impact si l'option est cochée) et vos
                  alertes de prix crypto. Vérification toutes les 2 minutes.
                  {iosHorsApplication() && " Sur iPhone et iPad : ajoutez d'abord l'application à l'écran d'accueil."}
                </p>
              </>
            )}
          </section>

          <section>
            <h4>Trading papier</h4>
            <label className="ligne-parametre">
              <span>Frais par ordre (crypto ; les CFD sont à 0,005 %)</span>
              <span className="champ-unite">
                <input
                  inputMode="decimal"
                  value={(p.frais * 100).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(',', '.'));
                    if (Number.isFinite(v) && v >= 0 && v <= 5) maj({ parametres: { ...p, frais: v / 100 } });
                  }}
                />
                %
              </span>
            </label>
            <div className="ligne-parametre">
              <span>Capital de départ</span>
              <span className="champ-unite">
                <input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />
                USDT
                <button className="bouton-secondaire" onClick={changerCapital}>
                  Repartir
                </button>
              </span>
            </div>
          </section>

          <section>
            <h4>Données</h4>
            <p className="muet">Tout est conservé dans ce navigateur. Exportez une sauvegarde pour changer d'appareil ou archiver.</p>
            <div className="boutons-parametres">
              <button className="bouton-secondaire" onClick={exporter}>
                Exporter la sauvegarde (JSON)
              </button>
              <button className="bouton-secondaire" onClick={() => refFichier.current?.click()}>
                Restaurer une sauvegarde…
              </button>
              <input
                ref={refFichier}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importer(f);
                  e.target.value = '';
                }}
              />
              <button className="bouton-secondaire danger" onClick={toutEffacer}>
                Tout effacer
              </button>
            </div>
          </section>

          {erreur && <p className="erreur">{erreur}</p>}
        </div>

        <div className="modale-pied">
          <span className="muet petit-inline">Parnassa Trading · données de marché en direct</span>
          <div className="espace" />
          <button className="bouton-principal" onClick={fermer}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
