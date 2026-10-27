/** Epley este folosit numai pentru seturi de 1–10 repetări întregi. */
export const estimeazaUnuRm = (kg: number, repetari: number | string): number | null => {
  const reps = typeof repetari === 'number' ? repetari : Number(repetari);
  if (!Number.isFinite(kg) || kg <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  return kg * (1 + reps / 30);
};

export interface SetUnuRm {
  incarcare: number | null;
  repetari: string | number | null;
}

/** Primește rezultatele aceleiași mișcări și ale aceluiași sportiv. */
export const celMaiMareUnuRm = (seturi: readonly SetUnuRm[]): number | null => {
  let maxim: number | null = null;
  for (const set of seturi) {
    if (set.incarcare === null || set.repetari === null) continue;
    const estimat = estimeazaUnuRm(set.incarcare, set.repetari);
    if (estimat !== null && (maxim === null || estimat > maxim)) maxim = estimat;
  }
  return maxim;
};

/** Sugestia se rotunjește la 0,5 kg; lipsa istoricului nu inventează o țintă. */
export const kgSugerate = (procent: number, unuRm: number | null | undefined): number | null =>
  unuRm == null ? null : Math.round((procent / 100) * unuRm * 2) / 2;
