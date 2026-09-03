import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { AdminEventTab } from '../../src/admin/AdminEventTab';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import { formatRoDate } from '../../src/content/format';
import type { AdminEventConfigRow } from '../../src/lib/adminApi';

/**
 * Tabul „Eveniment" — editarea ciornei.
 *
 * Contractul păzit aici: nimic din ce tastează organizatorul nu ajunge pe site
 * până la „Publică", iar publicarea nu poate porni dintr-un config invalid.
 */

const { listEventConfig, saveEventConfigDraft, publishEventConfig, restoreEventConfig } =
  vi.hoisted(() => ({
    listEventConfig: vi.fn(),
    saveEventConfigDraft: vi.fn(),
    publishEventConfig: vi.fn(),
    restoreEventConfig: vi.fn(),
  }));

vi.mock('../../src/lib/adminApi', () => ({
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
}));

const rand = (over: Partial<AdminEventConfigRow> = {}): AdminEventConfigRow => ({
  id: 'row-publicat',
  editie: SNAPSHOT_CONFIG.number,
  config: SNAPSHOT_CONFIG,
  status: 'published',
  created_at: '2026-08-01T10:00:00Z',
  published_at: '2026-08-01T10:00:00Z',
  ...over,
});

/**
 * Momente exprimate în ore FAȚĂ DE STARTUL din instantaneu, în formatul cerut de
 * `datetime-local` (fără secunde). Scrise de mână, se legau de ediția care le-a
 * inspirat și cădeau de partea greșită a validării la prima aliniere a
 * instantaneului pe ediția publicată.
 */
const fataDeStart = (ore: number): string => {
  const d = new Date(`${SNAPSHOT_CONFIG.start}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(ore * 60));
  return d.toISOString().slice(0, 16);
};

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);

const randeaza = () =>
  render(<AdminEventTab token="t" onAuthError={onAuthError} showToast={showToast} />);

beforeEach(() => {
  vi.clearAllMocks();
  listEventConfig.mockResolvedValue([rand()]);
  saveEventConfigDraft.mockResolvedValue('draft-id');
  publishEventConfig.mockResolvedValue('pub-id');
  restoreEventConfig.mockResolvedValue('restored-id');
});

afterEach(cleanup);

/** Deschide ciorna pornind de la ediția publicată. */
const deschideCiorna = async () => {
  randeaza();
  const buton = await screen.findByRole('button', {
    name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
  });
  fireEvent.click(buton);
  // Grupurile pornesc pliate. Testele de mai jos sînt despre reguli (validare,
  // salvare, publicare), nu despre plierea în sine, deci le deschidem pe toate
  // — exact ce face și organizatorul când vrea să vadă tot documentul.
  // Plierea are propriul bloc de teste, mai jos.
  deschideGrupurile();
};

/** Deschide fiecare grup încă pliat. */
const deschideGrupurile = () => {
  for (const cap of document.querySelectorAll('.admin-config-grup-cap')) {
    if (cap.getAttribute('aria-expanded') === 'false') fireEvent.click(cap);
  }
};

const camp = (eticheta: string | RegExp): HTMLInputElement =>
  screen.getByLabelText(eticheta) as HTMLInputElement;

/**
 * Textul erorii afișate SUB un câmp, ajuns la prin `aria-describedby`.
 *
 * Trecem prin legătura de accesibilitate, nu prin clasa CSS: dacă mesajul e
 * pus lângă câmp dar nu e legat de el, un cititor de ecran n-o să-l anunțe
 * niciodată — iar testul trebuie să prindă exact asta.
 */
const eroareaCampului = (eticheta: string | RegExp): string => {
  const descris = camp(eticheta).getAttribute('aria-describedby') ?? '';
  return descris
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
};

describe('starea inițială', () => {
  it('arată ediția publicată fără să deschidă o ciornă', async () => {
    randeaza();
    expect(await screen.findByText(`Ediția ${SNAPSHOT_CONFIG.number}`)).toBeTruthy();
    expect(screen.getByText(/Nicio ciornă deschisă/)).toBeTruthy();
  });

  it('spune ce vede vizitatorul acum', async () => {
    randeaza();
    expect(await screen.findByText('Landing')).toBeTruthy();
  });

  it('nu salvează și nu publică nimic doar prin deschiderea tabului', async () => {
    randeaza();
    await screen.findByText(/Nicio ciornă deschisă/);
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });
});

describe('ciorna pentru ediția următoare', () => {
  it('o ciornă cu ALT număr decât ediția publicată e găsită și încărcată', async () => {
    // Regresie: `admin_get_event_config` filtra pe ediția curentă, deci ciorna
    // ediției următoare — care are prin construcție alt număr — era invizibilă.
    // Ciorna salvată „dispărea" la reîncărcare și preview-ul cădea pe publicat.
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-6',
        editie: SNAPSHOT_CONFIG.number + 1,
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, number: SNAPSHOT_CONFIG.number + 1 },
      }),
      rand(),
    ]);
    randeaza();
    // Formularul se deschide singur pe ciorna existentă, fără să apeși nimic.
    await waitFor(() =>
      expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1))
    );
  });

  it('pornește de la cea publicată, cu ediția incrementată', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Ciornă pentru ediția ${SNAPSHOT_CONFIG.number + 1}`),
      })
    );
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1));
    // Locul se păstrează ca punct de plecare, nu se golește.
    expect(camp('Numele locului').value).toBe(SNAPSHOT_CONFIG.venue.name);
  });
});

