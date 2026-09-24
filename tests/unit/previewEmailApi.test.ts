import { describe, it, expect, vi, afterEach } from 'vitest';
import { previewEmailHtml } from '../../src/lib/adminApi';

/**
 * Previzualizarea unei ciorne de șablon, văzută din client.
 *
 * Funcția `send-email` se deployează de mână, site-ul la fuziune. Între cele
 * două, o funcție veche ignoră subiectul și textul trimise și randează
 * șablonul din bază — iar ecranul l-ar prezenta drept ciornă. Clientul cere
 * deci confirmarea explicită că s-a randat ciorna.
 */

let fetchMock: ReturnType<typeof vi.fn>;

const raspunde = (corp: unknown, status = 200) => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(corp), { status }));
  vi.stubGlobal('fetch', fetchMock);
};

const trimis = (): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

const PREVIZ = { html: '<p>x</p>', subiect: 'S', pentru: { email: 'a@b.ro', nume: 'A' } };

afterEach(() => vi.unstubAllGlobals());

describe('previewEmailHtml', () => {
  it('fără ciornă, cere șablonul din bază și nu cere confirmare', async () => {
    raspunde(PREVIZ);
    await expect(previewEmailHtml('tok', 'confirmare')).resolves.toEqual(PREVIZ);
    expect(trimis()).toEqual({ mode: 'preview', token: 'tok', template: 'confirmare' });
  });

  it('cu ciornă, trimite subiectul și textul', async () => {
    raspunde({ ...PREVIZ, ciorna: true });
    await previewEmailHtml('tok', 'confirmare', {
      email: 'a@b.ro',
      ciorna: { subiect: 'Nou', text: 'Text nou' },
    });
    expect(trimis()).toMatchObject({ email: 'a@b.ro', subiect: 'Nou', text: 'Text nou' });
  });

  it('o funcție care n-a randat ciorna e o eroare, nu șablonul vechi prezentat drept ciornă', async () => {
    raspunde(PREVIZ);
    await expect(
      previewEmailHtml('tok', 'confirmare', { ciorna: { subiect: 'Nou', text: 'Text nou' } })
    ).rejects.toThrow('draft_not_rendered');
  });
});
