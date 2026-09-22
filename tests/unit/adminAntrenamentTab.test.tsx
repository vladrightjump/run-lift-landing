import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { AdminAntrenamentTab } from '../../src/admin/AdminAntrenamentTab';
import type { AdminWorkoutRow } from '../../src/lib/adminApi';

/**
 * Ecranul programului de antrenamente.
 *
 * Contractul păzit aici: refuzul serverului ajunge la om fără să-i piardă
 * textul, vizibilitatea e independentă de conținut, o salvare proprie nu
 * rescrie câmpurile din care tocmai edita cineva, iar numărul săptămânii nu se
 * tastează niciodată — îl pune serverul și ecranul îl arată dinainte.
 *
 * Garanția nouă, de la programul numerotat încoace: cu text netrimis în editor,
 * un clic pe altă săptămână cere confirmare. Fără ea, o listă pe care ești
 * invitat să apeși ar fi transformat fiecare clic într-o șansă de a pierde ce
 * tocmai ai scris.
 */

const {
  listWeeklyWorkout,
  saveWeeklyWorkout,
  moveWeeklyWorkout,
  deleteWeeklyWorkout,
  restoreWeeklyWorkout,
  mesajRefuzAntrenament,
} = vi.hoisted(() => ({
  listWeeklyWorkout: vi.fn(),
  saveWeeklyWorkout: vi.fn(),
  moveWeeklyWorkout: vi.fn(),
  deleteWeeklyWorkout: vi.fn(),
  restoreWeeklyWorkout: vi.fn(),
  mesajRefuzAntrenament: vi.fn((e: unknown) =>
    String(e).includes('workout_empty') ? 'Nu poți face vizibilă o săptămână goală.' : 'eroare'
  ),
}));

vi.mock('../../src/lib/adminApi', () => ({
  listWeeklyWorkout,
  saveWeeklyWorkout,
  moveWeeklyWorkout,
  deleteWeeklyWorkout,
  restoreWeeklyWorkout,
  mesajRefuzAntrenament,
}));

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);

const rand = (over: Partial<AdminWorkoutRow> = {}): AdminWorkoutRow => ({
  id: 'r1',
  numar: 1,
  status: 'published',
  titlu: 'Tempo',
  corp: '5×1000m',
  vizibil: true,
  creat_la: '2026-09-15T10:00:00Z',
  ...over,
});

/** Un program de N săptămâni publicate, toate vizibile. */
const programDe = (n: number): AdminWorkoutRow[] =>
  Array.from({ length: n }, (_, i) =>
    rand({ id: `s${i + 1}`, numar: i + 1, titlu: `S${i + 1}`, corp: `corp ${i + 1}` })
  );

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={onAuthError} showToast={showToast}>
      <AdminAntrenamentTab />
    </FurnizorSesiuneAdmin>
  );

const camp = (eticheta: RegExp): HTMLInputElement | HTMLTextAreaElement =>
  screen.getByLabelText(eticheta) as HTMLInputElement | HTMLTextAreaElement;

const butonSalveaza = (): HTMLButtonElement =>
  screen.getByRole('button', {
    name: /^(Salvează|Se salvează…|Adaugă Săptămâna \d+)$/,
  }) as HTMLButtonElement;

const butonAdauga = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /^\+ Săptămâna \d+$/ }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  listWeeklyWorkout.mockResolvedValue(programDe(3));
  saveWeeklyWorkout.mockResolvedValue('nou');
  moveWeeklyWorkout.mockResolvedValue(2);
  deleteWeeklyWorkout.mockResolvedValue(2);
  restoreWeeklyWorkout.mockResolvedValue('r1');
});

afterEach(cleanup);

