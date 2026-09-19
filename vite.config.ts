import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { META_PLACEHOLDERS, META_PER_SHELL } from './src/content/meta';

// Injectează meta (title/description/Open Graph) în shell-urile HTML la build ȘI
// în dev, din `src/content/meta.ts` (derivat din EDITION). Astfel meta de share e
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

export default defineConfig({
  plugins: [react(), injectEditionMeta()],
  define: {
    // Ștampilează mediul Vercel în bundle, ca pagina să știe dacă e producție.
    // O folosește `lib/canonicalHost.ts`: doar producția mută vizitatorii de pe
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
});
