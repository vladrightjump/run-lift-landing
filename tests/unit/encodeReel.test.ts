import { describe, it, expect } from 'vitest';
import {
  argumenteVideo,
  argumentePoster,
  slugValid,
  verdictMarime,
  PLAFON_MB,
  SECUNDE_IMPLICIT,
  CRF,
} from '../../scripts/encode-reel';

/**
 * Comanda care duce un master de 200 MB la clipul pe care îl servește pagina.
 *
 * Testăm construcția argumentelor, nu `ffmpeg`: trei dintre ele sunt
 * load-bearing (`-an`, `+faststart`, CRF) și o regresie în oricare dintre ele
 * s-ar vedea abia în producție, ca un clip care nu pornește singur sau care
 * așteaptă descărcarea completă înainte de primul cadru.
 */

const argsFor = (over = {}) =>
  argumenteVideo({ master: 'master.mp4', iesire: 'public/reels/x.mp4', ...over });

/** `-vf` și valoarea lui sunt două elemente separate în tablou. */
const valoareaLui = (args: string[], steag: string): string | undefined =>
  args[args.indexOf(steag) + 1];

describe('argumentele clipului', () => {
  it('scoate pista audio — fără asta, pornirea automată e blocată de browser', () => {
    expect(argsFor()).toContain('-an');
  });

  it('mută metadatele la început, ca redarea să nu aștepte tot fișierul', () => {
    expect(valoareaLui(argsFor(), '-movflags')).toBe('+faststart');
  });

  it('scalează și decupează la 1080x1920', () => {
    expect(valoareaLui(argsFor(), '-vf')).toBe(
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
    );
  });

  it('țintește o calitate (CRF), nu un bitrate', () => {
    expect(valoareaLui(argsFor(), '-crf')).toBe(String(CRF));
    expect(argsFor()).not.toContain('-b:v');
  });

  it('folosește bucla implicită când nu i se dă alta', () => {
    expect(valoareaLui(argsFor(), '-t')).toBe(String(SECUNDE_IMPLICIT));
  });

  it('o durată dată explicit o înlocuiește pe cea implicită', () => {
    expect(valoareaLui(argsFor({ secunde: 9 }), '-t')).toBe('9');
  });

  it('scrie unde i se spune, nu lângă master', () => {
    expect(argsFor().at(-1)).toBe('public/reels/x.mp4');
  });
});

describe('argumentele poster-ului', () => {
  it('ia un singur cadru din clipul deja encodat', () => {
    const args = argumentePoster('public/reels/x.mp4', 'public/reels/x.jpg');
    expect(valoareaLui(args, '-i')).toBe('public/reels/x.mp4');
    expect(valoareaLui(args, '-vframes')).toBe('1');
    expect(args.at(-1)).toBe('public/reels/x.jpg');
  });
});

describe('slug-ul', () => {
  it('acceptă un nume obișnuit', () => {
    expect(slugValid('marti-in-parc')).toBe(true);
  });

  it('respinge calea în afara directorului de clipuri', () => {
    expect(slugValid('../../etc/passwd')).toBe(false);
    expect(slugValid('a/b')).toBe(false);
  });

  it('respinge majuscule, spații și un singur caracter', () => {
    expect(slugValid('Marti')).toBe(false);
    expect(slugValid('marti in parc')).toBe(false);
    expect(slugValid('x')).toBe(false);
  });
});

describe('verdictul de mărime', () => {
  it('un clip sub plafon trece', () => {
    expect(verdictMarime(3 * 1024 * 1024)).toBe('ok');
  });

  it('exact pe plafon încă trece', () => {
    expect(verdictMarime(PLAFON_MB * 1024 * 1024)).toBe('ok');
  });

  it('peste plafon e semnalat, nu scris tăcut', () => {
    expect(verdictMarime(PLAFON_MB * 1024 * 1024 + 1)).toBe('prea-mare');
  });
});
