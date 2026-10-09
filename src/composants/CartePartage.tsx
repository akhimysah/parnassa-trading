import { useEffect, useRef, useState } from 'react';
import type { Operation } from '../types';
import { formaterCotation, instrument } from '../instruments';
import { formaterLots } from '../trading';
import { IconeCroix } from './Icones';

const L = 1200;
const H = 675;
const CLE_NOM = 'parnassa-trading:nom-certificat:v1';

export type SujetPartage = { type: 'trade'; operation: Operation } | { type: 'jour'; date: Date; operations: Operation[] };

const dollars = (v: number, signe = false) => {
  const a = Math.abs(v);
  const texte =
    a >= 1e9
      ? `${(a / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md$`
      : a >= 1e6
        ? `${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M$`
        : `${a.toLocaleString('fr-FR', { maximumFractionDigits: a >= 1000 ? 0 : 2 })} $`;
  return `${signe ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''}${texte}`;
};

function lireNom(): string {
  try {
    return localStorage.getItem(CLE_NOM) ?? '';
  } catch {
    return '';
  }
}

function dessiner(ctx: CanvasRenderingContext2D, sujet: SujetPartage, nom: string) {
  const vert = '#26d9a6';
  const rouge = '#ff5c6a';
  // Fond sombre et grille discrète
  const fond = ctx.createLinearGradient(0, 0, L, H);
  fond.addColorStop(0, '#0b0f1e');
  fond.addColorStop(1, '#161034');
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, L, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < L; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L, y);
    ctx.stroke();
  }

  const net =
    sujet.type === 'trade'
      ? (sujet.operation.resultat ?? 0) - sujet.operation.frais
      : sujet.operations.reduce((s, o) => s + (o.resultat ?? 0) - o.frais, 0);
  const couleur = net >= 0 ? vert : rouge;
  const halo = ctx.createRadialGradient(L * 0.3, H * 0.45, 20, L * 0.3, H * 0.45, 520);
  halo.addColorStop(0, net >= 0 ? 'rgba(38,217,166,0.22)' : 'rgba(255,92,106,0.22)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, L, H);

  // Marque
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Parnassa Trading', 70, 92);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 20px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(nom ? `par ${nom}` : 'trading papier', 70, 124);

  // Titre et chiffre principal
  let titre: string;
  let sous: string;
  if (sujet.type === 'trade') {
    const o = sujet.operation;
    const code = instrument(o.symbole)?.code ?? o.symbole.split(':').pop() ?? '';
    const long = o.sens === 'vente';
    titre = `${code} · ${long ? 'LONG' : 'SHORT'}${o.lots !== undefined ? ` · ${formaterLots(o.lots)}` : ''}`;
    sous = new Date(o.date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  } else {
    titre = `Ma journée de trading`;
    sous = sujet.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 38px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(titre, 70, 230);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '400 22px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(sous, 70, 266);
  ctx.fillStyle = couleur;
  ctx.font = '800 112px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(dollars(net, true), 64, 392, 640);

  // Détails
  const details: [string, string][] = [];
  if (sujet.type === 'trade') {
    const o = sujet.operation;
    const long = o.sens === 'vente';
    if (o.prixEntree) {
      details.push(['Entrée', formaterCotation(o.symbole, o.prixEntree)]);
      details.push(['Sortie', formaterCotation(o.symbole, o.prix)]);
      const mouvement = ((o.prix - o.prixEntree) / o.prixEntree) * 100 * (long ? 1 : -1);
      details.push(['Mouvement', `${mouvement >= 0 ? '+' : ''}${mouvement.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`]);
    } else details.push(['Prix', formaterCotation(o.symbole, o.prix)]);
  } else {
    const clotures = sujet.operations.filter((o) => o.type === 'cloture');
    const gagnants = clotures.filter((o) => (o.resultat ?? 0) > 0).length;
    const meilleur = clotures.reduce((m, o) => Math.max(m, (o.resultat ?? 0) - o.frais), -Infinity);
    details.push(['Trades', `${clotures.length}`]);
    details.push(['Réussite', clotures.length ? `${Math.round((gagnants / clotures.length) * 100)} %` : '—']);
    details.push(['Meilleur', Number.isFinite(meilleur) ? dollars(meilleur, true) : '—']);
  }
  details.forEach(([libelle, valeur], i) => {
    const x = 70 + i * 200;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 17px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(libelle.toUpperCase(), x, 470);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(valeur, x, 510, 185);
  });

  // Courbe de la journée (ou petite courbe stylisée du trade) à droite
  const zone = { x: 760, y: 180, l: 370, h: 300 };
  let points: number[];
  if (sujet.type === 'jour') {
    let c = 0;
    points = [0, ...sujet.operations.filter((o) => o.type === 'cloture').sort((a, b) => a.date - b.date).map((o) => (c += (o.resultat ?? 0) - o.frais))];
  } else {
    // Trajectoire illustrative de l'entrée à la sortie (le détail tick par tick n'est pas conservé).
    const fin = net >= 0 ? 1 : -1;
    points = [0, 0.15 * fin, -0.1 * fin, 0.35 * fin, 0.25 * fin, 0.6 * fin, 0.5 * fin, 0.85 * fin, fin];
  }
  if (points.length > 1) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const ecart = max - min || 1;
    const px = (i: number) => zone.x + (i / (points.length - 1)) * zone.l;
    const py = (v: number) => zone.y + (1 - (v - min) / ecart) * zone.h;
    const aire = ctx.createLinearGradient(0, zone.y, 0, zone.y + zone.h);
    aire.addColorStop(0, net >= 0 ? 'rgba(38,217,166,0.35)' : 'rgba(255,92,106,0.35)');
    aire.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    points.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
    ctx.lineTo(px(points.length - 1), zone.y + zone.h);
    ctx.lineTo(px(0), zone.y + zone.h);
    ctx.closePath();
    ctx.fillStyle = aire;
    ctx.fill();
    ctx.beginPath();
    points.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(points.length - 1), py(points[points.length - 1]!), 9, 0, Math.PI * 2);
    ctx.fillStyle = couleur;
    ctx.fill();
  }

  // Pied
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '400 18px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Compte de trading papier · akhimysah.github.io/parnassa-trading', 70, H - 50);
}

