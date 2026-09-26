import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Nicio linie de pauză (— sau –) în textele scrise în cod pe paginile publice.
 *
 * De ce există: redesignul le-a scos pe toate, iar ele revin pe nesimțite, o
 * propoziție la un moment dat. Garda citește sursa, nu pagina randată, deci
 * prinde și textele din stări rare (listă de așteptare, eroare, confirmare).
 *
 * Linia scurtă („–") e interzisă doar ca separator, între spații. Singură, ca
 * valoare de așteptare („– / 30" cât se încarcă) sau ca semn pe un buton de
 * pliere, e un glif, nu o pauză.
 *
 * Comentariile nu contează: acolo liniile de pauză sunt proză pentru cine
 * citește codul. Textele editabile din admin nu trec pe aici (vin din config),
 * iar planul redesignului le lasă neatinse.
 */

const root = resolve(__dirname, '../..');

const fisiere = (dir: string): string[] =>
  readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) => {
    const cale = join(dir, e.name);
    if (e.isDirectory()) return fisiere(cale);
    return /\.(tsx?)$/.test(e.name) ? [cale] : [];
  });

/** Scoate comentariile de bloc, de linie și cele JSX, păstrând restul. */
const faraComentarii = (sursa: string): string =>
  sursa
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Linia lungă oriunde; linia scurtă doar între spații. */
const PAUZA = /—|\s–\s/;

const SURSE = [
  ...fisiere('src/components/landing'),
  ...readdirSync(resolve(root, 'src/components'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join('src/components', f)),
  'src/content/etape.ts',
];

describe('liniile de pauză din textele publice scrise în cod', () => {
  it('garda ignoră comentariile, dar prinde textul', () => {
    expect(faraComentarii('// a — b\nconst x = 1;')).not.toMatch(/—/);
    expect(faraComentarii('{/* a — b */}<p>ok</p>')).not.toMatch(/—/);
    expect(faraComentarii("const t = 'a — b';")).toMatch(/—/);
    expect(faraComentarii('<p>Gata — ești pe listă.</p>')).toMatch(/—/);
    expect(PAUZA.test("{n ?? '–'} / 30")).toBe(false);
    expect(PAUZA.test('Luni – vineri')).toBe(true);
  });

  it.each(SURSE)('%s nu are linii de pauză în afara comentariilor', (cale) => {
    const cod = faraComentarii(readFileSync(resolve(root, cale), 'utf8'));
    const linii = cod.split('\n').filter((l) => PAUZA.test(l));
    expect(linii.map((l) => l.trim())).toEqual([]);
  });
});
