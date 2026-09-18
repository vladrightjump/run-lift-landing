import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
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

const {
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
  listEmailLog,
} = vi.hoisted(() => ({
  listEventConfig: vi.fn(),
  saveEventConfigDraft: vi.fn(),
  publishEventConfig: vi.fn(),
  restoreEventConfig: vi.fn(),
  listEmailLog: vi.fn(),
}));

vi.mock('../../src/lib/adminApi', () => ({
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
  listEmailLog,
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
/** Spionul se pune la fiecare test: `restoreMocks` îl desface după fiecare. */
let confirma: MockInstance<typeof window.confirm>;
/**
 * Garda „pot pleca din tab?", predată dashboardului. Aici o capturăm ca s-o
 * putem interoga: ea e ce apără ciorna nesalvată la schimbarea tabului.
 */
const gardaIesire = { curenta: null as (() => boolean) | null };
const inregistreazaGardaIesire = (g: (() => boolean) | null) => {
  gardaIesire.curenta = g;
};

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={onAuthError} showToast={showToast}>
      <AdminEventTab inregistreazaGardaIesire={inregistreazaGardaIesire} />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => {
  vi.clearAllMocks();
  gardaIesire.curenta = null;
  // Ciorna nesalvată întreabă înainte să dispară. Implicit răspundem „da", ca
  // testele care nu sînt despre gardă să treacă prin ea neschimbate; cele care
  // SÎNT despre ea își pun propriul răspuns.
  confirma = vi.spyOn(window, 'confirm').mockReturnValue(true);
  listEventConfig.mockResolvedValue([rand()]);
  saveEventConfigDraft.mockResolvedValue('draft-id');
  publishEventConfig.mockResolvedValue('pub-id');
  restoreEventConfig.mockResolvedValue('restored-id');
  // Jurnal gol = „am citit și n-a plecat nimic", starea reală a proiectului:
  // niciun rând `broadcast` n-a existat vreodată în `email_log`.
  listEmailLog.mockResolvedValue([]);
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

/** Deschide dialogul de ediție nouă, de pe ecranul fără ciornă. */
const deschideDialogEditieNoua = async () => {
  randeaza();
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(`Ciornă pentru ediția ${SNAPSHOT_CONFIG.number + 1}`),
    })
  );
};

/** Parcurge dialogul până la ciorna deschisă în formular. */
const creeazaPrinDialog = async (data = '2026-10-03', ora = '07:00', locuri?: string) => {
  await deschideDialogEditieNoua();
  fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: data } });
  fireEvent.change(screen.getByLabelText('Ora startului'), { target: { value: ora } });
  if (locuri !== undefined) {
    fireEvent.change(screen.getByLabelText('Locuri'), { target: { value: locuri } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Creează ciorna' }));
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
    await creeazaPrinDialog();
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1));
    // Locul se păstrează ca punct de plecare, nu se golește.
    expect(camp('Numele locului').value).toBe(SNAPSHOT_CONFIG.venue.name);
  });
});

/**
 * Dialogul de ediție nouă — calea principală, nu o scurtătură.
 *
 * Contractul e negativ și e singurul motiv pentru care dialogul există: după
 * el, `launchAt` NU mai poate rămâne un moment consumat. Până acum ciorna
 * copia momentele ediției publicate, iar `mutaReperele` se aplica doar dacă
 * organizatorul edita startul ÎN formular și accepta oferta.
 */
