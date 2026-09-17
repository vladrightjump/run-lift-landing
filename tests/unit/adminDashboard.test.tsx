// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import type { adminApiMock } from './helpers/adminHarness';

/**
 * Primul test de componentă din backoffice. Până acum `src/admin/` avea zero
 * acoperire: doar `emailAudience.ts` și `deliveryLog.ts` erau testate, iar ele
 * sunt logică pură scoasă din componente.
 */

const api = vi.hoisted(() => ({ current: null as ReturnType<typeof adminApiMock> | null }));

vi.mock('../../src/lib/adminApi', async () => {
  const { adminApiMock: build, participant: p, logEntry: l } = await import(
    './helpers/adminHarness'
  );
  api.current = build(vi, {
    registrations: [
      p({ id: 'r1', nume: 'Ana Popescu', email: 'ana@exemplu.ro' }),
      p({ id: 'r2', nume: 'Mihai Ionescu', email: 'mihai@exemplu.ro' }),
    ],
    // Ana are confirmarea trimisă, dar niciun reminder — cazul pe care insigna
    // veche (cheiată doar pe adresă) îl raporta drept „✓ trimis".
    emailLog: [
      l({ id: 'e1', email: 'ana@exemplu.ro', subiect: 'Confirmare', mod: 'confirm', status: 'trimis' }),
      l({ id: 'e2', email: 'mihai@exemplu.ro', subiect: 'Reminder', mod: 'admin', status: 'esuat' }),
    ],
  });
  return api.current;
});

vi.mock('../../src/lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendConfirmationEmail: vi.fn(async () => undefined),
}));

const { AdminDashboard } = await import('../../src/admin/AdminDashboard');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminDashboard', () => {
  it('randează un rând pentru fiecare participant al ediției', async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    expect(await screen.findByText('Ana Popescu')).toBeDefined();
    expect(screen.getByText('Mihai Ionescu')).toBeDefined();
  });

  it('cere lista pentru ediția curentă, nu pentru toate edițiile', async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    await waitFor(() => {
      expect(api.current?.listRegistrations).toHaveBeenCalled();
    });
    const [, editieCeruta] = api.current!.listRegistrations.mock.calls.at(-1)!;
    expect(editieCeruta).toBe(5);
  });

  it('numără emailurile nelivrate prin logica din deliveryLog, nu printr-o copie', async () => {
    // Un eșec pe „Reminder" trebuie să rămână numărat chiar dacă aceeași adresă
    // are o trimitere reușită pe alt subiect. Cheia e adresă+subiect.
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    expect(await screen.findByText('Ana Popescu')).toBeDefined();
    const alerta = document.querySelector('.admin-tab-alert');
    expect(alerta?.textContent).toBe('1');
  });

  it('insigna NU raportează „complet" cât timp o comunicare datorată lipsește', async () => {
    // Regresia pe care o ascundea harta cheiată doar pe adresă: Ana are o
    // confirmare reușită, dar niciun reminder. Insigna veche arăta „✓ trimis".
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    await screen.findByText('Ana Popescu');
    const insigne = [...document.querySelectorAll('.admin-mail-badge')];
    const aleiAna = insigne[0];

    expect(aleiAna.className).toContain('partial');
    expect(aleiAna.textContent).toBe('1/2');
    expect(aleiAna.getAttribute('title')).toContain('Confirmare: trimis');
    expect(aleiAna.getAttribute('title')).toContain('Reminder: lipsă');
  });
});

