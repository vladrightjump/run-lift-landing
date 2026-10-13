/**
 * Serializare CSV sigură pentru Excel / Google Sheets.
 *
 * Pe lângă escaping-ul standard (fiecare celulă în ghilimele + dublarea ghilimelelor
 * interne), neutralizează INJECȚIA DE FORMULE (CSV injection): o celulă care începe cu
 * `=`, `+`, `-`, `@` (sau tab/CR) e prefixată cu un apostrof, ca aplicația de spreadsheet
 * să o trateze ca text, nu ca formulă. Fără asta, un participant înscris cu numele
 * `=HYPERLINK("http://evil","x")` ar executa cod când adminul deschide exportul.
 */

/** Prefixează cu `'` celulele care ar fi interpretate ca formulă de Excel/Sheets. */
const neutralizeFormula = (c: string): string => (/^[=+\-@\t\r]/.test(c) ? `'${c}` : c);

/** Un rând CSV: fiecare celulă neutralizată, cu ghilimelele escapate, încadrată în ghilimele. */
const toCsvRow = (cells: string[]): string =>
  cells.map((c) => `"${neutralizeFormula(String(c)).replace(/"/g, '""')}"`).join(',');

/** Serializează rânduri (primul e de obicei antetul) în CSV, cu `\n` între rânduri. */
export const toCsv = (rows: string[][]): string => rows.map(toCsvRow).join('\n');

/**
 * Un timp final, scris ca să NU fie reinterpretat de spreadsheet.
 *
 * Serverul întoarce `HH:MM:SS`. Pus așa într-o celulă, Excel și Sheets îl
 * citesc ca ORĂ DIN ZI: 32 de minute de alergare devin 00:32, adică miezul
 * nopții. Un duel cu autodetecția se câștigă greu — apostroful de forțare a
 * textului se vede în unele vizualizatoare — deci celula poartă unități:
 * „32m 15s" nu e o oră pentru nimeni.
 *
 * `''` pentru valoare lipsă: celulă goală, nu „null" și nu „0".
 */
export const durataCsv = (hhmmss: string | null | undefined): string => {
  if (!hhmmss) return '';
  const m = /^(\d+):([0-5]\d):([0-5]\d)(?:\.\d+)?$/.exec(hhmmss.trim());
  // Ce nu recunoaștem pleacă neatins: mai bine o formă ciudată decât o celulă
  // goală care arată ca „n-a terminat".
  if (!m) return hhmmss;
  const [, h, min, s] = m;
  const ore = Number(h);
  return ore > 0 ? `${ore}h ${min}m ${s}s` : `${Number(min)}m ${s}s`;
};
