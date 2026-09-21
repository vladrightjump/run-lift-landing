import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Numărătoarea de trafic — ce are voie să plece spre Vercel și unde rulează.
 *
 * Testul ăsta păzește două lucruri care nu se văd niciodată în dev, pentru că
 * ambele se întâmplă abia în producție, la altcineva pe ecran:
 *
 *  · Tokenurile din `/confirmare`, `/unsubscribe` și `/renunt` sunt capabilități
 *    de unică folosință trimise prin email. Vercel stochează URL-ul și
 *    parametrii ca atare, deci un `beforeSend` stricat nu crapă nimic — doar
 *    publică tokenurile în panoul de URL-uri al dashboard-ului.
 *
 *  · Poarta de mediu. Dacă cineva o schimbă pe `import.meta.env.PROD`, scriptul
 *    începe să fie cerut și sub `vite preview` (unde `/_vercel/insights/*` nu
 *    există), adică exact 404-ul pentru care blocurile de `<script>` au fost
 *    scoase din `index.html` în august.
 */

const injectMock = vi.hoisted(() => vi.fn());
vi.mock('@vercel/analytics', () => ({ inject: injectMock }));

const { curataEveniment, pornesteAnalitice, reseteazaAnaliticePentruTeste } = await import(
  '../../src/lib/analytics'
);

beforeEach(() => {
  injectMock.mockClear();
  reseteazaAnaliticePentruTeste();
});

const SIT = 'https://parktraining.fit';

describe('curataEveniment — ce URL are voie să plece', () => {
  it.each([
    [`${SIT}/unsubscribe?token=abc123`, `${SIT}/unsubscribe`],
    [`${SIT}/confirmare?token=X&utm_source=email`, `${SIT}/confirmare?utm_source=email`],
    [`${SIT}/renunt?token=X#sectiune`, `${SIT}/renunt`],
    [`${SIT}/?preview=landing`, `${SIT}/`],
    [`${SIT}/antrenament#s2`, `${SIT}/antrenament`],
    [`${SIT}/`, `${SIT}/`],
  ])('%s → %s', (intrare, asteptat) => {
    expect(curataEveniment(intrare)).toBe(asteptat);
  });

  it('întoarce un URL ABSOLUT — contractul documentat de Vercel pentru `event.url`', () => {
    const rezultat = curataEveniment(`${SIT}/despre-noi?token=X`);
    // `new URL(rezultat)` fără bază e exact ce face exemplul lor de redactare;
    // pe o cale relativă ar arunca.
    expect(() => new URL(rezultat as string)).not.toThrow();
    expect(rezultat).toBe(`${SIT}/despre-noi`);
  });

  it('păstrează originea din care a venit evenimentul, nu una fixă', () => {
    expect(curataEveniment('https://run-lift-landing.vercel.app/antrenament?token=X')).toBe(
      'https://run-lift-landing.vercel.app/antrenament'
    );
  });

  it('nu lasă `token` să treacă pe NICIO cale', () => {
    for (const cale of ['/confirmare', '/unsubscribe', '/renunt', '/', '/despre-noi']) {
      const rezultat = curataEveniment(`${SIT}${cale}?token=secret`);
      expect(rezultat).not.toContain('token');
      expect(rezultat).not.toContain('secret');
    }
  });

  it('păstrează toți parametrii utm și `ref`, în ordinea din URL', () => {
    expect(curataEveniment(`${SIT}/?utm_source=ig&utm_medium=story&utm_campaign=e7&ref=bio`)).toBe(
      `${SIT}/?utm_source=ig&utm_medium=story&utm_campaign=e7&ref=bio`
    );
  });

  it('aruncă `/admin` și tot ce e sub el', () => {
    expect(curataEveniment(`${SIT}/admin`)).toBeNull();
    expect(curataEveniment(`${SIT}/admin/orice`)).toBeNull();
    // Slash-ul final nu e o portiță.
    expect(curataEveniment(`${SIT}/admin/`)).toBeNull();
  });

  it('nu confundă o cale care doar începe cu literele „admin"', () => {
    expect(curataEveniment(`${SIT}/administrare`)).toBe(`${SIT}/administrare`);
  });

  it('acceptă și o cale relativă', () => {
    expect(curataEveniment('/confirmare?token=X')).toBe(`${SIT}/confirmare`);
  });

  it('aruncă un URL pe care nu-l poate parsa', () => {
    expect(curataEveniment('http://')).toBeNull();
  });
});

