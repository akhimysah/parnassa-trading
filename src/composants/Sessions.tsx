import { useEffect, useState } from 'react';

interface Place {
  nom: string;
  fuseau: string;
  ouverture: number; // minutes depuis minuit, heure locale de la place
  fermeture: number;
}

const PLACES: Place[] = [
  { nom: 'Sydney', fuseau: 'Australia/Sydney', ouverture: 10 * 60, fermeture: 16 * 60 },
  { nom: 'Tokyo', fuseau: 'Asia/Tokyo', ouverture: 9 * 60, fermeture: 15 * 60 + 30 },
  { nom: 'Hong Kong', fuseau: 'Asia/Hong_Kong', ouverture: 9 * 60 + 30, fermeture: 16 * 60 },
  { nom: 'Francfort', fuseau: 'Europe/Berlin', ouverture: 9 * 60, fermeture: 17 * 60 + 30 },
  { nom: 'Paris', fuseau: 'Europe/Paris', ouverture: 9 * 60, fermeture: 17 * 60 + 30 },
  { nom: 'Londres', fuseau: 'Europe/London', ouverture: 8 * 60, fermeture: 16 * 60 + 30 },
  { nom: 'New York', fuseau: 'America/New_York', ouverture: 9 * 60 + 30, fermeture: 16 * 60 },
];

/** Heure locale d'une place : jour de semaine (0 = dimanche) et minutes depuis minuit. */
function heureLocale(fuseau: string, date: Date): { jour: number; minutes: number; texte: string } {
  const morceaux = new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const val = (t: string) => morceaux.find((m) => m.type === t)?.value ?? '';
  const jours = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const h = Number(val('hour')) % 24;
  const m = Number(val('minute'));
  return { jour: jours.indexOf(val('weekday')), minutes: h * 60 + m, texte: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

function duree(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Statut d'une place (jours fériés non pris en compte) et délai avant le prochain changement. */
function statut(p: Place, maintenant: Date): { ouverte: boolean; detail: string; heure: string } {
  const { jour, minutes, texte } = heureLocale(p.fuseau, maintenant);
  const ouvre = jour >= 1 && jour <= 5;
  if (ouvre && minutes >= p.ouverture && minutes < p.fermeture) return { ouverte: true, detail: `ferme dans ${duree(p.fermeture - minutes)}`, heure: texte };
  let attente: number;
  if (ouvre && minutes < p.ouverture) attente = p.ouverture - minutes;
  else {
    // Prochain jour ouvré.
    let jours = 1;
    let j = (jour + 1) % 7;
    while (j === 0 || j === 6) {
      jours += 1;
      j = (j + 1) % 7;
    }
    attente = jours * 1440 - minutes + p.ouverture;
  }
  return { ouverte: false, detail: `ouvre dans ${duree(attente)}`, heure: texte };
}

/** Bandeau des grandes places boursières : ouvertes / fermées, heure locale et compte à rebours. */
export function Sessions() {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="sessions" aria-label="Sessions de marché">
      {PLACES.map((p) => {
        const s = statut(p, maintenant);
        return (
          <span key={p.nom} className={`session ${s.ouverte ? 'ouverte' : ''}`} title={`${p.nom} · ${s.heure} heure locale · ${s.detail} (jours fériés non pris en compte)`}>
            <i aria-hidden />
            {p.nom}
            <em>{s.detail.replace('ferme dans ', '−').replace('ouvre dans ', '+')}</em>
          </span>
        );
      })}
    </div>
  );
}
