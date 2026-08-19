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
