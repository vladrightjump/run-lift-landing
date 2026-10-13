import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

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
// Toate fișierele de stil globale: `shared/styles` jetoanele și baza,
// `public.css` paginile publice, `edition3.css` stările și keyframes-urile
// `e3-*`, `index.css` adminul. `*.module.css` au garda lor, mai jos.
const css = [
  'src/shared/styles/tokens.css',
  'src/shared/styles/base.css',
  'src/index.css',
  'src/admin/sala/probe.css',
]
  .map((f) => readFileSync(resolve(root, f), 'utf8'))
  .concat((readdirSync(resolve(root, 'src'), { recursive: true }) as string[])
    .filter((f) => f.endsWith('.module.css'))
    .flatMap((f) => [...readFileSync(resolve(root, 'src', f), 'utf8')
      .matchAll(/:global\(([^)]+)\)/g)].map((match) => match[1])))
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

/** Clasele globale proprii care lipsesc din `css`. */
export const claseGlobaleLipsa = (sursa: string, stil: string): string[] =>
  claseDin(sursa).filter(
    (clasa) => PREFIXE.some((p) => clasa.startsWith(p)) && !RESTANTE.has(clasa) && !stil.includes(`.${clasa}`)
  );

/** Comentariile pot cita `styles.x` sau `fisier.tsx` fără să fie cod. */
const faraComentarii = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Clasele definite într-un `*.module.css`. */
const claseModul = (stil: string): Set<string> =>
  new Set([...faraComentarii(stil)
    .replace(/:global\([^)]*\)/g, '')
    .replace(/(['"])(?:\\.|(?!\1)[^\\])*?\1/g, '')
    .matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));

/** Modulele CSS importate de o sursă: numele legat și calea relativă. */
const importuriModul = (sursa: string): { nume: string; cale: string }[] =>
  [...sursa.matchAll(/import\s+(\w+)\s+from\s+'(\.[^']+\.module\.css)'/g)].map((m) => ({
    nume: m[1],
    cale: m[2],
  }));

/**
 * Mențiunile de `.module.css` pe care `importuriModul` nu le poate citi (alt fel
 * de import, alias `@/`, ghilimele duble). Garda pică pe ele în loc să le sară.
 */
export const importuriModulNecitite = (sursa: string): number =>
  (faraComentarii(sursa).match(/\.module\.css/g) ?? []).length - importuriModul(sursa).length;

/** `styles.x` și `styles['x']` pentru un nume legat. */
const referinte = (sursa: string, nume: string): string[] => [
  ...[...faraComentarii(sursa).matchAll(new RegExp(`\\b${nume}\\.([A-Za-z_]\\w*)`, 'g'))].map((m) => m[1]),
  ...[...faraComentarii(sursa).matchAll(new RegExp(`\\b${nume}\\['([^']+)'\\]`, 'g'))].map((m) => m[1]),
];

/** Referințele `styles.x` fără clasă în modulul importat. */
export const claseModulLipsa = (sursa: string, citesteModul: (cale: string) => string): string[] =>
  importuriModul(sursa).flatMap(({ nume, cale }) => {
    const definite = claseModul(citesteModul(cale));
    return referinte(sursa, nume).filter((clasa) => !definite.has(clasa));
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
      for (const clasa of claseGlobaleLipsa(readFileSync(fisier, 'utf8'), css)) {
        lipsa.set(clasa, [...(lipsa.get(clasa) ?? []), relativ]);
      }
    }

    expect(
      Object.fromEntries(lipsa),
      'Clase folosite în TSX dar fără nicio regulă în src/index.css sau src/edition3.css'
    ).toEqual({});
  });
});

