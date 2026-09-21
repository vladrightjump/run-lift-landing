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

describe('curataEveniment — ce URL are voie să plece', () => {
  it.each([
    ['https://parktraining.fit/unsubscribe?token=abc123', '/unsubscribe'],
    ['https://parktraining.fit/confirmare?token=X&utm_source=email', '/confirmare?utm_source=email'],
    ['https://parktraining.fit/renunt?token=X#sectiune', '/renunt'],
    ['https://parktraining.fit/?preview=landing', '/'],
    ['https://parktraining.fit/antrenament#s2', '/antrenament'],
    ['https://parktraining.fit/', '/'],
  ])('%s → %s', (intrare, asteptat) => {
    expect(curataEveniment(intrare)).toBe(asteptat);
  });

  it('nu lasă `token` să treacă pe NICIO cale', () => {
    for (const cale of ['/confirmare', '/unsubscribe', '/renunt', '/', '/despre-noi']) {
      const rezultat = curataEveniment(`https://parktraining.fit${cale}?token=secret`);
      expect(rezultat).not.toContain('token');
      expect(rezultat).not.toContain('secret');
    }
  });

  it('păstrează toți parametrii utm și `ref`, în ordinea din URL', () => {
    expect(
      curataEveniment(
        'https://parktraining.fit/?utm_source=ig&utm_medium=story&utm_campaign=e7&ref=bio'
      )
    ).toBe('/?utm_source=ig&utm_medium=story&utm_campaign=e7&ref=bio');
  });

  it('aruncă `/admin` și tot ce e sub el', () => {
    expect(curataEveniment('https://parktraining.fit/admin')).toBeNull();
    expect(curataEveniment('https://parktraining.fit/admin/orice')).toBeNull();
    // Slash-ul final nu e o portiță.
    expect(curataEveniment('https://parktraining.fit/admin/')).toBeNull();
  });

  it('nu confundă o cale care doar începe cu literele „admin"', () => {
    expect(curataEveniment('https://parktraining.fit/administrare')).toBe('/administrare');
  });

  it('acceptă și o cale relativă', () => {
    expect(curataEveniment('/confirmare?token=X')).toBe('/confirmare');
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
  type Eveniment = { type: 'pageview'; url: string };
  const beforeSend = (): ((e: Eveniment) => Eveniment | null) => {
    pornesteAnalitice('production');
    const props = injectMock.mock.calls[0]?.[0] as {
      beforeSend: (e: Eveniment) => Eveniment | null;
    };
    return props.beforeSend;
  };
  const vizualizare = (url: string): Eveniment => ({ type: 'pageview', url });

  it('rescrie URL-ul și păstrează restul evenimentului', () => {
    expect(beforeSend()(vizualizare('https://parktraining.fit/renunt?token=X'))).toEqual({
      type: 'pageview',
      url: '/renunt',
    });
  });

  it('aruncă evenimentul pentru `/admin`', () => {
    expect(beforeSend()(vizualizare('https://parktraining.fit/admin'))).toBeNull();
  });

  it('reduce două evenimente consecutive cu același URL la unul', () => {
    const trimite = beforeSend();
    expect(trimite(vizualizare('https://parktraining.fit/antrenament#s2'))).not.toBeNull();
    // Alt fragment, aceeași pagină — al doilea cade.
    expect(trimite(vizualizare('https://parktraining.fit/antrenament#s3'))).toBeNull();
  });

  it('nu aruncă o revenire pe o pagină vizitată mai devreme', () => {
    // Deschiderea overlay-ului de înscriere face `/` → `/inscriere` → `/`.
    // Doar duplicatele CONSECUTIVE cad; altfel s-ar pierde închiderea.
    const trimite = beforeSend();
    expect(trimite(vizualizare('https://parktraining.fit/'))).not.toBeNull();
    expect(trimite(vizualizare('https://parktraining.fit/inscriere'))).not.toBeNull();
    expect(trimite(vizualizare('https://parktraining.fit/'))).not.toBeNull();
  });

  it('un `/admin` intercalat nu strică dedublarea de după', () => {
    const trimite = beforeSend();
    expect(trimite(vizualizare('https://parktraining.fit/'))).not.toBeNull();
    expect(trimite(vizualizare('https://parktraining.fit/admin'))).toBeNull();
    // `/` rămâne ultimul URL EMIS, deci repetarea lui tot cade.
    expect(trimite(vizualizare('https://parktraining.fit/'))).toBeNull();
  });
});