describe('dialogul de ediție nouă', () => {
  it('crearea nu mai deschide direct formularul, ci întreabă întâi', async () => {
    await deschideDialogEditieNoua();
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Formularul complet NU e deschis: „Numărul ediției" e câmp de-al lui.
    expect(screen.queryByLabelText('Numărul ediției')).toBeNull();
  });

  it('recalculează check-inul față de noul start, nu îl copiază', async () => {
    // Publicat: start 07:00, check-in 06:45. Mutat la 09:00 → 08:45.
    await creeazaPrinDialog('2026-10-03', '09:00');
    deschideGrupurile();
    expect(camp('Check-in de la').value).toBe('08:45');
  });

  it('anunțul ediției nu mai rămâne în urmă', async () => {
    await creeazaPrinDialog('2026-10-03', '09:00');
    deschideGrupurile();
    // Copiat, ar fi rămas pe 2026-09-03T12:00 — un moment deja consumat.
    expect(camp('Se anunță ediția').value).not.toBe(SNAPSHOT_CONFIG.launchAt.slice(0, 16));
    expect(camp('Se anunță ediția').value.startsWith('2026-10-01')).toBe(true);
  });

  it('numărul de locuri ales ajunge în ciornă', async () => {
    await creeazaPrinDialog('2026-10-03', '09:00', '42');
    deschideGrupurile();
    expect(camp('Locuri disponibile').value).toBe('42');
  });

  it('rezumatul enumeră locația și capacitatea moștenite', async () => {
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Locația')).toBeTruthy();
    expect(dialog.getByText(new RegExp(SNAPSHOT_CONFIG.venue.name))).toBeTruthy();
    expect(dialog.getByText('Capacitate')).toBeTruthy();
  });

  it('rezumatul arată momentele recalculate cu valoarea NOUĂ', async () => {
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByLabelText('Ora startului'), { target: { value: '09:00' } });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Check-in de la')).toBeTruthy();
    expect(dialog.getByText('08:45')).toBeTruthy();
  });

  it('nu se poate crea nimic până nu e aleasă data', async () => {
    await deschideDialogEditieNoua();
    const creeaza = screen.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement;
    expect(creeaza.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    expect((screen.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('un start malformat nu poate ajunge în ciornă', async () => {
    // `type="date"` refuză valoarea înainte de validare — o dată malformată nu
    // devine niciodată stare. Mesajul validării există și e testat unitar
    // (`eventConfigForm.test.ts`), pe drumul pe care e încă atins; aici se
    // păzește consecința: dialogul rămâne închis peste o valoare respinsă.
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10' } });
    expect((screen.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('o problemă a ediției publicate oprește ciorna care ar moșteni-o', async () => {
    // Ciorna pornește din documentul publicat, deci îi ia și defectele. Butonul
    // mort fără explicație ar trimite organizatorul să caute greșeala în cele
    // trei câmpuri pe care tocmai le-a completat corect.
    listEventConfig.mockResolvedValue([rand({ config: { ...SNAPSHOT_CONFIG, eventName: '  ' } })]);
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/Numele evenimentului nu poate fi gol/)).toBeTruthy();
    expect((dialog.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('anularea nu deschide nicio ciornă și nu scrie nimic', async () => {
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Nicio ciornă deschisă/)).toBeTruthy();
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('formularul complet rămâne accesibil, ca „editează tot"', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number));
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
    // `strong`: de când confirmarea listează și diferențele, „Coming Soon"
    // apare de două ori — o dată ca urmare („vizitatorii vor vedea…"), o dată
    // ca valoare nouă a câmpului. Aici ne interesează prima.
    expect(
      within(screen.getByRole('alertdialog')).getByText('Coming Soon', { selector: 'strong' })
    ).toBeTruthy();
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
  /**
   * Rândurile listei de SECȚIUNI, nu toate elementele de listă din tab.
   *
   * `getAllByRole('listitem')` prindea și clipurile, și cronologia „Când" —
   * adică ordinea secțiunilor se verifica pe primul `<li>" randat oriunde în
   * formular. Trecea din coincidență, până când altceva a fost randat mai sus.
   */
  const randuriSectiuni = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('.admin-layout-list li'),
  ];

  it('mută o secțiune și renumerotează', async () => {
    await deschideCiorna();
    expect(randuriSectiuni()[0].textContent).toContain('Formatul');

    fireEvent.click(screen.getByRole('button', { name: /Mută „Locația” mai sus/ }));
    expect(randuriSectiuni()[0].textContent).toContain('Locația');
  });

  it('ascunderea scoate numărul și marchează rândul', async () => {
    await deschideCiorna();
    const randVenue = randuriSectiuni().find((li) => li.textContent?.includes('Locația'))!;
    fireEvent.click(within(randVenue).getByRole('button', { name: 'Ascunde' }));

    const dupa = randuriSectiuni().find((li) => li.textContent?.includes('Locația'))!;
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

  // Timeout explicit: testul tastează patruzeci de caractere și re-randează tot
  // tabul după fiecare, deci durează ~1,4 s pe o mașină de dezvoltare și trece
  // de pragul implicit de 5 s pe un runner de CI încărcat. Nu e blocaj, e
  // lungime reală — a picat în CI abia după ce suita a crescut la 725 de teste.
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
  }, 20_000);

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

/**
 * Issue #12: „Publică" eșua tăcut când ciorna n-a fost salvată.
 *
 * `admin_publish_event_config` primește doar `p_editie` și publică rândul
 * `draft` de pe server — niciodată documentul din câmpuri. Fără „Salvează"
 * înainte, n-avea ce publica (`no_draft`); CU o ciornă veche pe server,
 * publica documentul VECHI și raporta succes. Ambele se închid aici: apăsarea
 * pe „Publică" salvează întâi ce e pe ecran.
 */
describe('„Publică" trimite ce e pe ecran', () => {
  /** Deschide ciorna, schimbă un câmp, confirmă publicarea. */
  const publicaDupaOEditare = async (valoare = 'Winter Trial') => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: valoare } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));
  };

  it('salvează documentul editat ÎNAINTE de a publica', async () => {
    await publicaDupaOEditare();

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(saveEventConfigDraft).toHaveBeenCalledTimes(1);
    // Ordinea e tot fixul: publicarea citește rândul pe care tocmai l-am scris.
    expect(saveEventConfigDraft.mock.invocationCallOrder[0]).toBeLessThan(
      publishEventConfig.mock.invocationCallOrder[0]
    );
  });

  it('documentul salvat poartă editarea, nu ciorna veche de pe server', async () => {
    // Garda împotriva succesului FALS: cu o ciornă pe server, varianta veche
    // publica documentul ei și zicea „Ediția N e publicată".
    await publicaDupaOEditare();

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, editie, doc] = saveEventConfigDraft.mock.calls[0];
    expect(editie).toBe(SNAPSHOT_CONFIG.number);
    expect(doc.eventName).toBe('Winter Trial');
  });

  it('dacă salvarea e refuzată, nu se publică nimic', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('network'));
    await publicaDupaOEditare();

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('o salvare refuzată nu anunță succesul', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('network'));
    await publicaDupaOEditare();

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(showToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'success' })
    );
  });

  it('confirmarea spune că salvează, nu doar că publică', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    // Organizatorul trebuie să afle CE face „Da, publică" înainte să apese.
    // Nota de jos zice deja „rămâne salvată" despre versiunea veche — deci
    // căutăm exact promisiunea despre ciorna de pe ecran.
    expect(
      within(screen.getByRole('alertdialog')).getByText(/salvează ciorna așa cum arată acum/i)
    ).toBeTruthy();
  });
});

