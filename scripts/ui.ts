// Tests d'interface de Parnassa Trading : un vrai navigateur (le Google Chrome de la machine) ouvre chaque écran
// et rejoue les parcours clés sur des états préparés (portefeuille, discipline, challenge), sans toucher aux
// données de l'utilisateur ni à un compte. Les tests du moteur (`pnpm test`) ne voient pas les écrans : c'est ici
// qu'on attrape un écran qui ne s'ouvre plus, un bouton qui ne fait plus rien ou une mise en page qui déborde.
// Usage : pnpm ui   (prix en direct de Binance requis : le Bitcoin est coté 7 j/7, il sert aux ordres)
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

async function portLibre(depart: number): Promise<number> {
  for (let port = depart; port < depart + 50; port++) {
    const libre = await new Promise<boolean>((ok) => {
      const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
      s.listen(port, '127.0.0.1');
    });
    if (libre) return port;
  }
  throw new Error('Aucun port libre pour le serveur de test.');
}

const PORT = await portLibre(5290);
const APP = `http://localhost:${PORT}`;
const CLE = 'parnassa-trading:etat:v1';

let reussis = 0;
const echecs: string[] = [];
function verifier(libelle: string, condition: unknown, detail = ''): void {
  if (condition) {
    reussis++;
    console.log(`OK    ${libelle}`);
  } else {
    echecs.push(libelle);
    console.log(`ÉCHEC ${libelle}${detail ? ` — ${detail}` : ''}`);
  }
}

async function demarrerServeur(): Promise<ChildProcess> {
  const serveur = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(APP)).ok) return serveur;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  serveur.kill();
  throw new Error('Le serveur de test n’a pas démarré.');
}

/** Lundi de la semaine (clé de la revue) et jour (clé du bilan) : les deux fenêtres d'accueil restent fermées. */
const SCRIPT_SANS_FENETRES = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const lundi = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('parnassa-trading:bilan-vu', new Date().toDateString());
  localStorage.setItem('parnassa-trading:revue-vue', lundi);
};

/** Nouveau contexte navigateur avec un état de départ (fusionné avec l'état par défaut de l'application). */
async function contexte(navigateur: Browser, etat: Record<string, unknown>, mobile = false): Promise<BrowserContext> {
  const c = await navigateur.newContext(
    mobile ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR' } : { viewport: { width: 1366, height: 900 }, locale: 'fr-FR' },
  );
  // Une seule fois par contexte : l'application sauvegarde ensuite elle-même son état.
  await c.addInitScript(
    ([cle, valeur, sansFenetres]) => {
      if (sessionStorage.getItem('ui-init')) return;
      sessionStorage.setItem('ui-init', '1');
      localStorage.setItem(cle, valeur);
      new Function(`(${sansFenetres})()`)();
    },
    [CLE, JSON.stringify(etat), SCRIPT_SANS_FENETRES.toString()] as const,
  );
  return c;
}

/** Erreurs de notre propre code (les iframes TradingView et les coupures réseau ne comptent pas). */
function surveillerErreurs(page: Page): string[] {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    // Hors sujet : réseau, CORS (le serveur de production n'accepte pas le port de test), interventions du navigateur.
    if (m.type() === 'error' && m.location().url.startsWith(APP) && !/Failed to load resource|net::|WebSocket|CORS policy|Access to fetch/i.test(m.text())) erreurs.push(m.text());
  });
  return erreurs;
}

const debordeLateralement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

