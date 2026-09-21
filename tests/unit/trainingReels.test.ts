import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTrainingReels, SubmitHttpError } from '../../src/lib/supabase';

/**
 * Citirea clipurilor din `public_training_reels()`.
 *
 * Ce se păzește aici e toleranța ȘI limita ei. O intrare stricată nu are de ce
 * să ascundă banda întreagă — dar un identificator sau un link care nu arată a
 * ce trebuie NU intră în pagină, oricât de tolerant ar fi restul. Din
 * identificator iese un `src` de `iframe`, deci limita chiar contează.
 * Constrângerile din DB sînt prima apărare; asta e a doua, pentru o scriere
 * directă în bază.
 */

let fetchMock: ReturnType<typeof vi.fn>;

const raspunde = (corp: unknown, status = 200) => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(corp), { status }));
  vi.stubGlobal('fetch', fetchMock);
};

const CLIP = {
  youtube: 'dQw4w9WgXcQ',
  caption: 'Marți în parc',
  url: 'https://www.instagram.com/reel/ABC12345/',
};

beforeEach(() => raspunde([]));
afterEach(() => vi.unstubAllGlobals());

describe('lista publică', () => {
  it('păstrează ordinea primită de la server — ea E ordinea din bandă', async () => {
    const al2lea = { ...CLIP, youtube: '_-Ab0123456', caption: 'Joi' };
    raspunde([CLIP, al2lea]);
    const reels = await fetchTrainingReels();
    expect(reels.map((r) => r.youtube)).toEqual(['dQw4w9WgXcQ', '_-Ab0123456']);
  });

  it('lista goală e o stare validă, nu o eroare', async () => {
    raspunde([]);
    await expect(fetchTrainingReels()).resolves.toEqual([]);
  });

  it('un răspuns care nu e listă nu rupe pagina', async () => {
    raspunde({ eroare: 'ceva' });
    await expect(fetchTrainingReels()).resolves.toEqual([]);
  });

  it('un HTTP neplăcut se ridică, nu se înghite', async () => {
    raspunde([], 500);
    await expect(fetchTrainingReels()).rejects.toBeInstanceOf(SubmitHttpError);
  });
});

describe('intrarea stricată cade, restul rămâne', () => {
  it('un identificator de formă greșită nu intră în pagină', async () => {
    raspunde([{ ...CLIP, youtube: 'https://alt-domeniu.example/x.mp4' }, CLIP]);
    const reels = await fetchTrainingReels();
    expect(reels).toHaveLength(1);
    expect(reels[0].youtube).toBe('dQw4w9WgXcQ');
  });

  it('o cale de fișier — forma veche — nu mai intră în pagină', async () => {
    raspunde([{ ...CLIP, youtube: '/reels/marti.mp4' }]);
    expect(await fetchTrainingReels()).toEqual([]);
  });

  it('un link care nu duce pe Instagram nu intră în pagină', async () => {
    raspunde([{ ...CLIP, url: 'https://example.com/pagina' }, CLIP]);
    expect(await fetchTrainingReels()).toHaveLength(1);
  });

  it('o intrare fără câmpuri obligatorii cade singură', async () => {
    raspunde([null, 'text', {}, CLIP]);
    expect(await fetchTrainingReels()).toHaveLength(1);
  });

  it('legenda lipsă e tolerată — cardul are o rezervă pentru ea', async () => {
    raspunde([{ youtube: CLIP.youtube, url: CLIP.url }]);
    const [reel] = await fetchTrainingReels();
    expect(reel.caption).toBe('');
  });
});

describe('forma cererii', () => {
  it('merge pe RPC-ul public, cu schema rutată prin header', async () => {
    await fetchTrainingReels();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rest/v1/rpc/public_training_reels');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Profile']).toBe('runlift');
  });
});
