import { describe, it, expect } from 'vitest';
import { redirectCanonic, HOST_CANONIC } from '../../src/lib/canonicalHost';

/**
 * Ținerea vizitatorilor pe domeniul de producție.
 *
 * Două proprietăți contează la fel de mult: producția pe `*.vercel.app` mută
 * omul pe domeniul evenimentului, ȘI preview-urile de PR NU-l mută — altfel
 * n-ar mai exista niciun fel de a verifica o schimbare înainte de merge.
 */

const prod = (href: string) => redirectCanonic({ env: 'production', href });

describe('mediul decide', () => {
  it('preview-ul de PR rămâne unde e', () => {
    expect(
      redirectCanonic({
        env: 'preview',
        href: 'https://run-lift-landing-git-feat-x.vercel.app/despre-noi',
      })
    ).toBeNull();
  });

  it('dev-ul local rămâne unde e', () => {
    expect(redirectCanonic({ env: 'development', href: 'http://localhost:5173/' })).toBeNull();
  });
});

describe('pe producție', () => {
  it('URL-ul Vercel duce pe domeniul evenimentului', () => {
    expect(prod('https://run-lift-landing.vercel.app/')).toBe(`https://${HOST_CANONIC}/`);
  });

  it('domeniul bun nu se mai mută nicăieri', () => {
    // Altfel redirectul s-ar relua la nesfârșit.
    expect(prod(`https://${HOST_CANONIC}/despre-noi`)).toBeNull();
  });

  it('calea, query-ul și ancora se păstrează', () => {
    // Un link din email către /confirmare?token=… trebuie să ajungă la
    // confirmare, nu pe homepage.
    expect(prod('https://run-lift-landing.vercel.app/confirmare?token=abc#sus')).toBe(
      `https://${HOST_CANONIC}/confirmare?token=abc#sus`
    );
  });

  it('destinația nu poate ieși de pe domeniul canonic', () => {
    // Originea e o constantă, nu ceva preluat din `href` — forma asta e exact
    // ce ar fi trebuit să fie un open redirect.
    const tinta = prod('https://run-lift-landing.vercel.app//evil.example.com/x');
    expect(new URL(tinta as string).host).toBe(HOST_CANONIC);
  });

  it('un href imposibil de parsat nu mută pe nimeni', () => {
    expect(prod('nu-i un url')).toBeNull();
  });
});
