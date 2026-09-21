import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTrainingReels, SubmitHttpError } from '../../src/lib/supabase';

/**
 * Citirea clipurilor din `public_training_reels()`.
 *
 * Ce se păzește aici e toleranța ȘI limita ei. O intrare stricată nu are de ce
 * să ascundă banda întreagă — dar o cale sau un link care nu arată a ce trebuie
 * NU intră în pagină, oricât de tolerant ar fi restul. Constrângerile din DB
 * sînt prima apărare; asta e a doua, pentru o scriere directă în bază.
 */

let fetchMock: ReturnType<typeof vi.fn>;

const raspunde = (corp: unknown, status = 200) => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(corp), { status }));
  vi.stubGlobal('fetch', fetchMock);
};

const CLIP = {
  video: '/reels/marti.mp4',
  poster: '/reels/marti.jpg',
  caption: 'Marți în parc',
  url: 'https://www.instagram.com/reel/ABC12345/',
};

beforeEach(() => raspunde([]));
afterEach(() => vi.unstubAllGlobals());

describe('lista publică', () => {
  it('păstrează ordinea primită de la server — ea E ordinea din bandă', async () => {
    const al2lea = { ...CLIP, video: '/reels/joi.mp4', caption: 'Joi' };
    raspunde([CLIP, al2lea]);
    const reels = await fetchTrainingReels();
    expect(reels.map((r) => r.video)).toEqual(['/reels/marti.mp4', '/reels/joi.mp4']);
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
  it('o cale care nu e sub /reels/ nu intră în pagină', async () => {
    raspunde([{ ...CLIP, video: 'https://alt-domeniu.example/x.mp4' }, CLIP]);
    const reels = await fetchTrainingReels();
    expect(reels).toHaveLength(1);
    expect(reels[0].video).toBe('/reels/marti.mp4');
  });

  it('un link care nu duce pe Instagram nu intră în pagină', async () => {
    raspunde([{ ...CLIP, url: 'https://example.com/pagina' }, CLIP]);
    expect(await fetchTrainingReels()).toHaveLength(1);
  });

  it('o intrare fără câmpuri obligatorii cade singură', async () => {
    raspunde([null, 'text', {}, CLIP]);
    expect(await fetchTrainingReels()).toHaveLength(1);
  });

  it('poster-ul și legenda lipsă sînt tolerate — cardul are rezerve pentru amândouă', async () => {
    raspunde([{ video: CLIP.video, url: CLIP.url }]);
    const [reel] = await fetchTrainingReels();
    expect(reel.poster).toBe('');
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