describe('la deschidere', () => {
  it('listează programul, în ordine', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());
    expect(screen.getByRole('button', { name: 'S3' })).toBeDefined();
    expect(screen.getByText('01')).toBeDefined();
    expect(screen.getByText('03')).toBeDefined();
  });

  it('editorul pornește pe o săptămână NOUĂ, nu peste una existentă', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    // Câmpurile goale: deschiderea ecranului nu trebuie să sugereze că editezi
    // ceva ce există deja.
    expect(camp(/Titlu/).value).toBe('');
    expect(camp(/Antrenamentul/).value).toBe('');
  });

  it('spune ce vede publicul, fără să intri în vreo săptămână', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByText('Săptămâna 3')).toBeDefined());
  });

  it('cu tot programul ascuns, spune că pe pagină nu se vede nimic', async () => {
    listWeeklyWorkout.mockResolvedValue(programDe(2).map((s) => ({ ...s, vizibil: false })));
    randeaza();
    await waitFor(() => expect(screen.getByText('nimic')).toBeDefined());
  });

  it('fără niciun antrenament salvat, ecranul se randează gol, nu rupt', async () => {
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();
    await waitFor(() => expect(butonAdauga().textContent).toBe('+ Săptămâna 1'));
    expect(camp(/Titlu/).value).toBe('');
  });

  it('numără la singular când programul are o singură săptămână', async () => {
    listWeeklyWorkout.mockResolvedValue(programDe(1));
    randeaza();
    await waitFor(() => expect(screen.getByText('1 săptămână')).toBeDefined());
  });

  it('numără la plural de la două în sus', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByText('3 săptămâni')).toBeDefined());
  });
});

describe('numărul săptămânii', () => {
  it('butonul de adăugare poartă numărul următor, calculat', async () => {
    listWeeklyWorkout.mockResolvedValue(programDe(9));
    randeaza();
    await waitFor(() => expect(butonAdauga().textContent).toBe('+ Săptămâna 10'));
  });

  it('o săptămână nouă se trimite cu id null — serverul pune numărul', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    fireEvent.change(camp(/Titlu/), { target: { value: 'S4' } });
    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'corp 4' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenCalledWith('t', null, 'S4', 'corp 4', false)
    );
  });

  it('nicăieri în ecran nu se poate tasta un număr', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    // Doar două câmpuri editabile: titlul și corpul.
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

describe('editarea unei săptămâni', () => {
  it('apăsarea pe o săptămână o pune în editor', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));

    expect(camp(/Titlu/).value).toBe('S2');
    expect(camp(/Antrenamentul/).value).toBe('corp 2');
  });

  it('salvarea trimite id-ul rândului publicat al acelei săptămâni', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'corp rescris' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenCalledWith('t', 's2', 'S2', 'corp rescris', true)
    );
  });

  it('refuzul serverului ajunge la om și textul rămâne în formular', async () => {
    saveWeeklyWorkout.mockRejectedValue(new Error('workout_empty'));
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();

    fireEvent.change(camp(/Titlu/), { target: { value: 'Tempo' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', msg: expect.stringContaining('goală') })
      )
    );
    // Textul nu se pierde: altfel un refuz ar costa tot ce tocmai s-a scris.
    expect(camp(/Titlu/).value).toBe('Tempo');
  });

  it('vizibilitatea e independentă de conținut — ascunsă cu text se salvează', async () => {
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'de săptămâna viitoare' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ascunsă' }));
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenCalledWith(
        't',
        null,
        '',
        'de săptămâna viitoare',
        false
      )
    );
  });

  it('a doua salvare pe aceeași săptămână merge — editorul urmează id-ul nou', async () => {
    /**
     * Drumul „corectez o greșeală, apoi încă una".
     *
     * O editare de conținut trece rândul în `superseded` și scrie unul nou, cu
     * alt id. Dacă editorul rămâne ancorat pe cel vechi, a doua salvare pleacă
     * cu un id care nu mai e publicat, iar serverul o refuză cu `not_found`.
     *
     * Mock-ul TREBUIE să rotească id-ul, altfel testul nu păzește nimic — exact
     * greșeala care a lăsat defectul să treacă prima dată.
     */
    const dupaPrimaSalvare = programDe(3).map((s) =>
      s.id === 's2' ? { ...s, id: 's2-nou', corp: 'prima corectură' } : s
    );
    saveWeeklyWorkout.mockResolvedValueOnce('s2-nou');
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    listWeeklyWorkout.mockResolvedValue(dupaPrimaSalvare);
    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'prima corectură' } });
    fireEvent.click(butonSalveaza());
    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenLastCalledWith('t', 's2', 'S2', 'prima corectură', true)
    );

    // Săptămâna deschisă e tot 2, nu „—": ancorarea a urmat id-ul nou.
    // Legenda editorului, nu bara: identitatea apare acum în amândouă.
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('legend')].some((l) => l.textContent === 'Săptămâna 2')
      ).toBe(true)
    );

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'a doua corectură' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenLastCalledWith(
        't',
        's2-nou',
        'S2',
        'a doua corectură',
        true
      )
    );
  });
});