describe('editarea nu atinge site-ul', () => {
  it('tastarea nu trimite nimic la server', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('„Salvează ciorna" trimite documentul editat', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, editie, doc] = saveEventConfigDraft.mock.calls[0];
    expect(editie).toBe(SNAPSHOT_CONFIG.number);
    expect(doc.eventName).toBe('Winter Trial');
    // Publicarea rămâne un act separat.
    expect(publishEventConfig).not.toHaveBeenCalled();
  });
});

describe('validarea blochează publicarea', () => {
  it('un deadline după start dezactivează „Publică" și spune de ce', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(2) } });

    // Mesajul apare în DOUĂ locuri, deliberat: bannerul de sus (îl vezi și când
    // câmpul vinovat e sub fold) și sub câmpul însuși (nu trebuie să ghicești
    // care dintre cele optsprezece e cel reclamat).
    const banner = document.querySelector('.admin-banner.warn') as HTMLElement;
    expect(within(banner).getByText(/nu poate fi după startul cursei/i)).toBeTruthy();
    expect(eroareaCampului('Se închid înscrierile')).toMatch(/nu poate fi după startul cursei/i);

    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvează' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('coordonate scrise ca text sunt respinse', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });
    // Doar în bannerul de erori — „lat,lng" apare și în eticheta câmpului.
    const banner = document.querySelector('.admin-banner.warn') as HTMLElement;
    expect(within(banner).getByText(/lat,lng/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);
  });

  it('corectarea reactivează publicarea', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(2) } });
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(0) } });
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('avertismentele nu blochează', () => {
  it('ediția de lansare înaintea celei a evenimentului avertizează, dar lasă publicarea', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Ediția de lansare'), {
      target: { value: String(SNAPSHOT_CONFIG.number + 1) },
    });
    // Doar în bannerul de avertisment: „/confirmare" apare și în explicația de
    // sub câmp, care e text permanent, nu reacție la ce tocmai s-a tastat.
    const banner = document.querySelector('.admin-banner:not(.warn)') as HTMLElement;
    expect(within(banner).getByText(/confirmare/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('publicarea cere confirmare și spune ce urmează', () => {
  it('confirmarea numește ce va vedea vizitatorul', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/landing-ul cu înscrieri/)).toBeTruthy();
    // Share preview-ul rămâne pe build — spus explicit, nu ascuns.
    expect(within(dialog).getByText(/share preview/i)).toBeTruthy();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('Coming Soon e numit ca atare în confirmare', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText('Homepage-ul arată'), { target: { value: 'soon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    expect(within(screen.getByRole('alertdialog')).getByText('Coming Soon')).toBeTruthy();
  });

  it('anularea nu publică nimic', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('confirmarea publică ediția ciornei', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledWith('t', SNAPSHOT_CONFIG.number));
  });
});

describe('refuzurile serverului ajung la organizator', () => {
  it('ascunderea înscrierii cât timp e deschisă e explicată, nu doar „a eșuat"', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('Supabase 400: registration_hidden_while_open: inscrierile sunt deschise pana la ...')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        kind: 'error',
        msg: expect.stringMatching(/nu poți ascunde secțiunea de înscriere/i),
      })
    );
  });

  it('un config respins de server e raportat cu motivul lui', async () => {
    saveEventConfigDraft.mockRejectedValue(
      new Error('Supabase 400: config_invalid: capacitatea trebuie sa fie pozitiva')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        kind: 'error',
        msg: expect.stringMatching(/capacitatea trebuie sa fie pozitiva/),
      })
    );
  });
});

