/// <reference types="vite/client" />

/**
 * `VERCEL_ENV` ștampilat la build ('production' | 'preview' | 'development').
 * Injectat prin `define` în `vite.config.ts`; consumat de `lib/canonicalHost.ts`.
 */
declare const __VERCEL_ENV__: string;