describe('AdminDashboard — undo la ștergere', () => {
  /** Șterge primul participant și întoarce funcția de undo din toast. */
  const stergePrimul = async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Ana Popescu');

    fireEvent.click(screen.getAllByRole('button', { name: 'Șterge' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Da, șterge' }));

    await waitFor(() => expect(api.current?.deleteRegistration).toHaveBeenCalled());
    const toast = await screen.findByRole('status');
    return within(toast).getByRole('button', { name: 'Anulează' });
  };

  it('undo reversează ștergerea — NU reinserează', async () => {
    // Defectul: undo apela `addRegistration`, care sare peste garda de
    // capacitate și dă rândului recreat un `created_at` nou, deci persoana își
    // pierdea locul în ordinea de promovare.
    const undo = await stergePrimul();
    fireEvent.click(undo);

    await waitFor(() => expect(api.current?.undeleteRegistration).toHaveBeenCalled());
    expect(api.current?.addRegistration).not.toHaveBeenCalled();
  });

  it('undo trimite id-ul rândului șters, nu datele lui', async () => {
    const undo = await stergePrimul();
    fireEvent.click(undo);

    await waitFor(() => expect(api.current?.undeleteRegistration).toHaveBeenCalled());
    const [, id] = api.current!.undeleteRegistration.mock.calls.at(-1)!;
    expect(id).toBe('r1');
  });

  it('undo refuzat pentru că locul s-a ocupat spune de ce', async () => {
    const undo = await stergePrimul();
    api.current!.undeleteRegistration.mockRejectedValueOnce(
      new Error('Supabase 400: {"message":"event_full"}')
    );
    fireEvent.click(undo);

    expect(await screen.findByText(/ediția e plină/i)).toBeDefined();
  });

  it('undo refuzat pentru adresă re-înscrisă spune de ce', async () => {
    const undo = await stergePrimul();
    api.current!.undeleteRegistration.mockRejectedValueOnce(
      new Error('Supabase 400: {"message":"duplicate_email"}')
    );
    fireEvent.click(undo);

    expect(await screen.findByText(/re-înscrisă/i)).toBeDefined();
  });
});

describe('AdminDashboard — navigarea între taburi', () => {
  /**
   * Deschide un tab așa cum o face organizatorul: întâi grupul, apoi tabul.
   * Navigația are două niveluri, iar taburile unui grup inactiv nici nu sunt
   * randate — de asta clicul direct pe „Șabloane" n-ar găsi nimic.
   */
  const deschide = async (grup: string, eticheta: string) => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Ana Popescu');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(grup) }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(eticheta) }));
  };

  it('pornește pe „Participanți", cu tabelul lor', async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    expect(await screen.findByText('Ana Popescu')).toBeDefined();
    expect(screen.getByLabelText('Caută în lista de participanți')).toBeDefined();
  });

  it('deschiderea „Șabloane" schimbă vederea și lasă participanții în urmă', async () => {
    await deschide('Comunicare', 'Șabloane');
    expect(await screen.findByText('Șabloane de email')).toBeDefined();
    expect(screen.queryByLabelText('Caută în lista de participanți')).toBeNull();
  });

  it('deschiderea „Livrare" schimbă vederea', async () => {
    await deschide('Comunicare', 'Livrare');
    await waitFor(() =>
      expect(screen.queryByLabelText('Caută în lista de participanți')).toBeNull()
    );
  });

  it('un singur tab e randat odată — vederile nu se suprapun', async () => {
    await deschide('Comunicare', 'Șabloane');
    await screen.findByText('Șabloane de email');
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });

  it('vederile taburilor închise nu se strecoară peste cel deschis', async () => {
    // Verificarea în cealaltă direcție: pe „Participanți" NU trebuie să apară
    // nimic din celelalte taburi. Fără ea, o condiție de randare stricată
    // (`{true && …}` în loc de `{tab === '…' && …}`) ar trece neobservată,
    // pentru că testul de mai sus se uită doar la tabul deschis.
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Ana Popescu');

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDefined();
    expect(screen.queryByText('Șabloane de email')).toBeNull();
  });
});

