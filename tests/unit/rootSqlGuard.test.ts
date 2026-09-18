// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  fisiereSqlInRadacina,
  mesajSqlInRadacina,
  sqlDinRadacina,
  DOSAR_SQL,
} from '../../scripts/rootSqlGuard';

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

/**
 * Partea care chiar atinge discul. Helperul pur de mai sus nu spune nimic despre
 * ce director se citește, dacă se coboară în subdirectoare sau dacă un fișier
 * ignorat de git oprește build-ul cuiva — exact lucrurile care pot face garda să
 * treacă verde peste o rădăcină murdară sau să blocheze un build curat.
 */
describe('citirea rădăcinii', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'garda-sql-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('găsește fișierele SQL din directorul dat', () => {
    writeFileSync(join(dir, 'migrare.sql'), '');
    writeFileSync(join(dir, 'README.md'), '');
    expect(sqlDinRadacina(dir)).toEqual(['migrare.sql']);
  });

  /** `scripts/` și `supabase/` au fișiere SQL legitime: o coborâre le-ar pica pe toate. */
  it('nu coboară în subdirectoare', () => {
    mkdirSync(join(dir, 'supabase'));
    writeFileSync(join(dir, 'supabase', 'migrare.sql'), '');
    expect(sqlDinRadacina(dir)).toEqual([]);
  });

  it('un director numit `ceva.sql` nu e un fișier', () => {
    mkdirSync(join(dir, 'arhiva.sql'));
    expect(sqlDinRadacina(dir)).toEqual([]);
  });

  it('o legătură simbolică nu e un fișier al repo-ului', () => {
    writeFileSync(join(dir, 'real.txt'), '');
    symlinkSync(join(dir, 'real.txt'), join(dir, 'legat.sql'));
    expect(sqlDinRadacina(dir)).toEqual([]);
  });

  it('o rădăcină curată nu raportează nimic', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(sqlDinRadacina(dir)).toEqual([]);
  });

  /**
   * Un dump de lucru pus temporar în rădăcină și trecut în `.gitignore` nu
   * trebuie să blocheze build-ul: nu ajunge niciodată în repo.
   */
  it('ce ignoră git, ignoră și garda', () => {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    writeFileSync(join(dir, '.gitignore'), 'dump-local.sql\n');
    writeFileSync(join(dir, 'dump-local.sql'), '');
    writeFileSync(join(dir, 'migrare.sql'), '');
    expect(sqlDinRadacina(dir)).toEqual(['migrare.sql']);
  });

  /** Fără git (arbore exportat), listarea simplă rămâne verdictul. */
  it('fără git, tot ce e în director contează', () => {
    writeFileSync(join(dir, 'migrare.sql'), '');
    expect(sqlDinRadacina(dir)).toEqual(['migrare.sql']);
  });
});

/**
 * Invariantul pe care se sprijină toată curățenia, verificat pe repo-ul real —
 * independent de scriptul de build, care rulează doar la `npm run build`.
 */
describe('rădăcina repo-ului', () => {
  it('nu conține niciun fișier SQL', () => {
    const radacina = resolve(__dirname, '../..');
    expect(fisiereSqlInRadacina(readdirSync(radacina))).toEqual([]);
  });
});
