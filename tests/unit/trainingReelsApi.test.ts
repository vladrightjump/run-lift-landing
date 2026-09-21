import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listTrainingReels,
  saveTrainingReel,
  moveTrainingReel,
  deleteTrainingReel,
  mesajRefuzClip,
  InvalidTokenError,
} from '../../src/lib/adminApi';

/**
 * Wrapperele RPC ale benzii, plus traducerea refuzurilor.
 *
 * Testul de componentă mock-uiește tot modulul `adminApi`, deci fără fișierul
 * ăsta forma apelurilor n-ar fi verificată nicăieri: un `p_video` scris greșit
 * ar trece de typecheck (argumentele sînt un obiect liber) și ar pica abia în
 * fața organizatorului.
 *
 * `mesajRefuzClip` merită testat separat fiindcă se potrivește pe NUMELE
 * constrângerilor din baza de date. O redenumire acolo, sau o literă greșită
 * aici, îl transformă tăcut în „Nu a mers. Încearcă din nou." — adică exact
 * mesajul pe care textele astea există ca să-l evite.
 */

let fetchMock: ReturnType<typeof vi.fn>;

const raspunde = (corp: unknown, status = 200) => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(corp), { status }));
  vi.stubGlobal('fetch', fetchMock);
};

/** Corpul trimis de ultimul apel, deserializat. */
const trimis = (): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

const numeRpc = (): string =>
  (fetchMock.mock.calls[0][0] as string).split('/rest/v1/rpc/')[1];

beforeEach(() => raspunde([]));
afterEach(() => vi.unstubAllGlobals());

describe('citirea listei', () => {
  it('cere lista de admin cu tokenul', async () => {
    raspunde([{ id: 'r1', numar: 1 }]);
    await listTrainingReels('tok');
    expect(numeRpc()).toBe('admin_list_training_reels');
    expect(trimis()).toEqual({ p_token: 'tok' });
  });

  it('un token respins de server devine InvalidTokenError, nu o eroare de rețea', async () => {
    fetchMock = vi.fn(async () => new Response('invalid_token', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listTrainingReels('tok')).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe('salvarea', () => {
  it('un clip nou trimite `p_id: null` — numărul îl pune serverul', async () => {
    raspunde('id-nou');
    await saveTrainingReel(
      'tok',
      null,
      '/reels/marti.mp4',
      '/reels/marti.jpg',
      'Marți în parc',
      'https://www.instagram.com/reel/AAAAA11111/',
      true
    );
    expect(numeRpc()).toBe('admin_save_training_reel');
    expect(trimis()).toEqual({
      p_token: 'tok',
      p_id: null,
      p_video: '/reels/marti.mp4',
      p_poster: '/reels/marti.jpg',
      p_caption: 'Marți în parc',
      p_url: 'https://www.instagram.com/reel/AAAAA11111/',
      p_vizibil: true,
    });
  });

  it('editarea trimite id-ul clipului', async () => {
    raspunde('r1');
    await saveTrainingReel('tok', 'r1', '/reels/x.mp4', '', 'X', 'https://www.instagram.com/p/B1/', false);
    expect(trimis().p_id).toBe('r1');
    expect(trimis().p_vizibil).toBe(false);
  });
});

describe('mutarea și scoaterea', () => {
  it('mutarea trimite direcția, nu lista întreagă', async () => {
    raspunde(2);
    await moveTrainingReel('tok', 'r1', 1);
    expect(numeRpc()).toBe('admin_move_training_reel');
    expect(trimis()).toEqual({ p_token: 'tok', p_id: 'r1', p_directie: 1 });
  });

  it('scoaterea trimite doar id-ul', async () => {
    raspunde(1);
    await deleteTrainingReel('tok', 'r1');
    expect(numeRpc()).toBe('admin_delete_training_reel');
    expect(trimis()).toEqual({ p_token: 'tok', p_id: 'r1' });
  });
});

describe('traducerea refuzurilor', () => {
  const cazuri: [string, RegExp][] = [
    ['training_reels_fisier_ok', /npm run reel/],
    ['training_reels_poster_ok', /\.jpg/],
    ['training_reels_url_ok', /fără „\?"/],
    ['training_reels_caption_ok', /cititor de ecran/],
    ['training_reels_un_fisier', /deja în bandă/],
    ['not_found', /nu mai există/],
    ['directie_invalida', /muta clipul|mutat clipul/],
  ];

  it.each(cazuri)('„%s" primește un text propriu', (constrangere, asteptat) => {
    expect(mesajPentru(constrangere)).toMatch(asteptat);
  });

  it('un refuz necunoscut cade pe un mesaj neutru ca verb', () => {
    // Neutru deliberat: aceeași traducere servește și mutarea, și scoaterea.
    // „Nu am putut salva" pe o scoatere eșuată ar fi trimis omul în formular.
    expect(mesajRefuzClip(new Error('ceva cu totul nou'))).toBe('Nu a mers. Încearcă din nou.');
  });

  it('fiecare caz cunoscut chiar diferă de mesajul neutru', () => {
    // Fără asta, o greșeală de scriere în orice `includes` ar trece neobservată:
    // testul de mai sus ar fi trecut, fiindcă potrivirea ar fi căzut pe fallback.
    const neutru = 'Nu a mers. Încearcă din nou.';
    for (const [constrangere] of cazuri) {
      expect(mesajPentru(constrangere)).not.toBe(neutru);
    }
  });
});

/** Refuzul serverului ajunge ca `Error` cu corpul răspunsului în mesaj. */
const mesajPentru = (constrangere: string): string =>
  mesajRefuzClip(new Error(`violates check constraint "${constrangere}"`));