describe('AdminDashboard — căutarea în participanți', () => {
  const cauta = async (text: string) => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Ana Popescu');
    fireEvent.change(screen.getByLabelText('Caută în lista de participanți'), {
      target: { value: text },
    });
  };

  it('filtrează după nume', async () => {
    await cauta('Ana');
    expect(screen.getByText('Ana Popescu')).toBeDefined();
    expect(screen.queryByText('Mihai Ionescu')).toBeNull();
  });

  it('filtrează după email', async () => {
    await cauta('mihai@exemplu.ro');
    expect(screen.getByText('Mihai Ionescu')).toBeDefined();
    expect(screen.queryByText('Ana Popescu')).toBeNull();
  });

  it('nu ține cont de majuscule', async () => {
    await cauta('ANA POPESCU');
    expect(screen.getByText('Ana Popescu')).toBeDefined();
  });

  it('o căutare fără rezultate golește tabelul, fără să pice', async () => {
    await cauta('nimeni-pe-lumea-asta');
    expect(screen.queryByText('Ana Popescu')).toBeNull();
    expect(screen.queryByText('Mihai Ionescu')).toBeNull();
  });
});

describe('AdminDashboard — exportul CSV', () => {
  it('scrie un fișier cu antetul așteptat și un rând per participant', async () => {
    // `Blob.text()` nu există în jsdom; prindem conținutul la construire.
    const bucati: string[] = [];
    const BlobReal = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends BlobReal {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          bucati.push(parts.map(String).join(''));
          super(parts, options);
        }
      }
    );
    const createURL = vi.fn(() => 'blob:fals');
    vi.stubGlobal('URL', { ...URL, createObjectURL: createURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Ana Popescu');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const csv = bucati.at(-1) ?? '';
    expect(csv).toContain('Nr');
    expect(csv).toContain('Nume');
    expect(csv).toContain('Telefon');
    expect(csv).toContain('Email');
    expect(csv).toContain('Ana Popescu');
    expect(csv).toContain('Mihai Ionescu');
    expect(click).toHaveBeenCalled();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('AdminDashboard — sesiunea expirată', () => {
  it('un token invalid la încărcare duce înapoi la login', async () => {
    const { InvalidTokenError } = await import('../../src/lib/adminApi');
    api.current!.listRegistrations.mockRejectedValue(new InvalidTokenError());
    const onLogout = vi.fn();

    render(<AdminDashboard token="token-test" onLogout={onLogout} />);

    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });
});

describe('AdminDashboard — lista de așteptare', () => {
  const PE_LISTA = {
    id: 'w1',
    created_at: '2026-08-21T09:00:00Z',
    nume: 'Elena Rusu',
    telefon: '+37360000001',
    email: 'elena@exemplu.ro',
    editie: 5 as const,
  };

  /** Șterge singurul rând de pe listă și întoarce butonul de undo din toast. */
  const stergeDeAsteptare = async () => {
    api.current!.listWaitlist.mockResolvedValue([PE_LISTA]);
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Elena Rusu');

    const rand = screen.getByText('Elena Rusu').closest('.admin-row') as HTMLElement;
    fireEvent.click(within(rand).getByRole('button', { name: 'Șterge' }));

    await waitFor(() => expect(api.current?.deleteWaitlist).toHaveBeenCalled());
    // Prin clasă, nu prin `role="status"`: scheletele de încărcare ale
    // celorlalte tabele poartă și ele rolul, iar care dintre ele a apucat să se
    // rezolve depinde de ordinea testelor.
    const toast = (await screen.findByText(/a fost șters din așteptare/)).closest(
      '.admin-toast'
    ) as HTMLElement;
    return within(toast).getByRole('button', { name: 'Anulează' });
  };

  it('ștergerea de pe listă are undo, ca și ștergerea unei înscrieri', async () => {
    // Paritatea lipsă: `handleDelete` avea toast cu undo, `handleDeleteWaitlist`
    // nu — iar `admin_delete_waitlist` ștergea FIZIC, deci n-avea ce reversa.
    const undo = await stergeDeAsteptare();
    fireEvent.click(undo);

    await waitFor(() => expect(api.current?.undeleteWaitlist).toHaveBeenCalled());
    const [, id] = api.current!.undeleteWaitlist.mock.calls.at(-1)!;
    expect(id).toBe('w1');
  });

  it('undo refuzat pentru că lista s-a umplut spune de ce', async () => {
    const undo = await stergeDeAsteptare();
    api.current!.undeleteWaitlist.mockRejectedValueOnce(
      new Error('Supabase 400: {"message":"waitlist_full"}')
    );
    fireEvent.click(undo);

    expect(await screen.findByText(/s-a umplut între timp/i)).toBeDefined();
  });

  it('undo pe un rând promovat între timp spune unde e persoana, nu „nu a mers"', async () => {
    // Promovarea șterge FIZIC rândul. O întoarcere tăcută ar fi cel mai prost
    // răspuns: persoana e înscrisă, nu pierdută.
    const undo = await stergeDeAsteptare();
    api.current!.undeleteWaitlist.mockRejectedValueOnce(
      new Error('Supabase 400: {"message":"not_found"}')
    );
    fireEvent.click(undo);

    expect(await screen.findByText(/promovat între timp/i)).toBeDefined();
  });

  it('dublu-clicul pe „Promovează" nu trimite două cereri', async () => {
    api.current!.listWaitlist.mockResolvedValue([PE_LISTA]);
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Elena Rusu');

    const rand = screen.getByText('Elena Rusu').closest('.admin-row') as HTMLElement;
    const buton = within(rand).getByRole('button', { name: 'Promovează' });
    fireEvent.click(buton);
    fireEvent.click(buton);

    await waitFor(() => expect(api.current?.promoteWaitlist).toHaveBeenCalled());
    expect(api.current?.promoteWaitlist).toHaveBeenCalledTimes(1);
  });

  it('rândul părăsește tabelul cât timp cererea lui e în zbor', async () => {
    // Cealaltă jumătate a garanției de mai sus, și motivul pentru care ea ține:
    // rândul e scos optimist, deci nu mai există buton pe care să se apese a
    // doua oară. `disabled` pe rând e a doua încuietoare, pentru ziua în care
    // scoaterea optimistă dispare — nu prima.
    api.current!.listWaitlist.mockResolvedValue([PE_LISTA]);
    api.current!.promoteWaitlist.mockImplementationOnce(() => new Promise(() => {}));
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Elena Rusu');

    const rand = screen.getByText('Elena Rusu').closest('.admin-row') as HTMLElement;
    fireEvent.click(within(rand).getByRole('button', { name: 'Promovează' }));

    await waitFor(() => expect(screen.queryByText('Elena Rusu')).toBeNull());
  });

  it('un rând ocupat nu blochează butoanele celorlalte rânduri', async () => {
    const alta = { ...PE_LISTA, id: 'w2', nume: 'Radu Vasile', email: 'radu@exemplu.ro' };
    api.current!.listWaitlist.mockResolvedValue([PE_LISTA, alta]);
    api.current!.promoteWaitlist.mockImplementationOnce(() => new Promise(() => {}));
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Elena Rusu');

    const primul = screen.getByText('Elena Rusu').closest('.admin-row') as HTMLElement;
    fireEvent.click(within(primul).getByRole('button', { name: 'Promovează' }));

    const alDoilea = screen.getByText('Radu Vasile').closest('.admin-row') as HTMLElement;
    expect(
      (within(alDoilea).getByRole('button', { name: 'Promovează' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('butonul redevine activ după un eșec, ca acțiunea să poată fi reîncercată', async () => {
    api.current!.listWaitlist.mockResolvedValue([PE_LISTA]);
    api.current!.promoteWaitlist.mockRejectedValueOnce(new Error('Supabase 500: boom'));
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Elena Rusu');

    const rand = screen.getByText('Elena Rusu').closest('.admin-row') as HTMLElement;
    fireEvent.click(within(rand).getByRole('button', { name: 'Promovează' }));

    await waitFor(() =>
      expect(
        (within(rand).getByRole('button', { name: 'Promovează' }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
  });
});
