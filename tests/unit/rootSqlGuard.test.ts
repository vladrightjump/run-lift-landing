import { describe, it, expect } from 'vitest';
import { fisiereSqlInRadacina, mesajSqlInRadacina, DOSAR_SQL } from '../../scripts/rootSqlGuard';

/**
 * Garda care ține rădăcina curată. Rulează în `npm run build`, deci înaintea
 * fiecărui build local ȘI a celui de pe Vercel: un fișier SQL ajuns din greșeală
 * în rădăcină oprește deploy-ul, nu doar verificarea locală.
 */

describe('ce prinde garda', () => {
  it('găsește fișierele SQL dintre numele din rădăcină', () => {
    expect(
      fisiereSqlInRadacina(['package.json', 'supabase-migration-noua.sql', 'vite.config.ts'])
    ).toEqual(['supabase-migration-noua.sql']);
  });

  it('o rădăcină curată nu raportează nimic', () => {
    expect(fisiereSqlInRadacina(['package.json', 'README.md', 'vercel.json'])).toEqual([]);
  });

  it('prinde extensia scrisă cu majuscule', () => {
    expect(fisiereSqlInRadacina(['DUMP.SQL'])).toEqual(['DUMP.SQL']);
  });

  /** Numele conțin `.sql` la mijloc, nu la final — nu sunt fișiere SQL. */
  it('nu se ia după un `.sql` din mijlocul numelui', () => {
    expect(fisiereSqlInRadacina(['note.sql.md', 'migrari.sql.bak'])).toEqual([]);
  });

  it('raportează toate fișierele găsite, nu doar primul', () => {
    expect(fisiereSqlInRadacina(['unu.sql', 'README.md', 'doi.sql'])).toEqual([
      'unu.sql',
      'doi.sql',
    ]);
  });
});

describe('mesajul către operator', () => {
  it('numește fișierele găsite și dosarul în care le e locul', () => {
    const mesaj = mesajSqlInRadacina(['supabase-migration-noua.sql']);
    expect(mesaj).toContain('supabase-migration-noua.sql');
    expect(mesaj).toContain(DOSAR_SQL);
  });

  /** Ștergerea ar pierde istoricul; mesajul spune de la început cum se mută. */
  it('spune să mute cu `git mv`, nu doar „mută-le"', () => {
    expect(mesajSqlInRadacina(['x.sql'])).toContain('git mv');
  });
});