describe('aranjarea secțiunilor', () => {
  it('mută o secțiune și renumerotează', async () => {
    await deschideCiorna();
    const randuri = screen.getAllByRole('listitem');
    expect(randuri[0].textContent).toContain('Formatul');

    fireEvent.click(screen.getByRole('button', { name: /Mută „Locația” mai sus/ }));
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Locația');
  });

  it('ascunderea scoate numărul și marchează rândul', async () => {
    await deschideCiorna();
    const randVenue = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('Locația'))!;
    fireEvent.click(within(randVenue).getByRole('button', { name: 'Ascunde' }));

    const dupa = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('Locația'))!;
    expect(dupa.className).toContain('ascunsa');
    expect(within(dupa).getByRole('button', { name: 'Arată' })).toBeTruthy();
  });
});

describe('versiuni anterioare', () => {
  it('o versiune înlocuită poate fi readusă', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'veche', status: 'superseded', published_at: '2026-07-01T09:00:00Z' }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Revino la asta' }));
    await waitFor(() => expect(restoreEventConfig).toHaveBeenCalledWith('t', 'veche'));
  });

  it('fără versiuni înlocuite, secțiunea nu apare', async () => {
    randeaza();
    await screen.findByText(/Nicio ciornă deschisă/);
    expect(screen.queryByText('Versiuni anterioare')).toBeNull();
  });
});

describe('clipurile din bandă', () => {
  const adauga = async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: '+ Adaugă clip' }));
  };

  it('lipirea unui link umple codul și îl arată în ecou', async () => {
    await adauga();
    fireEvent.change(camp('Linkul clipului'), {
      target: { value: 'https://www.instagram.com/reel/ABC12345/?igsh=xyz' },
    });
    expect(screen.getByText(/cod: ABC12345/)).toBeTruthy();
  });

  it('TASTAREA nu se autodistruge', async () => {
    // Regresia păzită: câmpul era controlat de URL-ul RECOMPUS din codul
    // parsat, iar la tastare fiecare caracter în parte e un URL invalid — deci
    // câmpul se golea singur la prima literă și nu se putea scrie nimic în el.
    await adauga();
    const input = camp('Linkul clipului');

    let text = '';
    for (const ch of 'https://www.instagram.com/reel/ABC12345/') {
      text += ch;
      fireEvent.change(input, { target: { value: text } });
      expect(camp('Linkul clipului').value).toBe(text);
    }
    expect(screen.getByText(/cod: ABC12345/)).toBeTruthy();
  });

  it('la ieșirea din câmp rămâne forma canonică, fără query-ul de tracking', async () => {
    await adauga();
    const input = camp('Linkul clipului');
    fireEvent.change(input, {
      target: { value: 'https://www.instagram.com/reels/ABC12345/?igsh=xyz' },
    });
    fireEvent.blur(input);
    // `/reels/` s-a normalizat la `/reel/`, iar query-ul a dispărut.
    expect(camp('Linkul clipului').value).toBe('https://www.instagram.com/reel/ABC12345/');
  });

  it('un link fără cod lasă rândul semnalat, nu publicabil', async () => {
    await adauga();
    fireEvent.change(camp('Linkul clipului'), {
      target: { value: 'https://tiktok.com/@x/video/1' },
    });
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});

