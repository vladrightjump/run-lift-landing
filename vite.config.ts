import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { META_PLACEHOLDERS } from './src/content/meta';

// Injectează meta (title/description/Open Graph) în index.html la build ȘI în
// dev, din `src/content/meta.ts` (derivat din EDITION). Astfel meta de share e
// mereu în sincron cu ediția, fără editări manuale în index.html.
// Vezi TASK-FOR-CLAUDE.md (Decizii de arhitectură).
const injectEditionMeta = (): Plugin => ({
  name: 'inject-edition-meta',
  transformIndexHtml(html: string) {
    let out = html;
    for (const [placeholder, value] of Object.entries(META_PLACEHOLDERS)) {
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
  },
});
