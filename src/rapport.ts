import type { Etat } from './types';
import { statistiques } from './trading';
import { analyser } from './analyse';
import { statsParEtiquette } from './journal';
import { instrument } from './instruments';
import { reglesCompletes } from './challenge';

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const usd = (v: number, signe = false) =>
  `${signe && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
const classe = (v: number) => (v > 0 ? 'g' : v < 0 ? 'p' : '');
const code = (s: string) => echapper(instrument(s)?.code ?? s.split(':').pop() ?? s);
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Rapport de performance imprimable (HTML autonome, à enregistrer en PDF). */
export function genererRapport(etat: Etat, capital: number, compte?: { login: string; serveur: string; nom: string } | null): string {
  const p = etat.portefeuille;
  const s = statistiques(p);
  const a = analyser(p);
  const etiquettes = statsParEtiquette(p.operations);
  const clotures = p.operations.filter((o) => o.type === 'cloture').sort((x, y) => x.date - y.date);
  const debut = clotures[0]?.date ?? p.historiqueCapital[0]?.t ?? Date.now();
  const perf = ((capital - p.capitalInitial) / p.capitalInitial) * 100;
  const ch = etat.challenge;

  // Courbe du réalisé cumulé (SVG en ligne).
  const L = 720;
  const H = 180;
  const valeurs = [0, ...a.courbe.map((c) => c.cumul)];
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const ecart = max - min || 1;
  const x = (i: number) => 10 + (i / Math.max(1, valeurs.length - 1)) * (L - 20);
  const y = (v: number) => 10 + (1 - (v - min) / ecart) * (H - 30);
  const trace = valeurs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const courbe = a.courbe.length
    ? `<svg viewBox="0 0 ${L} ${H}" width="100%" role="img" aria-label="Résultat réalisé cumulé">
        <line x1="10" x2="${L - 10}" y1="${y(0)}" y2="${y(0)}" stroke="#999" stroke-dasharray="4 4"/>
        <path d="${trace}" fill="none" stroke="#5b3fd6" stroke-width="2.5" stroke-linejoin="round"/>
        <text x="10" y="${H - 4}" font-size="11" fill="#777">trade 1</text>
        <text x="${L - 10}" y="${H - 4}" font-size="11" fill="#777" text-anchor="end">trade ${a.courbe.length}</text>
      </svg>`
    : '<p class="muet">Aucun trade clôturé.</p>';

  const tuiles: [string, string, string?][] = [
    ['Capital de départ', usd(p.capitalInitial)],
    ['Fonds propres', usd(capital), `${perf >= 0 ? '+' : ''}${pct(perf)}`],
    ['Résultat réalisé', usd(s.netFraisInclus, true), `dont ${usd(s.fraisTotaux)} de frais`],
    ['Trades clôturés', String(s.nbTrades), `${pct(s.tauxReussite)} gagnants`],
    ['Profit factor', s.profitFactor !== null ? s.profitFactor.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'],
    ['Espérance par trade', usd(a.esperance, true)],
    ['Drawdown maximal', a.drawdown ? `−${usd(a.drawdown.montant)}` : '—', a.drawdown?.pct != null ? pct(a.drawdown.pct) : undefined],
    ['Gain moyen ÷ perte moyenne', a.ratioGainPerte !== null ? a.ratioGainPerte.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'],
  ];

  const ligne = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const parPaire = s.parPaire.map((l) => ligne([code(l.symbole), String(l.nb), `<span class="${classe(l.net)}">${usd(l.net, true)}</span>`])).join('');
  const parEtiquette = etiquettes
    .map((e) => ligne([echapper(e.etiquette), String(e.nb), pct((e.gagnants / e.nb) * 100), `<span class="${classe(e.net)}">${usd(e.net, true)}</span>`]))
    .join('');
  const parJour = a.parJour
    .map((g, i) => (g.nb ? ligne([JOURS[i]!, String(g.nb), pct((g.gagnants / g.nb) * 100), `<span class="${classe(g.net)}">${usd(g.net, true)}</span>`]) : ''))
    .join('');
  const derniers = clotures
    .slice(-30)
    .reverse()
    .map((o) =>
      ligne([
        new Date(o.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
        code(o.symbole),
        o.sens === 'vente' ? 'Long' : 'Short',
        o.lots !== undefined ? o.lots.toLocaleString('fr-FR') : '—',
        `<span class="${classe((o.resultat ?? 0) - o.frais)}">${usd((o.resultat ?? 0) - o.frais, true)}</span>`,
        echapper((o.etiquettes ?? []).join(', ')),
      ]),
    )
    .join('');

  const challenge = ch
    ? `<p><strong>${echapper(reglesCompletes(ch.regles).formule)}</strong> · capital ${usd(ch.regles.capital)} · statut : ${ch.statut === 'en-cours' ? 'en cours' : ch.statut === 'reussi' ? 'réussi' : 'échoué'}${ch.raison ? ` — ${echapper(ch.raison)}` : ''}</p>`
    : '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Rapport de performance · Parnassa Trading</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1b29; margin: 0; padding: 28px; background: #fff; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 14px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .5px; color: #5b3fd6; }
  .entete { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #5b3fd6; padding-bottom: 10px; }
  .muet { color: #6b6880; } .g { color: #0f8a6a; font-weight: 600; } .p { color: #c8323f; font-weight: 600; }
  .tuiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
  .tuiles div { border: 1px solid #e2def2; border-radius: 8px; padding: 8px 10px; }
  .tuiles span { display: block; font-size: 10px; text-transform: uppercase; color: #6b6880; }
  .tuiles strong { font-size: 16px; } .tuiles em { display: block; font-style: normal; color: #6b6880; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; } td, th { text-align: left; padding: 5px 6px; border-bottom: 1px solid #eee; }
  th { font-size: 10px; text-transform: uppercase; color: #6b6880; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .pied { margin-top: 26px; font-size: 11px; color: #6b6880; border-top: 1px solid #eee; padding-top: 8px; }
  .barre-impression { display: flex; justify-content: flex-end; margin-bottom: 12px; }
  .imprimer { padding: 8px 14px; border-radius: 8px; border: 0; background: #5b3fd6; color: #fff; font: inherit; cursor: pointer; }
  @media print { .barre-impression { display: none; } body { padding: 0; } h2 { break-after: avoid; } table, svg { break-inside: avoid; } }
  @media (max-width: 640px) { .tuiles { grid-template-columns: 1fr 1fr; } .deux { grid-template-columns: 1fr; } body { padding: 14px; } }
</style></head>
<body>
<div class="barre-impression"><button class="imprimer" onclick="window.print()">Enregistrer en PDF</button></div>
<div class="entete">
  <div><h1>Rapport de performance</h1><div class="muet">Parnassa Trading · compte de trading papier</div></div>
  <div class="muet" style="text-align:right">${compte ? `${echapper(compte.nom)} · n° ${echapper(compte.login)} · ${echapper(compte.serveur)}<br>` : 'Compte local<br>'}du ${new Date(debut).toLocaleDateString('fr-FR')} au ${new Date().toLocaleDateString('fr-FR')}</div>
</div>
${challenge}
<div class="tuiles">${tuiles.map(([l, v, e]) => `<div><span>${l}</span><strong>${v}</strong>${e ? `<em>${e}</em>` : ''}</div>`).join('')}</div>
<h2>Résultat réalisé cumulé</h2>${courbe}
<div class="deux">
  <div><h2>Par instrument</h2><table><tr><th>Instrument</th><th>Trades</th><th>Résultat</th></tr>${parPaire || ligne(['—', '', ''])}</table></div>
  <div><h2>Par jour de la semaine</h2><table><tr><th>Jour</th><th>Trades</th><th>Réussite</th><th>Résultat</th></tr>${parJour || ligne(['—', '', '', ''])}</table></div>
</div>
${etiquettes.length ? `<h2>Par étiquette</h2><table><tr><th>Étiquette</th><th>Trades</th><th>Réussite</th><th>Résultat</th></tr>${parEtiquette}</table>` : ''}
<h2>Derniers trades</h2><table><tr><th>Date</th><th>Instrument</th><th>Sens</th><th>Lots</th><th>Résultat net</th><th>Étiquettes</th></tr>${derniers || ligne(['—', '', '', '', '', ''])}</table>
<div class="pied">Généré le ${new Date().toLocaleString('fr-FR')} · Parnassa Trading · trading papier, aucun ordre réel. Résultats après frais de clôture.</div>
</body></html>`;
}

/** Ouvre le rapport dans un nouvel onglet, prêt à enregistrer en PDF. Renvoie false si le navigateur bloque l'ouverture. */
export function ouvrirRapport(html: string): boolean {
  const fenetre = window.open('', '_blank');
  if (!fenetre) return false;
  fenetre.document.open();
  fenetre.document.write(html);
  fenetre.document.close();
  return true;
}