describe('grupurile pliate comprimă documentul, nu îl ascund', () => {
  /** Capacele grupurilor, cu textul lor (titlu + rezumat când e pliat). */
  const capace = (): string[] =>
    [...document.querySelectorAll('.admin-config-grup-cap')].map((c) => c.textContent ?? '');

  const deschis = (titlu: string): boolean =>
    [...document.querySelectorAll('.admin-config-grup-cap')]
      .find((c) => c.textContent?.includes(titlu))
      ?.getAttribute('aria-expanded') === 'true';

  it('la deschiderea ciornei, câmpurile nu sînt toate pe ecran', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    // Douăzeci de câmpuri deschise simultan erau două ecrane și jumătate.
    expect(screen.queryByLabelText('Numele locului')).toBeNull();
    expect(deschis('Unde')).toBe(false);
  });

  it('rezumatul ține locul câmpurilor — plierea comprimă, nu ascunde', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    const text = capace().join(' | ');
    // Locul, capacitatea și data se citesc fără să deschizi nimic.
    expect(text).toContain(SNAPSHOT_CONFIG.venue.name);
    expect(text).toContain(String(SNAPSHOT_CONFIG.slots.total));
    // Data startului, scrisă în română — derivată din instantaneu, ca luna să
    // nu fie o constantă care expiră la ediția următoare.
    expect(text).toContain(formatRoDate(SNAPSHOT_CONFIG.start));
  });

  it('un grup se deschide la click și se închide la al doilea', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    const cap = [...document.querySelectorAll('.admin-config-grup-cap')].find((c) =>
      c.textContent?.includes('Unde')
    )!;
    fireEvent.click(cap);
    expect(camp('Numele locului')).toBeTruthy();
    fireEvent.click(cap);
    expect(screen.queryByLabelText('Numele locului')).toBeNull();
  });

  it('un grup cu eroare se deschide singur și NU se mai poate închide', async () => {
    // Altfel „Publică" ar rămâne blocat de o eroare ascunsă sub un capac, iar
    // bannerul de sus ar spune CE e greșit fără să arate UNDE.
    await deschideCiorna();
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });

    const cap = [...document.querySelectorAll('.admin-config-grup-cap')].find((c) =>
      c.textContent?.includes('Unde')
    )!;
    fireEvent.click(cap); // încercăm să-l închidem
    expect(deschis('Unde')).toBe(true);
    expect(camp('Coordonatele')).toBeTruthy();
  });
});

describe('câmpurile predispuse la greșeli sînt liste, nu text liber', () => {
  const control = (eticheta: string) => screen.getByLabelText(eticheta) as HTMLSelectElement;

  it('durata, ora de check-in și fusul sînt `select`', async () => {
    await deschideCiorna();
    for (const eticheta of ['Durata', 'Check-in de la', 'Fusul orar']) {
      expect(control(eticheta).tagName).toBe('SELECT');
    }
  });

  it('fusul oferă doar valorile Moldovei, în forma pe care o cere serverul', async () => {
    await deschideCiorna();
    // „+3:00” în loc de „+03:00” trecea de input și cădea abia la „Publică”.
    const valori = [...control('Fusul orar').options].map((o) => o.value);
    expect(valori).toContain('+03:00');
    expect(valori).toContain('+02:00');
    expect(valori.every((v) => /^[+-]\d{2}:\d{2}$/.test(v))).toBe(true);
  });

  it('o valoare din afara listei nu se pierde', async () => {
    // Un document scris manual în DB nu trebuie să pară că are altă valoare.
    listEventConfig.mockResolvedValue([
      rand({ config: { ...SNAPSHOT_CONFIG, checkinFrom: '04:07' } }),
    ]);
    await deschideCiorna();
    expect(control('Check-in de la').value).toBe('04:07');
  });
});
