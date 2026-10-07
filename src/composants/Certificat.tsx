import { useEffect, useRef, useState } from 'react';
import type { Challenge } from '../types';
import { formuleSuivante, reglesCompletes } from '../challenge';
import { IconeCroix } from './Icones';

const CLE_NOM = 'parnassa-trading:nom-certificat:v1';
const L = 1600;
const H = 1000;

function lireNom(): string {
  try {
    return localStorage.getItem(CLE_NOM) ?? '';
  } catch {
    return '';
  }
}

const euros = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`;

/** Numéro de certificat stable, tiré de l'identifiant du challenge. */
export function numeroCertificat(ch: Challenge): string {
  let h = 2166136261;
  for (const c of ch.id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `PT-${new Date(ch.finLe ?? ch.debutLe).getFullYear()}-${(h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
}

function dessiner(ctx: CanvasRenderingContext2D, ch: Challenge, nom: string, login?: string) {
  const r = reglesCompletes(ch.regles);
  const finance = !formuleSuivante(r.formule);
  const gain = (ch.capitalFin ?? r.capital) - r.capital;
  const or = ctx.createLinearGradient(0, 0, L, H);
  or.addColorStop(0, '#f6e27a');
  or.addColorStop(0.5, '#d4a72c');
  or.addColorStop(1, '#f3d36b');

  // Fond
  const fond = ctx.createLinearGradient(0, 0, L, H);
  fond.addColorStop(0, '#120c2e');
  fond.addColorStop(0.55, '#2a1663');
  fond.addColorStop(1, '#0d1b3d');
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, L, H);
  // Halo et courbe de marché en filigrane
  const halo = ctx.createRadialGradient(L * 0.5, H * 0.32, 40, L * 0.5, H * 0.32, 620);
  halo.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
  halo.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, L, H);
  ctx.strokeStyle = 'rgba(38, 166, 154, 0.18)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  let y = H * 0.78;
  for (let x = 0; x <= L; x += 40) {
    y += Math.sin(x / 90) * 14 - 7;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Doubles bordures dorées
  ctx.strokeStyle = or;
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 36, L - 72, H - 72);
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, L - 112, H - 112);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Marque
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 26px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('P A R N A S S A   T R A D I N G', L / 2, 140);
  // Titre
  ctx.fillStyle = or;
  ctx.font = 'italic 700 76px Georgia, "Times New Roman", serif';
  ctx.fillText(finance ? 'Trader financé' : 'Certificat de réussite', L / 2, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '400 28px Georgia, serif';
  ctx.fillText('décerné à', L / 2, 305);
  // Nom
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 84px Georgia, "Times New Roman", serif';
  ctx.fillText(nom || 'Trader Parnassa', L / 2, 405, L - 300);
  ctx.fillStyle = or;
  ctx.fillRect(L / 2 - 260, 432, 520, 3);
  // Phrase
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '400 30px Georgia, serif';
  ctx.fillText(`pour avoir réussi le challenge « ${r.formule} »`, L / 2, 495, L - 260);
  ctx.fillText(
    finance ? 'et obtenu le statut de trader financé Parnassa.' : `en respectant toutes les règles de gestion du risque${formuleSuivante(r.formule) ? ' : accès à la phase suivante.' : '.'}`,
    L / 2,
    540,
    L - 260,
  );

  // Chiffres
  const jours = Math.max(1, Math.round(((ch.finLe ?? Date.now()) - ch.debutLe) / 86400000));
  const cases: [string, string][] = [
    ['Capital', euros(r.capital)],
    ['Profit', `+${euros(gain)}`],
    ['Performance', `+${((gain / r.capital) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`],
    ['Durée', `${jours} jour${jours > 1 ? 's' : ''}`],
  ];
  const largeur = 270;
  const x0 = L / 2 - (cases.length * largeur + (cases.length - 1) * 24) / 2;
  cases.forEach(([libelle, valeur], i) => {
    const x = x0 + i * (largeur + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(246, 226, 122, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, 600, largeur, 120, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 20px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(libelle.toUpperCase(), x + largeur / 2, 645);
    ctx.fillStyle = i === 1 || i === 2 ? '#4ade80' : '#ffffff';
    ctx.font = '700 38px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(valeur, x + largeur / 2, 695, largeur - 20);
  });

  // Pied : date, numéro, sceau
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '400 22px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`Validé le ${new Date(ch.finLe ?? Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 130, 850);
  ctx.fillText(`Certificat n° ${numeroCertificat(ch)}${login ? ` · compte ${login}` : ''}`, 130, 885);
  ctx.textAlign = 'right';
  ctx.font = 'italic 400 34px Georgia, serif';
  ctx.fillStyle = or;
  ctx.fillText('Parnassa', L - 330, 860);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(L - 560, 875, 230, 1.5);
  ctx.font = '400 18px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Direction du risque', L - 330, 905);

  // Sceau
  const sx = L - 180;
  const sy = 860;
  ctx.fillStyle = or;
  ctx.beginPath();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = i % 2 === 0 ? 92 : 82;
    const px = sx + Math.cos(a) * rr;
    const py = sy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a1663';
  ctx.beginPath();
  ctx.arc(sx, sy, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = or;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = or;
  ctx.font = '700 50px Georgia, serif';
  ctx.fillText('✓', sx, sy + 4);
  ctx.font = '700 15px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(finance ? 'FINANCÉ' : 'VALIDÉ', sx, sy + 32);
}

/** Certificat de réussite d'un challenge : aperçu, nom du trader, téléchargement et partage. */
export function Certificat({ challenge, login, fermer }: { challenge: Challenge; login?: string; fermer: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [nom, setNom] = useState(lireNom);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) dessiner(ctx, challenge, nom.trim(), login);
    try {
      localStorage.setItem(CLE_NOM, nom);
    } catch {
      // stockage indisponible
    }
  }, [challenge, nom, login]);

  const fichier = () =>
    new Promise<File | null>((ok) => ref.current?.toBlob((b) => ok(b ? new File([b], `certificat-parnassa-${numeroCertificat(challenge)}.png`, { type: 'image/png' }) : null), 'image/png') ?? ok(null));

  const telecharger = async () => {
    const f = await fichier();
    if (!f) return;
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const partager = async () => {
    const f = await fichier();
    if (!f) return;
    const texte = `🏆 Challenge ${challenge.regles.formule} réussi sur Parnassa Trading !`;
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: texte });
      else {
        await navigator.clipboard.writeText(texte);
        setMessage('Partage d’image non pris en charge ici : texte copié, téléchargez l’image pour la joindre.');
      }
    } catch {
      // partage annulé
    }
  };

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale certificat" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Certificat de réussite">
        <div className="modale-entete">
          <h2>Certificat de réussite</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="certificat-corps">
          <canvas ref={ref} width={L} height={H} aria-label={`Certificat du challenge ${challenge.regles.formule}`} />
          <div className="certificat-actions">
            <input className="champ" placeholder="Votre nom sur le certificat" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} />
            <button className="bouton-principal" onClick={() => void telecharger()}>
              Télécharger
            </button>
            <button className="bouton-secondaire" onClick={() => void partager()}>
              Partager
            </button>
          </div>
          {message && <p className="muet petit">{message}</p>}
        </div>
      </div>
    </div>
  );
}
