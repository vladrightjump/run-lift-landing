const { readdirSync } = require('node:fs');
const { join } = require('node:path');

// dependency-cruiser vede modulele; verificarea de mai jos vede și fișierele
// neimportate sau fără cod (CSS, imagini, text). Orice descendent trebuie să
// stea într-unul dintre cele trei directoare ale aplicației.
const inAfaraStructurii = readdirSync(join(__dirname, 'src'), { withFileTypes: true })
  .filter((entry) => !entry.isDirectory() || !['app', 'features', 'shared'].includes(entry.name))
  .map((entry) => `src/${entry.name}`);
if (inAfaraStructurii.length) {
  throw new Error(`Structură src invalidă: ${inAfaraStructurii.join(', ')}. Folosește src/app, src/features sau src/shared.`);
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'feature-public-api',
      severity: 'error',
      comment: 'O funcționalitate poate importa alta numai prin index.ts al acesteia.',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/',
        pathNot: ['^src/features/$1/', '^src/features/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-no-features',
      severity: 'error',
      comment: 'Codul comun nu depinde de funcționalități, nici prin API-ul public.',
      from: { path: '^src/shared/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Fără cicluri de import, nici între funcționalități prin index.ts.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Toate modulele din src, inclusiv cele fără importatori. app poate importa orice.
    includeOnly: '^src/',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
