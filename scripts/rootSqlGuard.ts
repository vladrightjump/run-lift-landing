/**
 * Gardă de build: rădăcina repo-ului nu mai primește fișiere SQL.
 *
 * Cele 29 de migrări s-au adunat acolo una câte una, de la prima ediție încoace,
 * fiindcă nimic nu le-a oprit. Verificarea asta e ce le ține în `supabase/sql/`
 * de acum înainte.
 *
 * Funcția e pură și primește NUMELE din rădăcină, nu citește ea directorul:
 * verificarea trebuie să rămână strict pe rădăcină. Repo-ul are fișiere `.sql`
 * legitime în `scripts/` și în `supabase/`, iar o căutare recursivă ar pica
 * build-ul imediat.
 */

/** Unde le e locul — apare în mesajul de eroare. */
export const DOSAR_SQL = 'supabase/sql/';

/** Numele de fișiere SQL dintre cele date, în ordinea primită. */
export const fisiereSqlInRadacina = (nume: readonly string[]): string[] =>
  nume.filter((n) => n.toLowerCase().endsWith('.sql'));

/** Mesajul pentru operator: ce s-a găsit și unde trebuie mutat. */
export const mesajSqlInRadacina = (gasite: readonly string[]): string =>
  `\n✗ Fișiere SQL în rădăcina repo-ului:\n` +
  gasite.map((n) => `  - ${n}`).join('\n') +
  `\n\nLocul lor e \`${DOSAR_SQL}\`. Mută-le cu \`git mv\`, ca istoricul să le urmeze,\n` +
  `și actualizează mențiunile din \`MIGRATIONS.md\`.\n`;
