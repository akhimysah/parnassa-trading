import { useMemo, useState } from "react";
import type { Challenge, Portefeuille } from "../types";
import { reglesCompletes } from "../challenge";
import { monteCarlo, rendementsTrades } from "../montecarlo";
import { PERTE_CRAME } from "../trading";

const L = 640;
const H = 200;
const M = { haut: 12, bas: 22, gauche: 54, droite: 8 };
const MIN_TRADES = 10;

const pct = (v: number, d = 1) =>
  `${v.toLocaleString("fr-FR", { maximumFractionDigits: d })} %`;
const variation = (multiple: number) => {
  const v = (multiple - 1) * 100;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v))}`;
};

const nombre = (t: string): number | undefined => {
  const v = Number(t.replace(",", "."));
  return t.trim() && Number.isFinite(v) && v > 0 ? v : undefined;
};

/**
 * Projection de Monte-Carlo : 1 000 suites de trades tirées au hasard parmi les vôtres, pour estimer
 * la probabilité d'atteindre l'objectif avant la perte max et l'éventail des fonds possibles.
 */
export function ProjectionMonteCarlo({
  portefeuille,
  challenge,
}: {
  portefeuille: Portefeuille;
  challenge: Challenge | null;
}) {
  const regles =
    challenge?.statut === "en-cours" ? reglesCompletes(challenge.regles) : null;
  const [trades, setTrades] = useState(100);
  const [objectif, setObjectif] = useState<number | undefined>(
    regles ? regles.objectifPct : 10,
  );
  const [perteMax, setPerteMax] = useState<number>(
    regles ? regles.perteMaxPct : PERTE_CRAME * 100,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rendements = useMemo(
    () => rendementsTrades(portefeuille),
    [portefeuille.operations, portefeuille.capitalInitial],
  );
  const r = useMemo(
    () =>
      rendements.length >= MIN_TRADES
        ? monteCarlo(rendements, {
            trades,
            objectifPct: objectif,
            perteMaxPct: Math.min(100, perteMax),
          })
        : null,
    [rendements, trades, objectif, perteMax],
  );

  if (rendements.length === 0) return null;

  const entete = (
    <div className="mc-entete">
      <h4>Projection Monte-Carlo</h4>
      <span className="muet">
        1 000 suites de trades tirées au hasard parmi vos {rendements.length}{" "}
        trades clôturés
      </span>
    </div>
  );
  if (!r) {
    return (
      <div className="projection-mc">
        {entete}
        <p className="vide">
          Encore {MIN_TRADES - rendements.length} trade
          {MIN_TRADES - rendements.length > 1 ? "s" : ""} clôturé
          {MIN_TRADES - rendements.length > 1 ? "s" : ""} pour une projection
          fiable.
        </p>
      </div>
    );
  }

  const plancher = 1 - perteMax / 100;
  const cible = objectif !== undefined ? 1 + objectif / 100 : null;
  const valeurs = r.bandes
    .flatMap((b) => [b.p5, b.p95])
    .concat(
      cible ?? 1,
      Math.max(plancher, Math.min(...r.bandes.map((b) => b.p5))),
    );
  const min = Math.min(...valeurs, 1);
  const max = Math.max(...valeurs, 1);
  const ecart = max - min || 1;
  const x = (n: number) =>
    M.gauche + (n / r.trades) * (L - M.gauche - M.droite);
  const y = (v: number) =>
    M.haut +
    (1 - (Math.min(max, Math.max(min, v)) - min) / ecart) *
      (H - M.haut - M.bas);
  const zone = (
    bas: keyof (typeof r.bandes)[number],
    haut: keyof (typeof r.bandes)[number],
  ) =>
    [
      ...r.bandes.map((b) => `${x(b.n)},${y(b[haut])}`),
      ...[...r.bandes].reverse().map((b) => `${x(b.n)},${y(b[bas])}`),
    ].join(" ");
  const mediane = r.bandes
    .map((b, i) => `${i ? "L" : "M"} ${x(b.n)} ${y(b.p50)}`)
    .join(" ");
  const ruineRisquee = r.probaRuine >= 0.2;

  return (
    <div className="projection-mc">
      {entete}
      <div className="mc-reglage">
        <label>
          <span className="muet">Trades à venir</span>
          <select
            value={trades}
            onChange={(e) => setTrades(Number(e.target.value))}
          >
            {[25, 50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muet">Objectif (%)</span>
          <input
            key={`o${objectif}`}
            inputMode="decimal"
            defaultValue={objectif ?? ""}
            placeholder="aucun"
            onBlur={(e) => setObjectif(nombre(e.target.value))}
          />
        </label>
        <label>
          <span className="muet">Perte max (%)</span>
          <input
            key={`p${perteMax}`}
            inputMode="decimal"
            defaultValue={perteMax}
            onBlur={(e) => setPerteMax(nombre(e.target.value) ?? perteMax)}
          />
        </label>
        <span className="muet petit">
          {regles
            ? "Règles du challenge en cours par défaut."
            : "Par défaut : la règle des 99 % (compte cramé)."}
        </span>
      </div>

      <div className="grille-stats">
        {r.probaObjectif !== null && (
          <div>
            <span>Objectif atteint</span>
            <strong className={r.probaObjectif >= 0.5 ? "hausse" : ""}>
              {pct(r.probaObjectif * 100, 0)}
            </strong>
            <em className="muet">
              +{pct(objectif!)} touché avant −{pct(perteMax)}
            </em>
          </div>
        )}
        <div>
          <span>Perte max touchée</span>
          <strong className={ruineRisquee ? "baisse" : ""}>
            {pct(r.probaRuine * 100, 0)}
          </strong>
          <em className="muet">
            {ruineRisquee
              ? "risque élevé : réduisez la taille des positions"
              : `−${pct(perteMax)} en ${r.trades} trades`}
          </em>
        </div>
        <div>
          <span>Fonds après {r.trades} trades</span>
          <strong className={r.final.p50 >= 1 ? "hausse" : "baisse"}>
            {variation(r.final.p50)}
          </strong>
          <em className="muet">
            médiane · 9 fois sur 10 entre {variation(r.final.p5)} et{" "}
            {variation(r.final.p95)}
          </em>
        </div>
        <div>
          <span>Drawdown à prévoir</span>
          <strong className="baisse">−{pct(r.drawdown.p50)}</strong>
          <em className="muet">
            médiane · −{pct(r.drawdown.p95)} dans les 5 % pires cas
          </em>
        </div>
      </div>

      <div className="aa-courbe">
        <svg
          viewBox={`0 0 ${L} ${H}`}
          role="img"
          aria-label={`Éventail des fonds sur ${r.trades} trades : médiane ${variation(r.final.p50)}`}
        >
          <polygon points={zone("p5", "p95")} className="mc-bande-large" />
          <polygon points={zone("p25", "p75")} className="mc-bande" />
          <line
            x1={M.gauche}
            x2={L - M.droite}
            y1={y(1)}
            y2={y(1)}
            className="aa-zero"
          />
          {cible !== null && cible <= max && (
            <g>
              <line
                x1={M.gauche}
                x2={L - M.droite}
                y1={y(cible)}
                y2={y(cible)}
                className="mc-cible"
              />
              <text
                x={L - M.droite}
                y={y(cible) - 4}
                textAnchor="end"
                className="aa-axe"
              >
                objectif +{pct(objectif!)}
              </text>
            </g>
          )}
          {plancher >= min && (
            <g>
              <line
                x1={M.gauche}
                x2={L - M.droite}
                y1={y(plancher)}
                y2={y(plancher)}
                className="mc-plancher"
              />
              <text
                x={L - M.droite}
                y={y(plancher) + 12 > H - M.bas - 2 ? y(plancher) - 4 : y(plancher) + 12}
                textAnchor="end"
                className="aa-axe"
              >
                perte max −{pct(perteMax)}
              </text>
            </g>
          )}
          <path d={mediane} className="aa-ligne" />
          {[max, 1, min]
            .filter((v, i) => i === 1 || Math.abs(y(v) - y(1)) > 14)
            .map((v) => (
              <text
                key={v}
                x={M.gauche - 6}
                y={y(v) + 4}
                textAnchor="end"
                className="aa-axe"
              >
                {variation(v)}
              </text>
            ))}
          <text x={M.gauche} y={H - 6} className="aa-axe">
            maintenant
          </text>
          <text x={L - M.droite} y={H - 6} textAnchor="end" className="aa-axe">
            +{r.trades} trades
          </text>
        </svg>
        <p className="muet petit">
          Bande claire : 90 % des trajectoires ; bande foncée : 50 % ; ligne :
          la médiane. Une projection rejoue votre passé : elle ne prédit pas le
          marché.
        </p>
      </div>
    </div>
  );
}