describe('formularul e blocat cât ține publicarea', () => {
  /** O promisiune pe care o rezolvăm noi, ca să inspectăm starea din zbor. */
  const publicarePeLoc = () => {
    let elibereaza!: (v: string) => void;
    publishEventConfig.mockReturnValue(
      new Promise<string>((res) => {
        elibereaza = res;
      })
    );
    return () => elibereaza('pub-id');
  };

  it('„Salvează" e dezactivat cât timp publicarea e în zbor', async () => {
    const elibereaza = publicarePeLoc();
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Se publică…' })).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: 'Salvează' }).hasAttribute('disabled')).toBe(
      true
    );
    elibereaza();
  });

  it('o editare din zbor nu poate ajunge la server pe furiș', async () => {
    // Apelurile await țin `ciorna` pe care au capturat-o. Dacă textul s-ar
    // putea schimba între timp, s-ar publica instantaneul vechi ȘI s-ar
    // raporta succes — exact eșecul pe care U1 îl închide.
    const elibereaza = publicarePeLoc();
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(camp('Numele evenimentului').hasAttribute('disabled')).toBe(true);
    elibereaza();
  });
});

/**
 * Issue #12, partea a doua: refuzul nu trebuie să treacă tăcut prin UI.
 *
 * Toastul EXISTĂ deja și a pornit — `mesajRefuz` traduce `no_draft` de la
 * început. E o notificare de 3,2 secunde, peste bara pe care tocmai ai apăsat,
 * fix cînd se închide dialogul. A pornit și n-a fost văzută. Deci mesajul
 * rămîne și în bară, pînă la următoarea încercare.
 *
 * Pasul (salvare vs publicare) NU poate veni din `mesajRefuz`: acela ramifică
 * pe codul de eroare al serverului, iar ramura lui de rezervă zice „Nu am putut
 * salva" pentru ORICE nu recunoaște — inclusiv pentru o publicare refuzată.
 */
