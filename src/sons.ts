/**
 * Sons d'exécution façon plateforme de trading (WebAudio, sans fichier) et vibration sur téléphone.
 * Chaque événement a sa signature : achat clair, vente grave, gain en carillon, perte sourde, trophée en fanfare.
 */
export type Evenement = 'achat' | 'vente' | 'gain' | 'perte' | 'trophee' | 'alerte';

type Note = [frequence: number, debut: number, duree: number, forme?: OscillatorType];

const PARTITIONS: Record<Evenement, { notes: Note[]; volume: number; vibration: number[] }> = {
  achat: { notes: [[988, 0, 0.09], [1319, 0.07, 0.14]], volume: 0.1, vibration: [25] },
  vente: { notes: [[659, 0, 0.09], [494, 0.07, 0.14]], volume: 0.1, vibration: [25] },
  gain: { notes: [[1047, 0, 0.12], [1319, 0.1, 0.12], [1568, 0.2, 0.25]], volume: 0.09, vibration: [20, 40, 20] },
  perte: { notes: [[220, 0, 0.25, 'triangle'], [165, 0.18, 0.3, 'triangle']], volume: 0.14, vibration: [80] },
  trophee: { notes: [[784, 0, 0.1], [988, 0.1, 0.1], [1175, 0.2, 0.1], [1568, 0.3, 0.4]], volume: 0.09, vibration: [30, 50, 30, 50, 60] },
  alerte: { notes: [[880, 0, 0.12], [1175, 0.12, 0.3]], volume: 0.11, vibration: [40, 60, 40] },
};

let contexte: AudioContext | null = null;

export function jouer(evenement: Evenement): void {
  const partition = PARTITIONS[evenement];
  try {
    contexte ??= new AudioContext();
    if (contexte.state === 'suspended') void contexte.resume();
    const t0 = contexte.currentTime + 0.01;
    for (const [frequence, debut, duree, forme] of partition.notes) {
      const osc = contexte.createOscillator();
      const gain = contexte.createGain();
      osc.type = forme ?? 'sine';
      osc.frequency.setValueAtTime(frequence, t0 + debut);
      gain.gain.setValueAtTime(0.0001, t0 + debut);
      gain.gain.exponentialRampToValueAtTime(partition.volume, t0 + debut + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + debut + duree);
      osc.connect(gain).connect(contexte.destination);
      osc.start(t0 + debut);
      osc.stop(t0 + debut + duree + 0.02);
    }
  } catch {
    // Audio indisponible : la notification visuelle suffit.
  }
  try {
    navigator.vibrate?.(partition.vibration);
  } catch {
    // pas de vibration
  }
}

/** Son d'un lot d'opérations nouvelles : clôtures → gain ou perte selon le total ; ouvertures → achat ou vente. */
export function sonDesOperations(nouvelles: { type: string; sens: string; resultat?: number; frais: number }[]): Evenement | null {
  const clotures = nouvelles.filter((o) => o.type === 'cloture');
  if (clotures.length) return clotures.reduce((s, o) => s + (o.resultat ?? 0) - o.frais, 0) >= 0 ? 'gain' : 'perte';
  const ouverture = nouvelles.find((o) => o.type === 'ouverture');
  if (ouverture) return ouverture.sens === 'achat' ? 'achat' : 'vente';
  return null;
}
