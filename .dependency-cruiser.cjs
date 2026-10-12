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
  ],
  options: {
    // Verifică numai structura nouă; folderele vechi rămân până la migrarea lor.
    includeOnly: '^src/(app|features|shared)/',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