/** Carte image d'un trade ou d'une journée, à télécharger, partager ou copier. */
export function CartePartage({ sujet, fermer }: { sujet: SujetPartage; fermer: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nom = lireNom();

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) dessiner(ctx, sujet, nom.trim());
  }, [sujet, nom]);

  const image = () => new Promise<Blob | null>((ok) => (ref.current ? ref.current.toBlob((b) => ok(b), 'image/png') : ok(null)));
  const nomFichier = `parnassa-${sujet.type === 'trade' ? 'trade' : 'journee'}-${Date.now()}.png`;

  const telecharger = async () => {
    const b = await image();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const partager = async () => {
    const b = await image();
    if (!b) return;
    const f = new File([b], nomFichier, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: 'Mon trading sur Parnassa Trading' });
      else setMessage('Le partage direct n’est pas disponible ici : téléchargez ou copiez l’image.');
    } catch {
      // partage annulé
    }
  };
  const copier = async () => {
    const b = await image();
    if (!b) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      setMessage('Image copiée : collez-la dans une conversation.');
    } catch {
      setMessage('Copie d’image impossible dans ce navigateur : téléchargez-la.');
    }
  };

  return (
    <div className="voile" onMouseDown={fermer}>
      <div className="modale certificat" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Partager">
        <div className="modale-entete">
          <h2>{sujet.type === 'trade' ? 'Partager ce trade' : 'Partager ma journée'}</h2>
          <div className="espace" />
          <button className="icone" onClick={fermer} aria-label="Fermer">
            <IconeCroix />
          </button>
        </div>
        <div className="certificat-corps">
          <canvas ref={ref} width={L} height={H} aria-label="Carte à partager" />
          <div className="certificat-actions">
            <button className="bouton-principal" onClick={() => void telecharger()}>
              Télécharger
            </button>
            <button className="bouton-secondaire" onClick={() => void partager()}>
              Partager
            </button>
            <button className="bouton-secondaire" onClick={() => void copier()}>
              Copier l'image
            </button>
          </div>
          {message && <p className="muet petit">{message}</p>}
          <p className="muet petit">Le nom affiché est celui de vos certificats (modifiable depuis un certificat).</p>
        </div>
      </div>
    </div>
  );
}
