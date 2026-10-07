import { useEffect } from 'react';
import type { Etat } from './types';
import { URL_ACTUALITES } from './actualites';

/** Préférences envoyées au relais : ce qui doit être notifié quand l'application est fermée. */
export function preferencesPush(etat: Etat) {
  const p = etat.parametres;
  return {
    langue: p.langueActualites === 'en' ? 'en' : 'fr',
    annonces: p.push.annonces,
    motsCles: p.motsCles,
    rappels: { ids: etat.rappels.map((r) => r.id), delaiMinutes: p.rappels.delaiMinutes, fortImpactAuto: p.rappels.fortImpactAuto },
    alertes: etat.alertes
      .filter((a) => !a.declencheeLe)
      .map((a) => ({ id: a.id, symbole: a.symbole, condition: a.condition, seuil: a.seuil, note: a.note })),
  };
}

export function pushDisponible(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone / iPad : le push n'existe que dans l'application installée sur l'écran d'accueil. */
export function iosHorsApplication(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installee = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !installee;
}

async function enregistrement(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
  if (!reg) throw new Error("Le service worker n'est pas actif (rechargez la page).");
  return reg;
}

function cleDepuisBase64Url(texte: string): ArrayBuffer {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texte.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

async function poster(chemin: string, corps: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${URL_ACTUALITES}${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const d = (await r.json()) as Record<string, unknown>;
  if (!r.ok || d.erreur) throw new Error(String(d.erreur ?? `Relais : ${r.status}`));
  return d;
}

export async function abonnementActuel(): Promise<PushSubscription | null> {
  if (!pushDisponible()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function activerPush(etat: Etat): Promise<void> {
  if (!pushDisponible()) throw new Error('Ce navigateur ne gère pas les notifications push.');
  if (iosHorsApplication()) throw new Error("Sur iPhone et iPad, ajoutez d'abord Parnassa Trading à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis activez le push depuis l'application.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées : autorisez-les dans les réglages du site.');
  const reg = await enregistrement();
  const { cle } = (await (await fetch(`${URL_ACTUALITES}/push/cle`)).json()) as { cle: string };
  const abonnement =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleDepuisBase64Url(cle) }));
  await poster('/push/abonnement', { abonnement: abonnement.toJSON(), preferences: preferencesPush(etat) });
  memoriserEnvoi(etat);
}

export async function desactiverPush(): Promise<void> {
  const abonnement = await abonnementActuel();
  if (!abonnement) return;
  await poster('/push/desabonnement', { endpoint: abonnement.endpoint }).catch(() => undefined);
  await abonnement.unsubscribe();
}

export async function testerPush(): Promise<string> {
  const abonnement = await abonnementActuel();
  if (!abonnement) throw new Error('Push non activé sur cet appareil.');
  const d = await poster('/push/test', { endpoint: abonnement.endpoint });
  return String(d.resultat);
}

const CLE_DERNIER_ENVOI = 'parnassa-trading:push-preferences:v1';
function memoriserEnvoi(etat: Etat) {
  try {
    localStorage.setItem(CLE_DERNIER_ENVOI, JSON.stringify(preferencesPush(etat)));
  } catch {
    // stockage indisponible
  }
}

/** Renvoie les préférences au relais quand elles changent (après 3 s de calme), si le push est actif. */
export function useSynchroPush(etat: Etat) {
  const actif = etat.parametres.push.actif;
  const empreinte = JSON.stringify(preferencesPush(etat));
  useEffect(() => {
    if (!actif || !pushDisponible()) return;
    let dernier: string | null = null;
    try {
      dernier = localStorage.getItem(CLE_DERNIER_ENVOI);
    } catch {
      dernier = null;
    }
    if (dernier === empreinte) return;
    const t = window.setTimeout(async () => {
      try {
        const abonnement = await abonnementActuel();
        if (!abonnement) return;
        await poster('/push/abonnement', { abonnement: abonnement.toJSON(), preferences: JSON.parse(empreinte) });
        localStorage.setItem(CLE_DERNIER_ENVOI, empreinte);
      } catch {
        // nouvel essai au prochain changement
      }
    }, 3000);
    return () => window.clearTimeout(t);
  }, [actif, empreinte]);
}
