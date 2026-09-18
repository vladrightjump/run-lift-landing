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

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Unde le e locul — apare în mesajul de eroare. */
export const DOSAR_SQL = 'supabase/sql/';

/** Numele de fișiere SQL dintre cele date, în ordinea primită. */
export const fisiereSqlInRadacina = (nume: readonly string[]): string[] =>
  nume.filter((n) => n.toLowerCase().endsWith('.sql'));

/**
 * Citește rădăcina și întoarce fișierele SQL de acolo.
 *
 * Fără recursie, deliberat: `scripts/` și `supabase/` au fișiere SQL legitime.
 * Legăturile simbolice NU intră — un `.sql` legat simbolic în rădăcină e o
 * unealtă locală, nu un fișier al repo-ului.
 *
 * Ce ignoră git, ignoră și garda: un dump de lucru pus temporar în rădăcină și
 * trecut în `.gitignore` nu trebuie să blocheze build-ul cuiva. Dacă git nu
 * răspunde (arbore exportat fără `.git`), cade pe listarea simplă — acolo tot ce
 * e în arbore a venit oricum din git.
 */
export const sqlDinRadacina = (radacina: string): string[] => {
  const nume = fisiereSqlInRadacina(
    readdirSync(radacina, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
  );
  return nume.filter((n) => !esteIgnoratDeGit(radacina, n));
};

const esteIgnoratDeGit = (radacina: string, nume: string): boolean => {
  try {
    // `check-ignore` întoarce 0 când fișierul E ignorat, 1 când nu e.
    execFileSync('git', ['check-ignore', '--quiet', '--', nume], {
      cwd: radacina,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};

/** Mesajul pentru operator: ce s-a găsit și unde trebuie mutat. */
export const mesajSqlInRadacina = (gasite: readonly string[]): string =>
  `\n✗ Fișiere SQL în rădăcina repo-ului:\n` +
  gasite.map((n) => `  - ${n}`).join('\n') +
  `\n\nLocul lor e \`${DOSAR_SQL}\`. Mută-le cu \`git mv\`, ca istoricul să le urmeze,\n` +
  `și actualizează mențiunile din \`MIGRATIONS.md\`.\n`;