describe('fiecare `styles.x` există în modulul lui', () => {
  it('nu există referințe la clase de modul inexistente', () => {
    const lipsa: Record<string, string[]> = {};
    for (const fisier of fisiereTsx(resolve(root, 'src'))) {
      const gasite = claseModulLipsa(readFileSync(fisier, 'utf8'), (cale) =>
        readFileSync(resolve(dirname(fisier), cale), 'utf8')
      );
      if (gasite.length) lipsa[fisier.slice(root.length + 1)] = gasite;
    }
    expect(lipsa, 'Clase de modul folosite în TSX dar nedefinite în `*.module.css`').toEqual({});
  });

  it('citește fiecare import de modul CSS', () => {
    const necitite = fisiereTsx(resolve(root, 'src'))
      .filter((f) => importuriModulNecitite(readFileSync(f, 'utf8')) !== 0)
      .map((f) => f.slice(root.length + 1));
    expect(necitite, "Importă modulul ca `import styles from './X.module.css'`").toEqual([]);
  });

  it('nu există clase de modul fără purtător', () => {
    const folosite = new Map<string, Set<string>>();
    for (const fisier of fisiereTsx(resolve(root, 'src'))) {
      const sursa = readFileSync(fisier, 'utf8');
      for (const { nume, cale } of importuriModul(sursa)) {
        const modul = resolve(dirname(fisier), cale);
        const set = folosite.get(modul) ?? new Set<string>();
        for (const clasa of referinte(sursa, nume)) set.add(clasa);
        folosite.set(modul, set);
      }
    }
    const orfane: Record<string, string[]> = {};
    for (const [modul, set] of folosite) {
      const neFolosite = [...claseModul(readFileSync(modul, 'utf8'))].filter((c) => !set.has(c));
      if (neFolosite.length) orfane[modul.slice(root.length + 1)] = neFolosite;
    }
    expect(orfane, 'Clase de modul pe care nu le mai poartă niciun element').toEqual({});
  });
});

/**
 * Modulele comune importate după modulul propriu al componentei.
 *
 * În bundle, CSS-ul intră în ordinea primului import. Când `styles` vine
 * înaintea unui modul comun, regulile comune pot ajunge după el și câștigă la
 * specificitate egală: `.e3-reg` își pierdea padding-ul în fața lui `.e3-sec`,
 * iar landing-ul ieșea cu 24px mai scurt, fără ca vreun test să observe.
 */
export const moduleDupaStyles = (sursa: string): string[] => {
  const importuri = importuriModul(sursa);
  const propriu = importuri.findIndex(({ nume }) => nume === 'styles');
  return propriu < 0 ? [] : importuri.slice(propriu + 1).map(({ cale }) => cale);
};

describe('modulul propriu vine ultimul', () => {
  it('`styles` e importat după modulele comune pe care le suprascrie', () => {
    const gresite: Record<string, string[]> = {};
    for (const fisier of fisiereTsx(resolve(root, 'src'))) {
      const dupa = moduleDupaStyles(readFileSync(fisier, 'utf8'));
      if (dupa.length) gresite[fisier.slice(root.length + 1)] = dupa;
    }
    expect(gresite, 'Mută `import styles` după celelalte importuri `*.module.css`').toEqual({});
  });

  it('prinde un modul comun importat după `styles`', () => {
    const sursa = "import styles from './A.module.css';\nimport shared1 from '../shared/ui/B.module.css';";
    expect(moduleDupaStyles(sursa)).toEqual(['../shared/ui/B.module.css']);
    expect(moduleDupaStyles("import shared1 from '../B.module.css';\nimport styles from './A.module.css';")).toEqual([]);
  });
});

/** Toate fișierele `*.module.css` din `src/`. */
const fisiereModul = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const cale = join(dir, e.name);
    if (e.isDirectory()) return fisiereModul(cale);
    return e.name.endsWith('.module.css') ? [cale] : [];
  });

/**
 * Animațiile pe care un modul le cere fără să le aibă. CSS Modules redenumește
 * și numele din `animation`, deci un keyframe global scris simplu (`fade-up`)
 * ar căuta un nume local inexistent, iar animația ar dispărea fără nicio eroare.
 * Un keyframe global se cere cu `global(fade-up)` și trebuie să existe în CSS-ul
 * global.
 */
/** Cuvintele unei declarații `animation` care nu sunt nume de animație. */
const CUVINTE_ANIMATIE = new Set([
  'none', 'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards',
  'both', 'running', 'paused', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start',
  'step-end', 'initial', 'inherit', 'unset',
]);

