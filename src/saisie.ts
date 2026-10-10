/** Nombre saisi en français (espaces, virgule décimale) ; undefined s'il est vide, invalide ou non positif. */
export function nombre(texte: string): number | undefined {
  const propre = texte.replace(/\s/g, '').replace(',', '.');
  if (!propre) return undefined;
  const v = Number(propre);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}