describe('refuzul rămâne citibil după ce trece toastul', () => {
  const bara = () => document.querySelector('.admin-bara-actiuni') as HTMLElement;
  const refuz = () => bara().querySelector('.admin-bara-problema')?.textContent ?? '';

  const publica = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));
  };

  it('o publicare refuzată își lasă motivul în bară', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('registration_hidden_while_open: înscrierile sunt deschise')
    );
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toMatch(/înscrierile sunt deschise/i));
  });

  it('un refuz la publicare nu se dă drept eșec de salvare', async () => {
    // Garda pentru KTD5. Fără marcajul pasului, ramura de rezervă din
    // `mesajRefuz` ar zice „Nu am putut salva" pentru o publicare picată.
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).toMatch(/public/i);
    expect(refuz()).not.toMatch(/nu am putut salva/i);
  });

  it('o salvare refuzată din fluxul de publicare se citește ca salvare', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).toMatch(/salv/i);
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('o publicare reușită nu lasă niciun refuz în bară', async () => {
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(refuz()).toBe('');
  });

  it('o încercare nouă curăță refuzul dinainte', async () => {
    publishEventConfig.mockRejectedValueOnce(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();
    await waitFor(() => expect(refuz()).toBeTruthy());

    publishEventConfig.mockResolvedValue('pub-id');
    await publica();
    await waitFor(() => expect(refuz()).toBe(''));
  });

  it('refuzul nu supraviețuiește renunțării la ciornă', async () => {
    // „Renunță" doar anulează `ciorna`; bara se demontează, dar starea
    // componentei rămîne. Fără curățare, ciorna următoare s-ar deschide cu
    // reproșul celei aruncate.
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();
    await waitFor(() => expect(refuz()).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`) })
    );
    expect(refuz()).toBe('');
  });

  it('o problemă de validare ia slotul înaintea unui refuz vechi', async () => {
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();
    await waitFor(() => expect(refuz()).toBeTruthy());

    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(2) } });
    expect(refuz()).toMatch(/de reparat/);
  });

  it('refuzul e anunțat din bară, nu de lângă ea', async () => {
    // Bara e deja `role="status"`. Mesajul trebuie să fie ÎNĂUNTRU: altfel un
    // cititor de ecran nu-l anunță niciodată. Căutarea e restrânsă la bară —
    // tabul are mai multe elemente cu același rol.
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(bara().getAttribute('role')).toBe('status');
  });
});

/**
 * Găurile găsite la review-ul de cod, după ce U1 și U2 erau deja verzi.
 *
 * Lacătul era legat doar de `publica`, deși „Salvează" are exact același
 * dus-întors și, la succes, resetează `atinsa` și cheamă `incarca()` — deci
 * ce se tasta între timp dispărea. Iar cele două butoane care ating serverul
 * din afara barei („Renunță" și „Revino la asta") rămâneau vii sub ea.
 */
describe('lacătul acoperă ambele scrieri, nu doar publicarea', () => {
  /** O promisiune ținută pe loc, ca să inspectăm starea din zbor. */
  const tinePeLoc = (mock: typeof saveEventConfigDraft) => {
    let elibereaza!: (v: string) => void;
    mock.mockReturnValue(
      new Promise<string>((res) => {
        elibereaza = res;
      })
    );
    return () => elibereaza('id');
  };

  it('câmpurile sînt inerte și cât ține o salvare', async () => {
    const elibereaza = tinePeLoc(saveEventConfigDraft);
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(camp('Numele evenimentului').hasAttribute('disabled')).toBe(true);
    elibereaza();
  });

  it('controalele de reels și de layout sînt inerte în zbor', async () => {
    // Ele nu trec prin `Camp`, deci nu le atinge contextul — au nevoie de
    // propria gardă, iar un control nou adăugat aici e ușor de uitat.
    const elibereaza = tinePeLoc(publishEventConfig);
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: '+ Adaugă clip' }));
    // Un clip fără cod e invalid, iar „Publică" ar rămâne dezactivat.
    fireEvent.change(camp('Linkul clipului'), {
      target: { value: 'https://www.instagram.com/reel/ABC12345/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(camp('Linkul clipului').hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('button', { name: /Mută „Locația” mai sus/ }).hasAttribute('disabled')
    ).toBe(true);
    elibereaza();
  });

  it('„Renunță" nu poate arunca ciorna de sub o publicare în zbor', async () => {
    const elibereaza = tinePeLoc(publishEventConfig);
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Renunță' }).hasAttribute('disabled')).toBe(true);
    elibereaza();
  });
});

describe('refuzurile celorlalte scrieri ajung tot în bară', () => {
  const bara = () => document.querySelector('.admin-bara-actiuni') as HTMLElement;
  const refuz = () => bara().querySelector('.admin-bara-problema')?.textContent ?? '';

  it('un „Salvează" refuzat lasă motivul în bară, nu doar în toast', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).toMatch(/salv/i);
  });

  it('un „Revino la asta" refuzat spune că revenirea a picat, nu salvarea', async () => {
    // `mesajRefuz` avea o singură propoziție de rezervă, despre salvare, iar
    // republicarea o moștenea: „Nu am putut salva" pe butonul care repune
    // versiunea veche pe site.
    restoreEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'veche', status: 'superseded', published_at: '2026-07-01T09:00:00Z' }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Revino la asta' }));

    // Fără ciornă deschisă bara nu există — refuzul are propriul banner.
    const banner = await waitFor(() => {
      const b = document.querySelector('.admin-banner.warn');
      if (!b) throw new Error('niciun banner');
      return b as HTMLElement;
    });
    expect(banner.textContent).toMatch(/revenirea/i);
    expect(banner.textContent).not.toMatch(/salvarea/i);
  });

  it('o cădere de rețea nu se dă drept refuz al serverului', async () => {
    // Un `admin_save_event_config_draft` care a apucat să scrie și și-a pierdut
    // răspunsul arată identic cu unul care n-a plecat. „A fost refuzată" ar fi
    // o afirmație pe care n-o putem susține.
    saveEventConfigDraft.mockRejectedValue(new Error('Failed to fetch'));
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).not.toMatch(/a fost refuzată/i);
    expect(refuz()).toMatch(/nu știm dacă a ajuns/i);
  });

  it('un refuz cu motiv de la server spune răspicat că a fost refuzat', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('registration_hidden_while_open: înscrierile sunt deschise')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(refuz()).toMatch(/a fost refuzată/i));
  });
});

describe('publicarea trimite ce e pe ecran chiar și peste o ciornă veche de pe server', () => {
  it('documentul publicat e cel editat, nu ciorna care era deja salvată', async () => {
    // Cazul real din #12, în forma lui cea mai rea: EXISTĂ o ciornă pe server,
    // deci vechea variantă nu cădea cu `no_draft` — publica documentul ei și
    // raporta succes. Fără rândul ăsta în fixtură, testul n-ar putea pica.
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-veche',
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, eventName: 'Ciorna Veche' },
      }),
      rand(),
    ]);
    randeaza();
    // Tabul deschide singur ciorna de pe server.
    await waitFor(() => expect(camp('Numărul ediției')).toBeTruthy());
    deschideGrupurile();
    expect(camp('Numele evenimentului').value).toBe('Ciorna Veche');

    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, , doc] = saveEventConfigDraft.mock.calls[0];
    expect(doc.eventName).toBe('Winter Trial');
    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
  });
});

/**
 * Grupul „Remindere" e singurul, alături de „Instagram", ale cărui erori NU se
 * numesc după câmp: validarea le scrie pe chei indexate
 * (`reminders.0.offsetHours`), nu pe cheia plată `reminders`.
 *
 * De asta contează: un grup cu eroare trebuie să se deschidă singur și să nu se
 * mai poată închide. Dacă marcajul se uită doar după cheia plată, un rând de
 * reminder greșit lasă grupul pliat, iar organizatorul primește un refuz la
 * „Publică" fără să afle ce câmp îl produce — exact ce spune comentariul lui
 * `Grup` că nu are voie să se întâmple.
 *
 * Erorile se produc TASTÂND, nu semănând un config invalid: `parseEventConfig`
 * curăță rândurile invalide la parsare, deci un config stricat din start n-ar
 * ajunge niciodată la validare.
 */
describe('erorile indexate deschid grupul care le conține', () => {
  const grupul = (titlu: string) =>
    [...document.querySelectorAll('.admin-config-grup')].find((g) =>
      g.querySelector('.admin-config-grup-cap')?.textContent?.includes(titlu)
    );

  const capul = (titlu: string) =>
    grupul(titlu)?.querySelector('.admin-config-grup-cap') as HTMLElement;

  it('un avans invalid pe un rând marchează grupul și îl ține deschis', async () => {
    await deschideCiorna();

    // Zero e sub minimul de 1 -> cheia `reminders.0.offsetHours`, indexată.
    fireEvent.change(camp('Cu câte ore înainte de start'), { target: { value: '0' } });

    expect(grupul('Remindere')?.className).toContain('invalid');
    fireEvent.click(capul('Remindere')); // încercăm să-l închidem
    expect(capul('Remindere').getAttribute('aria-expanded')).toBe('true');
  });

  it('un avans peste maxim marchează la fel', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Cu câte ore înainte de start'), { target: { value: '721' } });
    expect(grupul('Remindere')?.className).toContain('invalid');
  });

  it('un avans valid nu marchează nimic', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Cu câte ore înainte de start'), { target: { value: '12' } });
    expect(grupul('Remindere')?.className).not.toContain('invalid');
  });
});

/**
 * Ciorna nesalvată.
 *
 * Tabul se demontează la schimbarea tabului (`{tab === 'eveniment' && …}` în
 * `AdminDashboard`), iar „Renunță" golea ciorna pe loc: douăzeci de câmpuri se
 * puteau pierde dintr-un click greșit, fără o vorbă. Contractul păzit aici e că
 * nicio plecare nu e tăcută cât timp există ce pierde.
 */
describe('ciorna nesalvată nu dispare tăcut', () => {
  /** Textul barei lipite de jos. */
  const bara = (): string =>
    document.querySelector('.admin-bara-stare')?.textContent ?? '';

  it('o ciornă pornită din publicat e nesalvată din prima clipă', async () => {
    await deschideCiorna();
    expect(bara()).toContain('Nesalvat');
  });

  it('o ciornă încărcată de pe server nu e nesalvată', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    expect(bara()).not.toContain('Nesalvat');
  });

  it('tastarea aprinde „Nesalvat", iar revenirea la valoarea inițială îl stinge', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    const nume = camp('Numele evenimentului');
    const initial = nume.value;
    fireEvent.change(nume, { target: { value: 'Altceva' } });
    expect(bara()).toContain('Nesalvat');

    fireEvent.change(nume, { target: { value: initial } });
    expect(bara()).not.toContain('Nesalvat');
  });

  it('salvarea stinge „Nesalvat" fără să aștepte reîncărcarea', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalled());
    await waitFor(() => expect(bara()).not.toContain('Nesalvat'));
  });

  it('„Renunță" cu diferențe întreabă, iar refuzul păstrează ciorna intactă', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Altceva' } });

    confirma.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));

    expect(confirma).toHaveBeenCalled();
    // Ciorna e tot acolo, cu editarea în ea.
    expect(screen.getByRole('button', { name: 'Renunță' })).toBeTruthy();
    expect(camp('Numele evenimentului').value).toBe('Altceva');
  });

  it('„Renunță" confirmat închide ciorna', async () => {
    await deschideCiorna();
    confirma.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByRole('button', { name: 'Renunță' })).toBeNull();
  });

  it('„Renunță" pe o ciornă salvată nu mai întreabă nimic', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Renunță' }));
    expect(confirma).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Renunță' })).toBeNull();
  });

  it('garda de ieșire din tab refuză plecarea când răspunsul e „nu"', async () => {
    await deschideCiorna();
    expect(gardaIesire.curenta).toBeTruthy();

    confirma.mockReturnValue(false);
    expect(gardaIesire.curenta?.()).toBe(false);

    confirma.mockReturnValue(true);
    expect(gardaIesire.curenta?.()).toBe(true);
  });

  it('garda lasă plecarea liberă fără diferențe nesalvate', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    expect(gardaIesire.curenta?.()).toBe(true);
    expect(confirma).not.toHaveBeenCalled();
  });

  it('fără ciornă deschisă nu există nimic de păzit', async () => {
    randeaza();
    await screen.findByRole('button', { name: /Editează ediția/ });
    expect(gardaIesire.curenta?.()).toBe(true);
    expect(confirma).not.toHaveBeenCalled();
  });

  it('avertismentul browserului e înregistrat doar cât timp există ce pierde', async () => {
    const adauga = vi.spyOn(window, 'addEventListener');
    const scoate = vi.spyOn(window, 'removeEventListener');

    await deschideCiorna();
    expect(adauga.mock.calls.some(([tip]) => tip === 'beforeunload')).toBe(true);

    confirma.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    await waitFor(() =>
      expect(scoate.mock.calls.some(([tip]) => tip === 'beforeunload')).toBe(true)
    );
  });
});

/**
 * Previzualizarea.
 *
 * `/?config=draft` randează ciorna DE PE SERVER. Cât timp butonul a fost o
 * ancoră, previzualizarea putea arăta documentul dinaintea editărilor — și
 * nimic nu spunea asta. Contractul păzit aici: ce se deschide e ce e pe ecran.
 */
describe('previzualizarea arată ce e pe ecran', () => {
  const refuz = (): string =>
    document.querySelector('.admin-bara-problema')?.textContent ?? '';

  /** `window.open` care întoarce o fereastră falsă, ca s-o putem interoga. */
  const fereastraFalsa = () => {
    const fereastra = { location: { href: '' }, close: vi.fn() };
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue(fereastra as unknown as Window);
    return { fereastra, open };
  };

  it('cu diferențe nesalvate, salvează documentul de pe ecran înainte să deschidă', async () => {
    const { fereastra } = fereastraFalsa();
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Ediție de test' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvează și previzualizează/ }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(saveEventConfigDraft.mock.calls[0][2].eventName).toBe('Ediție de test');
    await waitFor(() => expect(fereastra.location.href).toBe('/?config=draft'));
  });

  it('o salvare refuzată nu deschide nimic și spune care pas a picat', async () => {
    const { fereastra } = fereastraFalsa();
    saveEventConfigDraft.mockRejectedValue(new Error('config_invalid: ceva'));
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Ediție de test' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvează și previzualizează/ }));

    await waitFor(() => expect(fereastra.close).toHaveBeenCalled());
    expect(fereastra.location.href).toBe('');
    await waitFor(() => expect(refuz()).toContain('Salvarea'));
  });

  it('fără diferențe, previzualizarea rămâne un link care nu scrie nimic', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    const link = screen.getByRole('link', { name: 'Previzualizează' });
    expect(link.getAttribute('href')).toBe('/?config=draft');
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('un config invalid face previzualizarea inertă, ca „Publică"', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: '' } });

    const buton = screen.getByRole('button', {
      name: /Salvează și previzualizează/,
    }) as HTMLButtonElement;
    expect(buton.disabled).toBe(true);
  });

  it('după previzualizare, ciorna nu mai e „Nesalvat"', async () => {
    fereastraFalsa();
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Ediție de test' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvează și previzualizează/ }));

    await waitFor(() =>
      expect(document.querySelector('.admin-bara-stare')?.textContent).not.toContain('Nesalvat')
    );
  });
});

/**
 * Confirmarea publicării arată CE se schimbă.
 *
 * Până acum spunea doar consecința („vizitatorii vor vedea landing-ul"), care e
 * adevărată și când ai mutat cursa cu o săptămână din greșeală.
 */
describe('confirmarea publicării arată diferențele', () => {
  const deschideConfirmarea = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

  const diferente = (): string[] =>
    [...document.querySelectorAll('.admin-diferente > div')].map(
      (d) => d.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );

  it('enumeră doar câmpurile schimbate, cu valoarea veche și cea nouă', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    fireEvent.change(camp('Locuri disponibile'), { target: { value: '42' } });
    deschideConfirmarea();

    const lista = diferente();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toContain('Locuri disponibile');
    expect(lista[0]).toContain(String(SNAPSHOT_CONFIG.slots.total));
    expect(lista[0]).toContain('42');
  });

  it('un document neschimbat o spune, în loc să arate o listă goală', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    deschideConfirmarea();
    expect(screen.getByText(/Nimic nu se schimbă/)).toBeDefined();
    expect(diferente()).toHaveLength(0);
  });

  it('o ciornă a altei ediții e prima publicare, nu un document „tot schimbat"', async () => {
    await creeazaPrinDialog();
    deschideConfirmarea();

    expect(screen.getByText(/Prima publicare a ediției/)).toBeDefined();
    expect(diferente()).toHaveLength(0);
  });

  it('confirmarea păstrează ce vede vizitatorul și nota despre share preview', async () => {
    await deschideCiorna();
    deschideConfirmarea();

    expect(screen.getByText(/landing-ul cu înscrieri/)).toBeDefined();
    expect(screen.getByText(/Share preview-ul/)).toBeDefined();
  });

  it('momentele din listă se citesc, nu se descifrează', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    // Două ore mai târziu, nu o altă lună: restul reperelor ale instantaneului
    // rămân valide, deci „Publică" nu e blocat de validare și dialogul se
    // deschide — testul e despre FORMA valorii, nu despre validare.
    const nou = fataDeStart(2);
    fireEvent.change(camp('Startul cursei'), { target: { value: nou } });
    deschideConfirmarea();

    const rand0 = diferente().find((d) => d.includes('Startul cursei')) ?? '';
    expect(rand0).toContain(nou.slice(11, 16));
    expect(rand0).not.toContain(`${nou}:00`);
  });
});

/**
 * Ciorna bifurcată.
 *
 * `admin_save_event_config_draft` face `on conflict (editie) where status =
 * 'draft'`, deci un număr de ediție schimbat scrie o ciornă SEPARATĂ. Tabul
 * încărca cea mai nouă (`created_at desc`) fără s-o spună: se putea lucra la
 * una și publica alta.
 */
describe('ciorna bifurcată devine vizibilă', () => {
  const douaCiorne = () => {
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-noua',
        editie: SNAPSHOT_CONFIG.number + 1,
        config: { ...SNAPSHOT_CONFIG, number: SNAPSHOT_CONFIG.number + 1 },
        status: 'draft',
        published_at: null,
        created_at: '2026-08-10T10:00:00Z',
      }),
      rand({
        id: 'ciorna-veche',
        editie: SNAPSHOT_CONFIG.number,
        config: SNAPSHOT_CONFIG,
        status: 'draft',
        published_at: null,
        created_at: '2026-08-02T10:00:00Z',
      }),
      rand(),
    ]);
  };

  const banner = (): string =>
    [...document.querySelectorAll('.admin-banner')]
      .map((b) => b.textContent ?? '')
      .find((t) => t.includes('ciorne deschise')) ?? '';

  it('două ciorne pe server produc un banner care le numește', async () => {
    douaCiorne();
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    expect(banner()).toContain('2 ciorne deschise');
    expect(banner()).toContain(String(SNAPSHOT_CONFIG.number));
    expect(banner()).toContain(String(SNAPSHOT_CONFIG.number + 1));
  });

  it('o singură ciornă nu produce niciun banner', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    expect(banner()).toBe('');
  });

  it('cealaltă ciornă se poate deschide dintr-un click', async () => {
    douaCiorne();
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();
    // Se încarcă cea mai nouă: ediția N+1.
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1));

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`Deschide ciorna ediției ${SNAPSHOT_CONFIG.number}$`),
      })
    );
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number));
  });

  it('schimbarea numărului ediției spune că salvarea va crea o ciornă separată', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    const numar = camp('Numărul ediției');
    fireEvent.change(numar, { target: { value: String(SNAPSHOT_CONFIG.number + 1) } });
    expect(eroareaCampului('Numărul ediției')).toContain('ciornă separată');

    // Înapoi la numărul încărcat: atenționarea dispare.
    fireEvent.change(numar, { target: { value: String(SNAPSHOT_CONFIG.number) } });
    expect(eroareaCampului('Numărul ediției')).not.toContain('ciornă separată');
  });

  it('atenționarea nu blochează publicarea — nu e o eroare', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    fireEvent.change(camp('Numărul ediției'), {
      target: { value: String(SNAPSHOT_CONFIG.number + 1) },
    });
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

/**
 * Câmpurile pe care validarea le cerea și formularul nu le avea.
 *
 * `venue.zoom` era validat de ambele părți și inexistent pe ecran: un document
 * cu zoom zero deschidea grupul „Unde" fără niciun câmp marcat și lăsa
 * „Publică" mort, fără nimic de reparat.
 */
describe('câmpurile lipsă din formular', () => {
  it('zoom-ul hărții se poate alege, și ajunge în documentul salvat', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText('Zoom-ul hărții'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalled());
    expect(saveEventConfigDraft.mock.calls[0][2].venue.zoom).toBe(18);
  });

  it('un document cu zoom zero e reparabil din formular, nu blocat pe veci', async () => {
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna',
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, venue: { ...SNAPSHOT_CONFIG.venue, zoom: 0 } },
      }),
      rand(),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    // Grupul „Unde" e deschis de la sine, cu eroarea PE câmp.
    expect(eroareaCampului('Zoom-ul hărții')).toContain('Zoom');
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.change(screen.getByLabelText('Zoom-ul hărții'), { target: { value: '16' } });
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('un zoom din afara treptelor rămâne vizibil, nu se pierde', async () => {
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna',
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, venue: { ...SNAPSHOT_CONFIG.venue, zoom: 11 } },
      }),
      rand(),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    expect((screen.getByLabelText('Zoom-ul hărții') as HTMLSelectElement).value).toBe('11');
  });

  it('valoarea de rezervă a ocupării se poate corecta din formular', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText(/Ocupate \(valoare de rezervă\)/), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalled());
    expect(saveEventConfigDraft.mock.calls[0][2].slots.occupiedFallback).toBe(0);
  });

  it('o valoare de rezervă peste capacitate e semnalată, dar nu blochează', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText(/Ocupate \(valoare de rezervă\)/), {
      target: { value: '999' },
    });
    expect(eroareaCampului(/Ocupate \(valoare de rezervă\)/)).toContain('capacitatea');
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

/**
 * De la „N câmpuri de reparat" la câmpul vinovat.
 *
 * Numărul din bară spunea CÂTE, niciodată CARE: căutarea trecea prin șapte
 * grupuri, dintre care unele pliate.
 */
describe('indicatorul de erori duce la câmp', () => {
  it('apăsarea lui focusează primul câmp invalid', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });

    fireEvent.click(screen.getByRole('button', { name: /câmp de reparat/ }));
    expect(document.activeElement).toBe(camp('Coordonatele'));
  });

  it('cu două probleme, merge la prima din document, nu la ultima', async () => {
    await deschideCiorna();
    // „Numele evenimentului" e sus în document, coordonatele mai jos.
    fireEvent.change(camp('Numele evenimentului'), { target: { value: '' } });
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });

    fireEvent.click(screen.getByRole('button', { name: /câmpuri de reparat/ }));
    expect(document.activeElement).toBe(camp('Numele evenimentului'));
  });

  it('fără probleme, bara arată ediția și nu mai e buton', async () => {
    await deschideCiorna();
    expect(screen.queryByRole('button', { name: /de reparat/ })).toBeNull();
  });

  it('fiecare cheie produsă de validare are un câmp care o poartă', async () => {
    // Garda care ține cele două vocabulare lipite: dacă o validare nouă scrie o
    // cheie pe care niciun `Camp` n-o stampilează, saltul ar duce nicăieri.
    await deschideCiorna();
    const stampilate = new Set(
      [...document.querySelectorAll('[data-camp]')].map((e) => e.getAttribute('data-camp'))
    );
    const cheiSimple = [
      'number',
      'launchNumber',
      'eventName',
      'concept',
      'tz',
      'start',
      'durationHours',
      'checkinFrom',
      'registrationDeadline',
      'launchAt',
      'nextEditionAt',
      'leaderboardLeadHours',
      'slots.total',
      'slots.waitlist',
      'slots.occupiedFallback',
      'venue.name',
      'venue.city',
      'venue.mapQuery',
      'venue.zoom',
    ];
    for (const cheie of cheiSimple) expect(stampilate).toContain(cheie);
  });
});

/** Cele două dialoguri ale tabului se poartă ca niște dialoguri. */
describe('dialogurile tabului au tastatură', () => {
  it('Escape închide confirmarea publicării, fără să publice', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('Escape închide dialogul de ediție nouă, fără să deschidă vreo ciornă', async () => {
    await deschideDialogEditieNoua();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renunță' })).toBeNull();
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('dialogul de ediție nouă deschide focusul pe primul câmp', async () => {
    await deschideDialogEditieNoua();
    expect(document.activeElement).toBe(screen.getByLabelText('Data cursei'));
  });
});