/** Numele de animație dintr-o valoare `animation`/`animation-name`, pe fiecare element al listei. */
const numeAnimatii = (valoare: string): string[] =>
  valoare
    // Funcțiile de timing (`cubic-bezier(...)`, `steps(...)`) și `var(...)` nu sunt nume.
    .replace(/\s*!important\b/g, '')
    .replace(/(?<!global)\([^)]*\)/g, '')
    .split(',')
    .flatMap((parte) => {
      const nume = parte
        .trim()
        .split(/\s+/)
        .find((t) => t !== '' && !CUVINTE_ANIMATIE.has(t) && !/^[\d.-]/.test(t) && !/^(cubic-bezier|steps|var)$/.test(t));
      return nume ? [nume] : [];
    });

export const animatiiLipsa = (modul: string, global: string): string[] => {
  const text = faraComentarii(modul);
  const locale = new Set([...text.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  const globale = new Set([...global.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  return [...text.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].flatMap((m) =>
    numeAnimatii(m[1]).filter((nume) => {
      const g = /^global\(([\w-]+)\)$/.exec(nume);
      return g ? !globale.has(g[1]) : !locale.has(nume);
    })
  );
};

describe('animațiile din module există', () => {
  it('fiecare `animation` dintr-un modul are keyframe-ul lui', () => {
    const lipsa: Record<string, string[]> = {};
    for (const fisier of fisiereModul(resolve(root, 'src'))) {
      const gasite = animatiiLipsa(readFileSync(fisier, 'utf8'), css);
      if (gasite.length) lipsa[fisier.slice(root.length + 1)] = gasite;
    }
    expect(lipsa, 'Scrie `global(nume)` pentru un keyframe global').toEqual({});
  });
});

describe('garda însăși', () => {
  it('prinde un keyframe global cerut fără `global()`', () => {
    const global = '@keyframes fade-up { from { opacity: 0; } }';
    expect(animatiiLipsa('.a { animation: fade-up 1s both; }', global)).toEqual(['fade-up']);
    expect(animatiiLipsa('.a { animation: global(fade-up) 1s; }', global)).toEqual([]);
    expect(animatiiLipsa('.a { animation: global(nu-exista) 1s; }', global)).toEqual(['global(nu-exista)']);
    expect(animatiiLipsa('@keyframes in { } .a { animation: in 1s; } .b { animation: none !important; }', global)).toEqual([]);
    // Durata înainte de nume și liste separate prin virgulă.
    expect(animatiiLipsa('.a { animation: 1s ease-out fade-up; }', global)).toEqual(['fade-up']);
    expect(animatiiLipsa('.a { animation: global(fade-up) 1s, fade-up 2s; }', global)).toEqual(['fade-up']);
    expect(animatiiLipsa('.a { animation: 0.3s cubic-bezier(0.2, 0, 0, 1) both global(fade-up); }', global)).toEqual([]);
  });


  it('prinde un `styles.x` care nu există în modul', () => {
    const sursa = "import styles from './Card.module.css';\nexport const C = () => <div className={styles.nuExista} />;";
    expect(claseModulLipsa(sursa, () => '.exista { color: red; }')).toEqual(['nuExista']);
    expect(claseModulLipsa(sursa, () => ':global(.nuExista) { color: red; }')).toEqual(['nuExista']);
    const svg = "import styles from './Card.module.css';\nconst C = () => <div className={styles.card} />;";
    expect(claseModulLipsa(svg, () => '.card { background: url("https://www.w3.org/a.svg"); }')).toEqual([]);
  });

  it('nu sare peste un import de modul pe care nu-l poate citi', () => {
    expect(importuriModulNecitite('import * as s from "@/shared/ui/X.module.css";')).toBe(1);
    expect(importuriModulNecitite("import styles from './X.module.css';")).toBe(0);
  });

  it('prinde o clasă globală inventată cu un prefix cunoscut', () => {
    const sursa = '<div className="admin-inventata admin-reala" />';
    expect(claseGlobaleLipsa(sursa, '.admin-reala { color: red; }')).toEqual(['admin-inventata']);
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