async function prixBtc(page: Page): Promise<boolean> {
  // L'ordre au marché a besoin d'un cours en direct : on attend la cotation du Bitcoin dans le formulaire.
  try {
    await page.waitForFunction(() => /\d/.test(document.querySelector('.selecteur-instrument, .selecteur')?.textContent ?? ''), null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

const ETAT_BASE = { symbole: 'BINANCE:BTCUSDT', page: 'trading' };
const ECRANS = [
  { page: 'accueil', attendu: 'Dernières annonces' },
  { page: 'graphique', attendu: '1 clic' },
  { page: 'marches', attendu: '' },
  { page: 'screener', attendu: '' },
  { page: 'symbole', attendu: '' },
  { page: 'actualites', attendu: '' },
  { page: 'calendrier', attendu: '' },
  { page: 'alertes', attendu: '' },
  { page: 'trading', attendu: 'Nouvel ordre' },
];

const serveur = await demarrerServeur();
const navigateur = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // 1. Chaque écran s'ouvre, sur ordinateur et sur téléphone, sans erreur ni débordement.
  for (const mobile of [false, true]) {
    const c = await contexte(navigateur, ETAT_BASE, mobile);
    const page = await c.newPage();
    const erreurs = surveillerErreurs(page);
    for (const e of ECRANS) {
      await page.goto(`${APP}/#${e.page}/BINANCE:BTCUSDT/60`);
      await page.waitForTimeout(1200);
      const texte = await page.locator('main').innerText().catch(() => '');
      const format = mobile ? 'téléphone' : 'ordinateur';
      // innerText suit le CSS (titres en majuscules) : comparaison sans la casse.
      verifier(`écran ${e.page} (${format}) s'affiche`, texte.length > 20 && (!e.attendu || texte.toLowerCase().includes(e.attendu.toLowerCase())), texte.slice(0, 80));
      verifier(`écran ${e.page} (${format}) sans débordement latéral`, !(await debordeLateralement(page)));
    }
    verifier(`aucune erreur de l'application (${mobile ? 'téléphone' : 'ordinateur'})`, erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
    await c.close();
  }

  // 2. Ordre au marché : achat de BTC, position visible, clôture, historique.
  {
    const c = await contexte(navigateur, ETAT_BASE);
    const page = await c.newPage();
    const erreurs = surveillerErreurs(page);
    await page.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    verifier('cours du Bitcoin reçu', await prixBtc(page));
    await page.getByRole('button', { name: /^Acheter/ }).first().click();
    await page.waitForTimeout(800);
    const position = page.locator('tr', { hasText: 'BTCUSDT' }).first();
    verifier('achat au marché : la position apparaît', await position.isVisible().catch(() => false));
    await position.getByRole('button', { name: 'Clôturer' }).click();
    await page.getByRole('button', { name: 'Tout (100 %)' }).click();
    await page.waitForTimeout(600);
    verifier('clôture : plus de position ouverte', (await page.getByRole('button', { name: /^Positions \(0\)/ }).count()) === 1);
    verifier('clôture : historique à 2 opérations', (await page.getByRole('button', { name: /^Historique \(2\)/ }).count()) === 1);
    await page.getByRole('button', { name: /^Historique \(2\)/ }).click();
    verifier('historique : ouverture et clôture affichées', (await page.locator('tbody tr', { hasText: 'BTCUSDT' }).count()) === 2);
    verifier('ordre et clôture sans erreur', erreurs.length === 0, erreurs.join(' | '));
    await c.close();
  }

  // 3. Discipline : stop obligatoire, risque max, pause après perte, plan obligatoire.
  {
    const maintenant = Date.now();
    const c = await contexte(navigateur, {
      ...ETAT_BASE,
      parametres: { discipline: { actif: true, fermerAuto: true, stopObligatoire: true, risqueTradePct: 1, pauseApresPerteMin: 10, planObligatoire: true } },
      portefeuille: {
        capitalInitial: 100000,
        solde: 99880,
        positions: [],
        ordres: [],
        historiqueCapital: [{ t: maintenant, v: 99880 }],
        operations: [{ id: 'c1', date: maintenant - 3 * 60000, type: 'cloture', symbole: 'BINANCE:BTCUSDT', sens: 'vente', quantite: 0.1, prix: 1, frais: 0, resultat: -120 }],
      },
    });
    const page = await c.newPage();
    await page.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    await prixBtc(page);
    const acheter = page.getByRole('button', { name: /^Acheter/ }).first();
    const messageApres = async () => {
      await acheter.click();
      await page.waitForTimeout(400);
      return (await page.locator('.erreur').first().innerText().catch(() => '')) || '';
    };
    verifier('pause après une perte : bandeau et refus', (await page.locator('.pd-pause').isVisible()) && (await messageApres()).includes('Pause après une perte'));
    await c.close();

    // Sans perte récente : c'est le plan qui manque, puis le stop, puis le risque.
    const c2 = await contexte(navigateur, { ...ETAT_BASE, parametres: { discipline: { actif: true, fermerAuto: true, stopObligatoire: true, risqueTradePct: 1, planObligatoire: true } } });
    const p2 = await c2.newPage();
    await p2.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    await prixBtc(p2);
    const acheter2 = p2.getByRole('button', { name: /^Acheter/ }).first();
    const message2 = async () => {
      await acheter2.click();
      await p2.waitForTimeout(400);
      return (await p2.locator('.erreur').first().innerText().catch(() => '')) || '';
    };
    verifier('plan obligatoire : ordre refusé sans plan', (await message2()).includes('Plan du jour obligatoire'));
    await p2.locator('.plan-du-jour').getByRole('button', { name: 'Écrire' }).click();
    await p2.keyboard.type(' haussier au-dessus du plus haut d’hier, pas plus de 3 trades');
    await p2.getByRole('button', { name: 'Enregistrer' }).click();
    verifier('plan enregistré et affiché', (await p2.locator('.plan-texte').first().innerText()).includes('haussier'));
    verifier('stop obligatoire : ordre refusé sans stop', (await message2()).includes('stop-loss obligatoire'));
    await p2.getByText('Stop-loss / take-profit').click();
    const prix = await p2.evaluate(() => Number((document.querySelector('.selecteur-instrument, .selecteur')?.textContent ?? '').replace(/[^\d,]/g, '').replace(',', '.')));
    await p2.getByLabel('Stop-loss', { exact: true }).fill(String(Math.round(prix * 0.85)));
    const risque = await message2();
    verifier('risque max : ordre refusé avec le volume conseillé', risque.includes('par trade') && risque.includes('Volume max'), risque);
    await c2.close();
  }

  // 4. Challenge : démarrage d'une évaluation, jauges affichées.
  {
    const c = await contexte(navigateur, ETAT_BASE);
    const page = await c.newPage();
    page.on('dialog', (d) => void d.accept());
    await page.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    await page.getByRole('button', { name: 'Démarrer le challenge' }).click();
    await page.waitForTimeout(500);
    verifier('challenge démarré : jauges d’objectif et de pertes', (await page.locator('.jauge-challenge').count()) >= 3);
    await c.close();
  }

  // 5. Statistiques : coach, projection, revue de la semaine, sur un historique préparé.
  {
    const maintenant = Date.now();
    const operations = Array.from({ length: 24 }, (_, i) => ({
      id: `h${i}`,
      date: maintenant - (24 - i) * 6 * 3600000,
      type: 'cloture',
      symbole: i % 3 ? 'FX:EURUSD' : 'OANDA:XAUUSD',
      sens: 'vente',
      quantite: 1,
      prix: 1,
      frais: 2,
      resultat: i % 3 ? 300 : -450,
    })).reverse();
    const c = await contexte(navigateur, { ...ETAT_BASE, portefeuille: { capitalInitial: 100000, solde: 101000, positions: [], ordres: [], historiqueCapital: [], operations } });
    const page = await c.newPage();
    const erreurs = surveillerErreurs(page);
    await page.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    await page.getByRole('button', { name: 'Statistiques', exact: true }).click();
    await page.waitForTimeout(800);
    verifier('coach : constats affichés', (await page.locator('.coach li').count()) >= 2);
    verifier('projection Monte-Carlo affichée', await page.locator('.projection-mc svg').isVisible());
    await page.getByRole('button', { name: /Semaine/ }).click();
    await page.waitForTimeout(800);
    const revue = page.locator('.revue-semaine');
    const toast = await page.locator('[role=status]').allInnerTexts();
    verifier('revue de la semaine : fenêtre ou message « aucun trade »', (await revue.isVisible().catch(() => false)) || toast.some((t) => t.includes('semaine dernière')));
    verifier('statistiques sans erreur', erreurs.length === 0, erreurs.join(' | '));
    await c.close();
  }

  // 6. Positions : risque aux stops, exposition et marché fermé.
  {
    const maintenant = Date.now();
    const pos = (id: string, symbole: string, prix: number, quantite: number, extra = {}) => ({ id, symbole, sens: 'achat', quantite, lots: 1, prixEntree: prix, cout: 1000, levier: 100, ouvertLe: maintenant, swapCompteAu: maintenant, ...extra });
    const c = await contexte(navigateur, {
      ...ETAT_BASE,
      portefeuille: { capitalInitial: 100000, solde: 98000, ordres: [], historiqueCapital: [], operations: [], positions: [pos('a', 'FX:EURUSD', 1.1, 100000, { stopLoss: 1.09 }), pos('b', 'BINANCE:BTCUSDT', 80000, 1)] },
    });
    const page = await c.newPage();
    await page.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    await page.waitForTimeout(1500);
    const risque = await page.locator('.risque-exposition').innerText();
    verifier('risque : perte aux stops et position sans stop signalées', risque.includes('SI TOUS LES STOPS') || (risque.includes('stops') && risque.includes('BTCUSDT')), risque.slice(0, 120));
    await page.getByRole('button', { name: /Exposition par devise/ }).click();
    verifier('exposition par devise affichée', (await page.locator('.re-exposition li').count()) >= 3);
    await c.close();
  }

  // 7. Stop-limite posé, clôture programmée d'une position.
  {
    const c = await contexte(navigateur, ETAT_BASE);
    const page = await c.newPage();
    const erreurs = surveillerErreurs(page);
    await page.goto(`${APP}/#trading/BINANCE:BTCUSDT/60`);
    await prixBtc(page);
    const prix = await page.evaluate(() => Number((document.querySelector('.selecteur-instrument, .selecteur')?.textContent ?? '').replace(/[^\d,]/g, '').replace(',', '.')));
    await page.getByRole('button', { name: 'Stop lim.' }).click();
    await page.getByLabel('Prix de déclenchement (stop)').fill(String(Math.round(prix * 1.02)));
    await page.getByLabel('Prix limite').fill(String(Math.round(prix * 1.025)));
    await page.getByRole('button', { name: 'Ordre d’achat' }).click();
    await page.waitForTimeout(500);
    const ordre = page.locator('tr', { hasText: 'Stop-limite' }).first();
    verifier('stop-limite posé : visible avec sa limite', (await ordre.isVisible().catch(() => false)) && (await ordre.innerText()).includes('lim.'));

    await page.getByRole('button', { name: 'Marché', exact: true }).click();
    await page.getByRole('button', { name: /^Acheter/ }).first().click();
    await page.getByRole('button', { name: /^Positions \(1\)/ }).click();
    await page.waitForTimeout(400);
    await page.locator('tr', { hasText: 'BTCUSDT' }).first().getByTitle('Modifier stop-loss et take-profit').click();
    await page.getByRole('button', { name: 'dans 1 h' }).click();
    await page.waitForTimeout(400);
    verifier('clôture programmée : badge ⏰ sur la position', (await page.locator('tr', { hasText: 'BTCUSDT' }).first().innerText()).includes('⏰'));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Risques et confidentialité' }).click();
    const legal = page.locator('.infos-legales');
    const risques = await legal.locator('h3').first().innerText().catch(() => '');
    await legal.getByRole('tab', { name: 'Confidentialité' }).click();
    verifier('informations légales : risques puis confidentialité', risques.includes('risques') && (await legal.locator('h4').count()) >= 4);
    await page.keyboard.press('Escape');
    verifier('informations légales : fermeture par Échap', (await legal.count()) === 0);
    verifier('ordres avancés sans erreur', erreurs.length === 0, erreurs.join(' | '));
    await c.close();
  }
} catch (e) {
  // Un parcours qui plante compte comme un échec, et le bilan s'affiche quand même.
  verifier('parcours terminé sans exception', false, (e as Error).message.split('\n')[0]);
} finally {
  await navigateur.close();
  serveur.kill();
}

console.log(`\n${reussis} vérifications d’interface réussies, ${echecs.length} en échec.`);
for (const e of echecs) console.log(` - ${e}`);
process.exit(echecs.length ? 1 : 0);
