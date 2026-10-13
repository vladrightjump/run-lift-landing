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
      name: 'legacy-via-index',
      severity: 'error',
      comment:
        'Codul încă nemutat (src/admin, src/components, …) și app/ folosesc o funcționalitate numai prin index.ts.',
      from: { path: '^src/', pathNot: ['^src/features/', '^src/admin/'] },
      to: { path: '^src/features/', pathNot: '^src/features/[^/]+/index\\.ts$' },
    },
    {
      name: 'legacy-admin-public-api',
      severity: 'error',
      // U11 -> U12 only: old training screens belong to this same admin feature.
      // Direct admin imports avoid cycles through its lazy route barrel.
      from: { path: '^src/admin/' },
      to: {
        path: '^src/features/',
        pathNot: ['^src/features/admin/', '^src/features/[^/]+/index\\.ts$'],
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
    // Tot `src/`: regulile constrâng doar structura nouă, dar și codul vechi
    // trebuie să intre într-o funcționalitate prin `index.ts`.
    includeOnly: '^src/',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
