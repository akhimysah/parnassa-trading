import { useRef, useState } from 'react';
import type { Etat } from '../types';
import { exporterEtat, importerEtat } from '../stockage';
import { reinitialiser } from '../trading';
import { horodatageFichier, telecharger } from '../export';
import { notifier } from '../alertes';
import { IconeCroix } from './Icones';

interface Props {
  ouvert: boolean;
  fermer: () => void;
  etat: Etat;
  maj: (p: Partial<Etat>) => void;
  remplacerEtat: (e: Etat) => void;
  signaler: (message: string) => void;
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

export function Parametres({ ouvert, fermer, etat, maj, remplacerEtat, signaler }: Props) {
  const refFichier = useRef<HTMLInputElement>(null);
  const [capital, setCapital] = useState(String(etat.portefeuille.capitalInitial));
  const [erreur, setErreur] = useState<string | null>(null);
  if (!ouvert) return null;
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
            <h4>Trading papier</h4>
            <label className="ligne-parametre">
              <span>Frais par ordre</span>
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
