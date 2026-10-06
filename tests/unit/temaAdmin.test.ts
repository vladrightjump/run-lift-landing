import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tema „Panoul" a adminului (R31, R32, R36; KTD2 din planul
 * docs/plans/2026-10-06-1331-feat-redesign-admin-panoul-plan.md).
 *
 * Ce păzește: adminul are jetoanele LUI, definite o singură dată pe rădăcina
 * adminului, iar regulile adminului nu mai citesc jetoanele `--e3-*` ale
 * paginii publice. Altfel, o schimbare de culoare pe landing ar vopsi și
 * backoffice-ul — sau invers, tema luminoasă ar ajunge pe pagina publică.
 *
 * Contrastul se calculează din valorile jetoanelor, nu din ochi: o pereche
 * text/suprafață sub 4.5:1 e o etichetă pe care organizatorul n-o citește în
 * soare, la antrenament.
 */

const css = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8');
const MARCA = '/* ==== Admin backoffice (/admin) ==== */';
const admin = css.slice(css.indexOf(MARCA));

const blocTema = /\.admin-pagina,\s*\.admin-app\s*\{([^}]*)\}/.exec(admin)?.[1] ?? '';
const jetoane = new Map<string, string[]>();
for (const m of blocTema.matchAll(/(--pa-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  jetoane.set(m[1], [...(jetoane.get(m[1]) ?? []), m[2].trim()]);
}
const val = (nume: string): string => jetoane.get(nume)?.[0] ?? '';

const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('tema Panoul a adminului', () => {
  it('are un bloc de jetoane pe rădăcina adminului', () => {
    expect(blocTema).not.toBe('');
    expect(jetoane.size).toBeGreaterThan(20);
  });

  it('definește fiecare jeton o singură dată', () => {
    const duble = [...jetoane].filter(([, v]) => v.length > 1).map(([k]) => k);
    expect(duble).toEqual([]);
  });

  it('nicio regulă a adminului nu citește jetoanele paginii publice', () => {
    const scapate = admin.match(/var\(--e3-[a-z-]+/g) ?? [];
    expect(scapate).toEqual([]);
  });

  it('fiecare jeton folosit în regulile adminului e definit', () => {
    const folosite = new Set([...admin.matchAll(/var\((--pa-[a-z0-9-]+)/g)].map((m) => m[1]));
    const lipsa = [...folosite].filter((j) => !jetoane.has(j));
    expect(lipsa).toEqual([]);
  });

  it.each([
    ['--pa-text', '--pa-bg'],
    ['--pa-text', '--pa-surface'],
    ['--pa-muted', '--pa-surface'],
    ['--pa-muted', '--pa-bg'],
    ['--pa-muted-2', '--pa-surface'],
    ['--pa-muted-2', '--pa-bg'],
    ['--pa-muted-2', '--pa-surface-2'],
    ['--pa-accent-ink', '--pa-accent'],
    ['--pa-accent-text', '--pa-surface'],
    ['--pa-accent-text', '--pa-accent-soft'],
    ['--pa-danger', '--pa-surface'],
    ['--pa-danger', '--pa-danger-soft'],
    ['--pa-warn', '--pa-warn-soft'],
    ['--pa-ink-text', '--pa-ink'],
  ])('textul %s pe %s are contrast de cel puțin 4.5:1', (text, fundal) => {
    expect(contrast(val(text), val(fundal))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['--pa-graph', '--pa-surface'],
    ['--pa-graph-2', '--pa-surface'],
    ['--pa-graph-warn', '--pa-surface'],
    ['--pa-line-control', '--pa-surface'],
    ['--pa-line-control', '--pa-bg'],
    ['--pa-focus', '--pa-surface'],
  ])('controlul sau graficul %s pe %s are contrast de cel puțin 3:1', (c, fundal) => {
    expect(contrast(val(c), val(fundal))).toBeGreaterThanOrEqual(3);
  });

  it('are durate de mișcare și anulează mișcarea când sistemul o cere', () => {
    expect(val('--pa-dur')).toMatch(/ms$/);
    expect(admin).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.admin-app \*/);
  });
});
