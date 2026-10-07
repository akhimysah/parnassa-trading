/** Téléchargement côté navigateur d'un fichier texte (CSV, JSON). */
export function telecharger(nom: string, contenu: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob(['﻿', contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV au format français (séparateur « ; », virgule décimale), lisible directement dans Excel / Numbers. */
export function versCsv(entetes: string[], lignes: (string | number | undefined | null)[][]): string {
  const cellule = (v: string | number | undefined | null) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const texte = String(v);
    return /[;"\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\n');
}

export function horodatageFichier(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}
