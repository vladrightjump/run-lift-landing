import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { it, expect } from 'vitest';

it('fails the test when application code swallows an unmatched fetch rejection', async () => {
  let escaped = 0;
  const backend = createServer((_request, response) => {
    escaped++;
    response.end('escaped');
  });
  await new Promise<void>((done) => backend.listen(0, '127.0.0.1', done));
  const address = backend.address();
  if (!address || typeof address === 'string') throw new Error('Missing probe server address');
  const url = `http://127.0.0.1:${address.port}/unmatched_guard_probe`;
  const directory = await mkdtemp(resolve('tests/support/guard-probe-'));
  try {
    const fixture = resolve(directory, 'swallowed.test.ts');
    const config = resolve(directory, 'vitest.config.mjs');
    await writeFile(fixture, `import { it, expect } from 'vitest';
it('swallows the rejected request', async () => {
  const result = await fetch(${JSON.stringify(url)}).catch(() => 'caught');
  expect(result).toBe('caught');
});
`);
    await writeFile(config, `export default ${JSON.stringify({
      test: { include: [fixture], setupFiles: [resolve('tests/support/vitest.setup.ts')] },
    })};`);
    const child = await promisify(execFile)(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', config], {
      timeout: 20_000,
      env: { ...process.env, NO_COLOR: '1' },
    }).then(
      ({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }),
      (error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, output: error.stdout + error.stderr }),
    );
    expect(child.code).toBe(1);
    expect(child.output).toContain(`Unhandled requests:\n${url}`);
    expect(child.output).toContain('1 failed');
    expect(escaped).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await new Promise<void>((done, reject) => backend.close((error) => error ? reject(error) : done()));
  }
}, 30_000);