describe('pornesteAnalitice — poarta de mediu', () => {
  it.each(['development', 'preview', ''])('nu pornește nimic pe `%s`', (env) => {
    pornesteAnalitice(env);
    expect(injectMock).not.toHaveBeenCalled();
  });

  it('pornește pe `production`', () => {
    pornesteAnalitice('production');
    expect(injectMock).toHaveBeenCalledTimes(1);
    expect(injectMock.mock.calls[0]?.[0]).toMatchObject({ mode: 'production' });
  });

  it('e idempotentă — două apeluri, o singură pornire', () => {
    pornesteAnalitice('production');
    pornesteAnalitice('production');
    expect(injectMock).toHaveBeenCalledTimes(1);
  });
});

describe('beforeSend — cel dat efectiv lui inject()', () => {
  type Eveniment = { type: 'pageview' | 'event'; url: string };
  const beforeSend = (): ((e: Eveniment) => Eveniment | null) => {
    pornesteAnalitice('production');
    const props = injectMock.mock.calls[0]?.[0] as {
      beforeSend: (e: Eveniment) => Eveniment | null;
    };
    return props.beforeSend;
  };
  const vizualizare = (url: string): Eveniment => ({ type: 'pageview', url });
  const custom = (url: string): Eveniment => ({ type: 'event', url });

  it('rescrie URL-ul și păstrează restul evenimentului', () => {
    expect(beforeSend()(vizualizare(`${SIT}/renunt?token=X`))).toEqual({
      type: 'pageview',
      url: `${SIT}/renunt`,
    });
  });

  it('aruncă evenimentul pentru `/admin`', () => {
    expect(beforeSend()(vizualizare(`${SIT}/admin`))).toBeNull();
  });

  it('reduce două evenimente consecutive cu același URL la unul', () => {
    const trimite = beforeSend();
    expect(trimite(vizualizare(`${SIT}/antrenament#s2`))).not.toBeNull();
    // Alt fragment, aceeași pagină — al doilea cade.
    expect(trimite(vizualizare(`${SIT}/antrenament#s3`))).toBeNull();
  });

  it('nu aruncă o revenire pe o pagină vizitată mai devreme', () => {
    // Deschiderea overlay-ului de înscriere face `/` → `/inscriere` → `/`.
    // Doar duplicatele CONSECUTIVE cad; altfel s-ar pierde închiderea.
    const trimite = beforeSend();
    expect(trimite(vizualizare(`${SIT}/`))).not.toBeNull();
    expect(trimite(vizualizare(`${SIT}/inscriere`))).not.toBeNull();
    expect(trimite(vizualizare(`${SIT}/`))).not.toBeNull();
  });

  it('un `/admin` intercalat nu strică dedublarea de după', () => {
    const trimite = beforeSend();
    expect(trimite(vizualizare(`${SIT}/`))).not.toBeNull();
    expect(trimite(vizualizare(`${SIT}/admin`))).toBeNull();
    // `/` rămâne ultimul eveniment EMIS, deci repetarea lui tot cade.
    expect(trimite(vizualizare(`${SIT}/`))).toBeNull();
  });

  it('un eveniment custom NU e înghițit de vizualizarea aceleiași pagini', () => {
    // Capcana pe care o dezamorsează tipul din cheia de dedublare: fără el,
    // primul `track()` de pe o pagină tocmai numărată ar fi dispărut tăcut.
    const trimite = beforeSend();
    expect(trimite(vizualizare(`${SIT}/inscriere`))).not.toBeNull();
    expect(trimite(custom(`${SIT}/inscriere`))).not.toBeNull();
    // Dar două evenimente custom identice la rând tot se reduc la unul.
    expect(trimite(custom(`${SIT}/inscriere`))).toBeNull();
  });
});