describe('verbele comune ale ecranelor de conținut', () => {
  const butonPublica = () => screen.getByRole('button', { name: 'Publică' });

  it('„Publică" salvează ȘI arată săptămâna pe pagină', async () => {
    // Aici săptămânile sînt un program, iar `vizibil` alege care se vede: de
    // asta verbul nu poate însemna același lucru ca pe clipuri.
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'text nou' } });
    fireEvent.click(butonPublica());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenLastCalledWith('t', 's2', 'S2', 'text nou', true)
    );
  });

  it('„Salvează" păstrează vizibilitatea de acum, n-o schimbă', async () => {
    // O săptămână ascunsă rămâne ascunsă: salvarea e despre text, nu despre
    // ce se vede pe pagină.
    listWeeklyWorkout.mockResolvedValue(
      programDe(3).map((s) => (s.id === 's3' ? { ...s, vizibil: false } : s))
    );
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S3' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'S3' }));
    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'corectură' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenLastCalledWith('t', 's3', 'S3', 'corectură', false)
    );
  });
});

describe('textul nesalvat', () => {
  it('schimbarea săptămânii cu text atins cere confirmare, și nu o face încă', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'ceva nesalvat' } });
    fireEvent.click(screen.getByRole('button', { name: 'S1' }));

    expect(screen.getByRole('alertdialog', { name: /text nesalvat/i })).toBeDefined();
    expect(camp(/Antrenamentul/).value).toBe('ceva nesalvat');
  });

  it('„Rămân aici" păstrează textul', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'ceva nesalvat' } });
    fireEvent.click(screen.getByRole('button', { name: 'S1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rămân aici' }));

    expect(camp(/Antrenamentul/).value).toBe('ceva nesalvat');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('„Renunț la text" deschide săptămâna cerută', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'ceva nesalvat' } });
    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Renunț la text' }));

    expect(camp(/Antrenamentul/).value).toBe('corp 2');
  });

  it('text tastat ÎN TIMPUL salvării rămâne păzit — nu trece drept salvat', async () => {
    // Garda se golește după `await`, deci trebuie să știe dacă între plecarea
    // cererii și întoarcerea ei s-a mai scris ceva. Altfel textul de după ar fi
    // aruncat fără confirmare la următorul clic pe altă săptămână.
    let elibereaza: (v: string) => void = () => {};
    saveWeeklyWorkout.mockReturnValueOnce(
      new Promise<string>((res) => {
        elibereaza = res;
      })
    );
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'S2' }));

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'prima versiune' } });
    fireEvent.click(butonSalveaza());
    await waitFor(() => expect(saveWeeklyWorkout).toHaveBeenCalled());

    // Omul continuă să scrie cât timp cererea e în zbor.
    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'ce scriu acum' } });
    elibereaza('s2');
    await waitFor(() => expect(showToast).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'S1' }));

    expect(screen.getByRole('alertdialog', { name: /text nesalvat/i })).toBeDefined();
    expect(camp(/Antrenamentul/).value).toBe('ce scriu acum');
  });

  it('fără nimic tastat în timpul salvării, garda se golește', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'S2' }));

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'corectat' } });
    fireEvent.click(butonSalveaza());
    await waitFor(() => expect(showToast).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'S1' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('fără text atins, schimbarea se face direct', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(camp(/Titlu/).value).toBe('S2');
  });
});

describe('ordinea', () => {
  it('↑ cheamă serverul cu direcția corectă', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Mută săptămâna 2 mai sus/ }));

    await waitFor(() => expect(moveWeeklyWorkout).toHaveBeenCalledWith('t', 's2', -1));
  });

  it('↓ cheamă serverul cu direcția corectă', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Mută săptămâna 2 mai jos/ }));

    await waitFor(() => expect(moveWeeklyWorkout).toHaveBeenCalledWith('t', 's2', 1));
  });

  it('capetele programului au butoanele lor dezactivate', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    expect(
      (screen.getByRole('button', { name: /Mută săptămâna 1 mai sus/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: /Mută săptămâna 3 mai jos/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});

describe('vizibilitatea din listă', () => {
  it('„Ascunde" trimite aceeași săptămână cu vizibilitatea întoarsă', async () => {
    listWeeklyWorkout.mockResolvedValue([rand({ id: 's1', numar: 1, titlu: 'S1', corp: 'c1' })]);
    randeaza();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Ascunde săptămâna 1/ })).toBeDefined()
    );

    fireEvent.click(screen.getByRole('button', { name: /Ascunde săptămâna 1/ }));

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenCalledWith('t', 's1', 'S1', 'c1', false)
    );
  });

  it('o săptămână ascunsă arată „Arată", nu „Ascunde"', async () => {
    listWeeklyWorkout.mockResolvedValue([rand({ id: 's1', vizibil: false })]);
    randeaza();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Arată săptămâna 1/ })).toBeDefined()
    );
  });
});

