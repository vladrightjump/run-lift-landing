import { describe, it, expect } from 'vitest';
import { idYouTube, linkYouTube, sursaIncorporare } from '../../src/lib/youtube';

/**
 * Normalizarea linkului lipit.
 *
 * Ce se păzește aici e promisiunea din ecranul de admin: organizatorul apasă
 * „Copiază linkul" oriunde în YouTube și lipește. Formele diferă după unde a
 * apăsat, iar coada de parametri vine aproape întotdeauna.
 */

const ID = 'dQw4w9WgXcQ';

describe('formele pe care le dă YouTube', () => {
  it('linkul scurt de pe telefon', () => {
    expect(idYouTube(`https://youtu.be/${ID}`)).toBe(ID);
  });

  it('pagina de Shorts', () => {
    expect(idYouTube(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
  });

  it('butonul de partajare de pe desktop', () => {
    expect(idYouTube(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('un identificator lipit singur trece ca atare', () => {
    expect(idYouTube(ID)).toBe(ID);
  });

  it('identificatorul cu liniuță și underscore nu e o excepție', () => {
    expect(idYouTube('https://youtu.be/_-Ab0123456')).toBe('_-Ab0123456');
  });
});

describe('coada de parametri', () => {
  it('se taie de pe linkul scurt', () => {
    expect(idYouTube(`https://youtu.be/${ID}?si=abc123&t=15`)).toBe(ID);
  });

  it('se taie de pe Shorts', () => {
    expect(idYouTube(`https://www.youtube.com/shorts/${ID}?feature=share`)).toBe(ID);
  });

  it('nu încurcă `v` cu alți parametri de pe `watch`', () => {
    expect(idYouTube(`https://www.youtube.com/watch?list=PL123&v=${ID}&index=2`)).toBe(ID);
  });

  it('spațiile din jur nu contează — lipitul le aduce des', () => {
    expect(idYouTube(`  https://youtu.be/${ID}  `)).toBe(ID);
  });
});

describe('subdomenii și variante de gazdă', () => {
  it('`m.youtube.com`, de pe telefon', () => {
    expect(idYouTube(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('`youtube.com` fără `www`', () => {
    expect(idYouTube(`https://youtube.com/shorts/${ID}`)).toBe(ID);
  });

  it('forma de incorporare, dacă e copiată dintr-o pagină', () => {
    expect(idYouTube(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
  });
});

describe('ce nu e un link YouTube', () => {
  it('altă gazdă întoarce gol, chiar cu o cale care seamănă', () => {
    expect(idYouTube(`https://vimeo.com/shorts/${ID}`)).toBe('');
    expect(idYouTube(`https://youtube.evil.com/shorts/${ID}`)).toBe('');
  });

  it('un link Instagram întoarce gol', () => {
    expect(idYouTube('https://www.instagram.com/reel/ABC12345/')).toBe('');
  });

  it('text care nu e link întoarce gol', () => {
    expect(idYouTube('marți în parc')).toBe('');
  });

  it('gol rămâne gol', () => {
    expect(idYouTube('')).toBe('');
    expect(idYouTube('   ')).toBe('');
  });

  it('lungimea greșită nu trece nici lipită singură', () => {
    expect(idYouTube('dQw4w9WgXc')).toBe('');
    expect(idYouTube('dQw4w9WgXcQQ')).toBe('');
  });

  it('o cale de fișier — forma veche — nu trece', () => {
    expect(idYouTube('/reels/marti.mp4')).toBe('');
  });
});

describe('sursa de incorporare', () => {
  const src = sursaIncorporare(ID);

  it('merge pe `youtube-nocookie`, originea din CSP', () => {
    expect(src.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
  });

  it('pornește singură, mută', () => {
    expect(src).toContain('autoplay=1');
    expect(src).toContain('mute=1');
  });

  it('bucla cere `playlist` cu același identificator, altfel e ignorată', () => {
    expect(src).toContain('loop=1');
    expect(src).toContain(`playlist=${ID}`);
  });

  it('nu ascunde controalele — termenii gazdei le cer vizibile', () => {
    expect(src).not.toContain('controls=0');
  });

  it('rămâne inline pe telefon, în loc să treacă pe tot ecranul', () => {
    expect(src).toContain('playsinline=1');
  });
});

describe('linkul public', () => {
  it('duce spre pagina de Shorts a clipului', () => {
    expect(linkYouTube(ID)).toBe(`https://www.youtube.com/shorts/${ID}`);
  });
});
