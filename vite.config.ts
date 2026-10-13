import { createHash } from 'node:crypto';
import { basename, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';
import { META_PLACEHOLDERS, META_PER_SHELL } from './src/shared/content/meta';

// Injectează meta (title/description/Open Graph) în shell-urile HTML la build ȘI
// în dev, din `src/shared/content/meta.ts` (derivat din EDITION). Astfel meta de share e
// mereu în sincron cu ediția, fără editări manuale în HTML.
// Vezi README.md („Decizii de arhitectură").
//
// Două shell-uri, aceleași placeholdere, seturi diferite de valori: `index.html`
// primește cardul ediției, `antrenament.html` pe al lui. Un shell necunoscut cade
// pe setul ediției, ca un fișier nou să nu rămână cu `%META_TITLE%` în titlu.
const injectEditionMeta = (): Plugin => ({
  name: 'inject-edition-meta',
  transformIndexHtml(html: string, ctx: { filename?: string; path?: string }) {
    const nume = (ctx.filename ?? ctx.path ?? '').split('/').pop() ?? '';
    const valori = META_PER_SHELL[nume] ?? META_PLACEHOLDERS;
    let out = html;
    for (const [placeholder, value] of Object.entries(valori)) {
      out = out.split(placeholder).join(value);
    }
    return out;
  },
});

// Numele claselor din `*.module.css`: lizibile în dev
// (`Suprapunere__dialog__3f2a`), scurte în build (`k3f2a1c`). Hash-ul e hex,
// deci numele e mereu un identificator CSS valid, și ține cont de cale: două
// module cu același nume în foldere diferite nu-și împart clasele.
const hashClasa = (local: string, fisier: string) =>
  createHash('sha256').update(`${relative(__dirname, fisier)}:${local}`).digest('hex');
const numeClasaModul = (command: 'serve' | 'build') =>
  command === 'serve'
    ? (local: string, fisier: string) =>
        `${basename(fisier).replace(/\.module\.css$/, '')}__${local}__${hashClasa(local, fisier).slice(0, 4)}`
    : (local: string, fisier: string) => `k${hashClasa(local, fisier).slice(0, 6)}`;

export default defineConfig(({ command }) => ({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  css: {
    modules: { generateScopedName: numeClasaModul(command) },
  },
  plugins: [
    react(),
    injectEditionMeta(),
    // The worker-only plugin emits a build asset unless it is restricted to dev.
    { ...msw({ mode: 'worker-only' }), apply: 'serve' },
  ],
  define: {
    // Ștampilează mediul Vercel în bundle, ca pagina să știe dacă e producție.
    // O folosește `shared/lib/canonicalHost.ts`: doar producția mută vizitatorii de pe
    // `*.vercel.app` pe domeniul evenimentului; preview-urile de PR rămân unde
    // sunt, altfel n-ar mai exista cum să verifici o schimbare înainte de merge.
    // Local și în teste variabila lipsește → 'development' → nu se redirectează.
    __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'development'),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      // Două intrări, deci două fișiere HTML în `dist/`. A doua există pentru
      // cardul de share al paginii /antrenament — `vercel.json` rutează acolo.
      input: {
        index: resolve(__dirname, 'index.html'),
        antrenament: resolve(__dirname, 'antrenament.html'),
      },
    },
  },
}));