describe('ștergerea', () => {
  it('cere confirmare și nu cheamă serverul până nu o primește', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Șterge săptămâna 2/ }));

    expect(screen.getByRole('alertdialog', { name: /Ștergi Săptămâna 2/ })).toBeDefined();
    expect(deleteWeeklyWorkout).not.toHaveBeenCalled();
  });

  it('la anulare nu se șterge nimic', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Șterge săptămâna 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Nu șterge' }));

    expect(deleteWeeklyWorkout).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('confirmată, cheamă serverul cu id-ul săptămânii', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Șterge săptămâna 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Șterge săptămâna' }));

    await waitFor(() => expect(deleteWeeklyWorkout).toHaveBeenCalledWith('t', 's2'));
  });

  it('dialogul spune că renumerotează și că nu se poate anula', async () => {
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Șterge săptămâna 2/ }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/renumerotează/);
    expect(dialog.textContent).toMatch(/nu se poate anula/i);
  });
});

describe('versiunile anterioare', () => {
  const cuVersiune = () => [
    ...programDe(3),
    rand({
      id: 'v2',
      numar: 2,
      status: 'superseded',
      titlu: 'S2 vechi',
      corp: 'corp vechi',
    }),
  ];

  it('nu se arată cât timp editorul e pe o săptămână nouă', async () => {
    listWeeklyWorkout.mockResolvedValue(cuVersiune());
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    expect(screen.queryByText(/Versiuni anterioare/)).toBeNull();
  });

  it('arată doar versiunile săptămânii deschise', async () => {
    listWeeklyWorkout.mockResolvedValue(cuVersiune());
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));

    expect(screen.getByText(/Versiuni anterioare ale Săptămânii 2/)).toBeDefined();
    expect(screen.getByText('S2 vechi')).toBeDefined();
  });

  it('o săptămână fără versiuni nu arată deloc secțiunea', async () => {
    listWeeklyWorkout.mockResolvedValue(cuVersiune());
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S1' }));

    expect(screen.queryByText(/Versiuni anterioare/)).toBeNull();
  });

  it('revenirea cheamă serverul cu id-ul versiunii', async () => {
    listWeeklyWorkout.mockResolvedValue(cuVersiune());
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revino la ea' }));

    await waitFor(() => expect(restoreWeeklyWorkout).toHaveBeenCalledWith('t', 'v2'));
  });

  it('după revenire, editorul arată textul RESTAURAT, nu pe cel înlocuit', async () => {
    // Altfel ecranul ar spune că versiunea veche e publicată, dar ar arăta
    // conținutul celei noi — iar următoarea salvare l-ar scrie înapoi peste
    // restaurare, anulând-o în tăcere.
    listWeeklyWorkout.mockResolvedValue(cuVersiune());
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S2' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    expect(camp(/Antrenamentul/).value).toBe('corp 2');

    fireEvent.click(screen.getByRole('button', { name: 'Revino la ea' }));

    await waitFor(() => expect(camp(/Antrenamentul/).value).toBe('corp vechi'));
    expect(camp(/Titlu/).value).toBe('S2 vechi');
  });
});

describe('sesiunea expirată', () => {
  it('un eșec de autentificare nu produce un toast de eroare obișnuit', async () => {
    onAuthError.mockReturnValueOnce(true);
    saveWeeklyWorkout.mockRejectedValue(new Error('invalid_token'));
    randeaza();
    await waitFor(() => expect(screen.getByRole('button', { name: 'S1' })).toBeDefined());

    fireEvent.change(camp(/Titlu/), { target: { value: 'X' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });
});
