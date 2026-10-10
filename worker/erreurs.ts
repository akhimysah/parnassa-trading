/**
 * Journal des erreurs de Parnassa Trading : l'application envoie ses plantages (message, pile d'appels, page,
 * version, navigateur — jamais de données de compte), regroupés par signature avec un compteur.
 * Stockage : un Durable Object SQLite (gratuit, sans le quota d'écritures KV déjà pris par le cron).
 * Lecture et purge protégées par la clé secrète ERREURS_CLE (wrangler secret put ERREURS_CLE).
 */

export interface EnvErreurs {
  ERREURS: DurableObjectNamespace;
  ERREURS_CLE?: string;
}

/** Erreurs distinctes gardées au plus (les plus anciennes partent). */
const MAX_LIGNES = 1000;

const ENTETES = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const reponse = (donnees: unknown, statut = 200) => new Response(JSON.stringify(donnees), { status: statut, headers: ENTETES });

const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Comparaison à temps constant (la longueur peut fuiter, pas le contenu). */
function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function autorise(requete: Request, env: EnvErreurs): boolean {
  const cle = env.ERREURS_CLE;
  if (!cle) return false;
  const fournie = (requete.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  return egal(fournie, cle);
}

/** Route /erreurs : POST (signalement, ouvert à tous), GET et DELETE (avec la clé). */
export async function routeErreurs(requete: Request, env: EnvErreurs): Promise<Response> {
  const journal = env.ERREURS.get(env.ERREURS.idFromName('journal'));
  if (requete.method === 'POST') {
    const corps = await requete.text();
    if (corps.length > 16000) return reponse({ erreur: 'Signalement trop long.' }, 413);
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(corps) as Record<string, unknown>;
    } catch {
      return reponse({ erreur: 'JSON invalide.' }, 400);
    }
    const message = texte(d.message, 500);
    if (!message) return reponse({ erreur: 'Message requis.' }, 400);
    const entree = {
      type: texte(d.type, 30) || 'erreur',
      message,
      pile: texte(d.pile, 4000),
      page: texte(d.page, 200),
      version: texte(d.version, 40),
      agent: texte(requete.headers.get('User-Agent'), 300),
    };
    await journal.fetch('https://journal/ajouter', { method: 'POST', body: JSON.stringify(entree) });
    return reponse({ ok: true });
  }
  if (!autorise(requete, env)) return reponse({ erreur: 'Clé requise.' }, 401);
  if (requete.method === 'GET') return new Response((await journal.fetch('https://journal/liste')).body, { headers: ENTETES });
  if (requete.method === 'DELETE') {
    await journal.fetch('https://journal/vider', { method: 'POST' });
    return reponse({ ok: true });
  }
  return reponse({ erreur: 'Méthode non prise en charge.' }, 405);
}

/** Signature d'une erreur : type, message et premier cadre de la pile (sans les numéros de colonne). */
async function signature(e: { type: string; message: string; pile: string }): Promise<string> {
  const cadre = e.pile.split('\n').find((l) => /\.(js|ts|tsx)/.test(l))?.replace(/:\d+(?=\)?$)/, '') ?? '';
  const brut = new TextEncoder().encode(`${e.type}|${e.message}|${cadre.trim()}`);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', brut));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class JournalErreurs {
  private sql: SqlStorage;

  constructor(etat: DurableObjectState) {
    this.sql = etat.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS erreurs (
      signature TEXT PRIMARY KEY, type TEXT, message TEXT, pile TEXT, page TEXT, version TEXT, agent TEXT,
      nombre INTEGER NOT NULL, premiere INTEGER NOT NULL, derniere INTEGER NOT NULL)`);
  }

  async fetch(requete: Request): Promise<Response> {
    const chemin = new URL(requete.url).pathname;
    if (chemin === '/ajouter') {
      const e = (await requete.json()) as { type: string; message: string; pile: string; page: string; version: string; agent: string };
      const sig = await signature(e);
      const maintenant = Date.now();
      this.sql.exec(
        `INSERT INTO erreurs (signature, type, message, pile, page, version, agent, nombre, premiere, derniere)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(signature) DO UPDATE SET nombre = nombre + 1, derniere = excluded.derniere,
           page = excluded.page, version = excluded.version, agent = excluded.agent, pile = excluded.pile`,
        sig, e.type, e.message, e.pile, e.page, e.version, e.agent, maintenant, maintenant,
      );
      this.sql.exec(`DELETE FROM erreurs WHERE signature IN (SELECT signature FROM erreurs ORDER BY derniere DESC LIMIT -1 OFFSET ?)`, MAX_LIGNES);
      return new Response('ok');
    }
    if (chemin === '/liste') {
      const lignes = this.sql.exec(`SELECT * FROM erreurs ORDER BY derniere DESC LIMIT 300`).toArray();
      const total = this.sql.exec(`SELECT COUNT(*) AS n, COALESCE(SUM(nombre), 0) AS s FROM erreurs`).one() as { n: number; s: number };
      return Response.json({ distinctes: total.n, occurrences: total.s, erreurs: lignes });
    }
    if (chemin === '/vider') {
      this.sql.exec('DELETE FROM erreurs');
      return new Response('ok');
    }
    return new Response('Route inconnue', { status: 404 });
  }
}
