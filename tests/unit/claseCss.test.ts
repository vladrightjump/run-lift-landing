import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Nicio clasă inventată pe loc.
 *
 * De ce există: ecranul antrenamentului a fost scris cu patru clase care nu
 * existau în CSS (`admin-versiuni`, `admin-versiune-cand`, …). Totul trecea —
 * typecheck, unitare, e2e — fiindcă testele caută după rol și text, nu după
 * stil. Singurul loc în care se vedea era ecranul, iar acolo nu se uită niciun
 * test. Ieftin de prins mecanic, scump de descoperit în producție.
 *
 * Verifică DOAR clasele proprii aplicației (prefixele de mai jos), nu orice
 * `className`: o clasă venită dintr-o librărie sau compusă dinamic n-are de ce
 * să fie în fișierul nostru de stil.
 */

const root = resolve(__dirname, '../..');
// Toate fișierele de stil: `public.css` ține paginile publice, `edition3.css`
// stările și keyframes-urile `e3-*`, `index.css` adminul și regulile globale.
const css = ['src/index.css', 'src/public.css', 'src/edition3.css']
  .map((f) => readFileSync(resolve(root, f), 'utf8'))
  .join('\n');

/** Prefixele claselor scrise de noi. O clasă fără unul din ele nu se verifică. */
const PREFIXE = ['admin-', 'an-', 'cs-', 'cf-', 'dn-', 'e3-', 'rn-'];

/**
 * Restanțe găsite când garda a intrat în repo (19 septembrie 2026).
 *
 * Nu le repară garda — ar fi însemnat să umble în fișiere străine de lucrarea
 * care a adus-o. Sunt aici ca să păzească de azi înainte codul nou, nu ca să
 * binecuvânteze restanța: fiecare intrare e o linie de șters când cineva
 * atinge oricum fișierul.
 */
const RESTANTE = new Set([
  // `src/admin/AnuntIstoric.tsx` — rândul de test al anunțului se randează
  // nestilat. Vizibil doar în tabul „Trimite emailuri" → „Toți de până acum".
  'admin-email-test',
]);

const fisiereTsx = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const cale = join(dir, e.name);
    if (e.isDirectory()) return fisiereTsx(cale);
    return e.name.endsWith('.tsx') ? [cale] : [];
  });

/** Clasele literale dintr-un `className="..."` sau `className={`...`}`. */
const claseDin = (sursa: string): string[] => {
  const out: string[] = [];
  for (const m of sursa.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const brut = m[1] ?? m[2] ?? '';
    // Bucățile interpolate (`${...}`) sunt dinamice; scoatem doar literalele.
    for (const parte of brut.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
      if (parte) out.push(parte);
    }
  }
  return out;
};

describe('fiecare clasă proprie folosită în TSX există în CSS', () => {
  it('nu există clase fără stil', () => {
    const lipsa = new Map<string, string[]>();

    for (const fisier of fisiereTsx(resolve(root, 'src'))) {
      const relativ = fisier.slice(root.length + 1);
      for (const clasa of claseDin(readFileSync(fisier, 'utf8'))) {
        if (!PREFIXE.some((p) => clasa.startsWith(p))) continue;
        if (RESTANTE.has(clasa)) continue;
        if (css.includes(`.${clasa}`)) continue;
        lipsa.set(clasa, [...(lipsa.get(clasa) ?? []), relativ]);
      }
    }

    expect(
      Object.fromEntries(lipsa),
      'Clase folosite în TSX dar fără nicio regulă în src/index.css sau src/edition3.css'
    ).toEqual({});
  });
});

/**
 * Cealaltă direcție: stil fără niciun purtător.
 *
 * Garda de mai sus prinde clasa inventată în TSX. N-o prinde pe cea rămasă în
 * CSS după ce componenta a dispărut — exact ce s-a întâmplat când panoul „Acum"
 * a fost înlocuit de linia de timp: șaizeci și cinci de linii de stil pe care
 * nu le mai purta nimeni, invizibile pentru orice test.
 *
 * Verifică doar prefixele ecranelor proprii, unde o clasă corespunde unui
 * element concret. `e3-` e exclus: landing-ul are stări și variante aplicate
 * dinamic, iar o clasă compusă la randare n-ar apărea niciodată ca literal.
 */
describe('nicio regulă CSS fără purtător', () => {
  const PREFIXE_STRICTE = ['admin-', 'an-'];

  it('nu există stil orfan', () => {
    /*
     * Aici „folosit" e căutat LARG, nu prin `className`: o clasă poate ajunge pe
     * element ca prop (`clasa="admin-confirm--neutru"`) sau compusă într-un
     * array cu `.join(' ')`. Direcția asta trebuie să greșească în favoarea lui
     * „e folosit" — un orfan ratat costă câteva linii de stil, o alarmă falsă
     * costă încrederea în gardă.
     */
    const sursa = fisiereTsx(resolve(root, 'src'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const orfane = new Set<string>();
    for (const m of css.matchAll(/\.([a-z][a-z0-9-]*)/g)) {
      const clasa = m[1];
      if (!PREFIXE_STRICTE.some((p) => clasa.startsWith(p))) continue;
      if (sursa.includes(clasa)) continue;
      orfane.add(clasa);
    }

    expect(
      [...orfane].sort(),
      'Reguli CSS pentru clase pe care nu le mai poartă niciun element'
    ).toEqual([]);
  });
});
