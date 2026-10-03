import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranBot } from '../../src/admin/sala/EcranBot';
import { comandaSala, dateSala } from './helpers/salaFixtures';

const monitorizare = vi.hoisted(() => ({ logClientError: vi.fn() }));
vi.mock('../../src/lib/monitoring', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/monitoring')>()),
  ...monitorizare,
}));

const api = vi.hoisted(() => ({
  incarcaSala: vi.fn(),
  salveazaConfigBot: vi.fn(),
  pornesteBot: vi.fn(),
  trimiteComanda: vi.fn(),
}));
vi.mock('../../src/lib/salaApi', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/salaApi')>()),
  ...api,
}));

let garda: (() => boolean) | null = null;
const randeaza = (showToast = vi.fn()) =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={showToast}>
      <EcranBot inregistreazaGardaIesire={(g) => (garda = g)} />
    </FurnizorSesiuneAdmin>
  );

const mesaj = () => document.querySelector('.admin-sala-telegram')?.textContent ?? '';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.salveazaConfigBot.mockResolvedValue(undefined);
  api.pornesteBot.mockResolvedValue(undefined);
  api.trimiteComanda.mockResolvedValue('id');
  monitorizare.logClientError.mockReset();
  garda = null;
});
afterEach(cleanup);

describe('Botul de Telegram', () => {
  it('textul gol arată textul de azi în previzualizare', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    expect(mesaj()).toContain('Antrenament mâine');
    expect(mesaj()).toContain('✅ Vin!');
    expect(mesaj()).toContain('❌ Nu pot');
  });

  it('previzualizarea urmează titlul la fiecare literă', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Titlu'), { target: { value: 'Alergăm!' } });
    expect(mesaj()).toContain('Alergăm!');
    expect(mesaj()).not.toContain('Antrenament mâine');
  });

  it('o oră invalidă blochează salvarea și spune de ce', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Locul'), { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toContain('Locul nu poate fi gol');
    expect((screen.getByRole('button', { name: 'Salvează setările' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('salvarea trimite setările, cu textul sondajului', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Titlu'), { target: { value: 'Alergăm!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează setările' }));
    await waitFor(() =>
      expect(api.salveazaConfigBot).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ poll_title: 'Alergăm!', poll_time: '12:00', poll_days: [1, 3] })
      )
    );
  });

  it('cu modificări nesalvate, garda de ieșire cere confirmare', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    expect(garda?.()).toBe(true);
    fireEvent.change(screen.getByLabelText('Titlu'), { target: { value: 'Alergăm!' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(garda?.()).toBe(false);
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('„trimite sondajul acum" cere confirmare, apoi pune comanda în coadă', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.click(screen.getByRole('button', { name: 'Trimite sondajul acum' }));
    expect(api.trimiteComanda).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Trimite' }));
    await waitFor(() => expect(api.trimiteComanda).toHaveBeenCalledWith('tok', 'send_poll'));
  });

  it('o comandă în așteptare de peste 3 minute → „botul nu răspunde"', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        comenzi: [comandaSala({ status: 'pending', created_at: new Date(Date.now() - 5 * 60_000).toISOString() })],
      })
    );
    randeaza();
    expect(await screen.findByText('Botul nu răspunde')).toBeTruthy();
  });

  it('mesajul liber cu mențiune pleacă ca HTML cu link de Telegram', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Textul mesajului'), { target: { value: 'Salut' } });
    fireEvent.change(screen.getByLabelText('Pomenește un membru'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trimite în grup' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Trimite' }));
    await waitFor(() =>
      expect(api.trimiteComanda).toHaveBeenCalledWith('tok', 'send_message', 'Salut <a href="tg://user?id=1003">Ana</a>')
    );
  });
});

const buton = (nume: string | RegExp) => screen.getByRole('button', { name: nume }) as HTMLButtonElement;
const configCu = (peste: Partial<NonNullable<ReturnType<typeof dateSala>['config']>>) => ({
  ...dateSala().config!,
  ...peste,
});

describe('pornit/oprit', () => {
  it('„Oprește botul" îl oprește pe loc, fără salvarea setărilor', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Oprește botul'));
    await waitFor(() => expect(api.pornesteBot).toHaveBeenCalledWith('tok', false));
    expect(api.salveazaConfigBot).not.toHaveBeenCalled();
  });

  it('„Pornește botul" apare când e oprit și îl pornește', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ config: configCu({ enabled: false }) }));
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Pornește botul' }));
    await waitFor(() => expect(api.pornesteBot).toHaveBeenCalledWith('tok', true));
  });

  it('editezi, oprești botul, apoi salvezi: setările pleacă cu botul oprit, nu-l repornesc', async () => {
    let pornit = true;
    api.incarcaSala.mockImplementation(async () => dateSala({ config: configCu({ enabled: pornit }) }));
    api.pornesteBot.mockImplementation(async (_t: string, p: boolean) => {
      pornit = p;
    });
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Locul'), { target: { value: 'Alt parc' } });
    fireEvent.click(buton('Oprește botul'));
    await screen.findByRole('button', { name: 'Pornește botul' });
    // Comutatorul nu e o modificare de formular; locul, da.
    expect(screen.getByText('Nesalvat')).toBeTruthy();
    fireEvent.click(buton('Salvează setările'));
    await waitFor(() =>
      expect(api.salveazaConfigBot).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ location: 'Alt parc', enabled: false })
      )
    );
  });

  it('doar comutatorul atins nu lasă formularul „nesalvat"', async () => {
    let pornit = true;
    api.incarcaSala.mockImplementation(async () => dateSala({ config: configCu({ enabled: pornit }) }));
    api.pornesteBot.mockImplementation(async (_t: string, p: boolean) => {
      pornit = p;
    });
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Locul'), { target: { value: 'Alt parc' } });
    fireEvent.change(screen.getByLabelText('Locul'), { target: { value: 'Parc' } });
    fireEvent.click(buton('Oprește botul'));
    await screen.findByRole('button', { name: 'Pornește botul' });
    expect(screen.queryByText('Nesalvat')).toBeNull();
    expect(garda?.()).toBe(true);
  });
});

describe('setările', () => {
  it('o oră golită blochează salvarea cu motivul ei', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Ora sondajului'), { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toContain('Ora sondajului trebuie scrisă ca 12:00.');
    expect(buton('Salvează setările').disabled).toBe(true);
  });

  it('închiderea paginii e oprită doar cât există modificări nesalvate', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    const inchide = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(inchide()).toBe(false);
    fireEvent.change(screen.getByLabelText('Titlu'), { target: { value: 'Alergăm!' } });
    expect(inchide()).toBe(true);
    fireEvent.click(buton('Renunță la modificări'));
    expect(inchide()).toBe(false);
  });

  it('butoanele rămân blocate până ajung datele de după salvare, iar formularul nu sare înapoi', async () => {
    let elibereaza: (d: ReturnType<typeof dateSala>) => void = () => {};
    api.incarcaSala.mockResolvedValueOnce(dateSala());
    api.incarcaSala.mockImplementationOnce(() => new Promise((r) => (elibereaza = r)));
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.change(screen.getByLabelText('Titlu'), { target: { value: 'Alergăm!' } });
    fireEvent.click(buton('Salvează setările'));
    await waitFor(() => expect(api.incarcaSala).toHaveBeenCalledTimes(2));
    // Reîncărcarea încă n-a venit: ecranul rămâne ocupat, cu textul nou în formular.
    expect(buton('Oprește botul').disabled).toBe(true);
    expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Alergăm!');
    elibereaza(dateSala({ config: configCu({ poll_title: 'Alergăm!' }) }));
    await waitFor(() => expect(buton('Oprește botul').disabled).toBe(false));
    expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Alergăm!');
    expect(screen.queryByText('Nesalvat')).toBeNull();
  });
});

describe('comenzile „acum"', () => {
  it('rezumatul pleacă fără confirmare (merge doar la admini)', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite rezumatul acum'));
    await waitFor(() => expect(api.trimiteComanda).toHaveBeenCalledWith('tok', 'send_summary'));
  });

  it('reminderul cere confirmare, iar „Nu trimite" nu cheamă serverul', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite reminderul acum'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Nu trimite' }));
    expect(api.trimiteComanda).not.toHaveBeenCalled();
    fireEvent.click(buton('Trimite reminderul acum'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Trimite' }));
    await waitFor(() => expect(api.trimiteComanda).toHaveBeenCalledWith('tok', 'send_reminder'));
  });

  it('cât o comandă așteaptă, butonul ei e blocat; celelalte nu', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({ comenzi: [comandaSala({ action: 'send_poll', status: 'pending', created_at: new Date().toISOString() })] })
    );
    randeaza();
    await screen.findByText('Textul sondajului');
    expect(buton('Sondajul e în așteptare…').disabled).toBe(true);
    expect(buton('Trimite reminderul acum').disabled).toBe(false);
  });

  it('dacă sondajul de mâine e deja în grup, confirmarea spune că pleacă unul nou', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite sondajul acum'));
    expect(screen.getByRole('alertdialog').textContent).toContain('e deja în grup');
  });

  it('fără sondaj plecat pentru mâine, confirmarea nu avertizează', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        antrenamente: [
          { id: 's2', session_date: '2026-10-08', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
        ],
      })
    );
    randeaza();
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite sondajul acum'));
    expect(screen.getByRole('alertdialog').textContent).not.toContain('deja în grup');
  });

  it('cu mâine anulat, refuzul serverului e spus în cuvinte', async () => {
    const toast = vi.fn();
    api.incarcaSala.mockResolvedValue(dateSala());
    api.trimiteComanda.mockRejectedValue(new Error('antrenament_anulat'));
    randeaza(toast);
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite reminderul acum'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Trimite' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ kind: 'error', msg: expect.stringContaining('de mâine e anulat') })
    );
    expect(monitorizare.logClientError).not.toHaveBeenCalled();
  });
});

describe('erorile la scriere', () => {
  it('o eroare de rețea spune să verifici înainte să reîncerci și ajunge în monitorizare', async () => {
    const toast = vi.fn();
    api.incarcaSala.mockResolvedValue(dateSala());
    api.trimiteComanda.mockRejectedValue(new TypeError('Failed to fetch'));
    randeaza(toast);
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite rezumatul acum'));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ kind: 'error', msg: expect.stringContaining('Nu știm dacă a ajuns') })
    );
    expect(monitorizare.logClientError).toHaveBeenCalledWith('sala-scriere', expect.any(TypeError));
  });

  it('o eroare pe care serverul n-o numește: mesajul generic, plus monitorizare', async () => {
    const toast = vi.fn();
    api.incarcaSala.mockResolvedValue(dateSala());
    api.trimiteComanda.mockRejectedValue(new Error('ceva neașteptat'));
    randeaza(toast);
    await screen.findByText('Textul sondajului');
    fireEvent.click(buton('Trimite rezumatul acum'));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ kind: 'error', msg: 'Nu s-a putut salva. Încearcă din nou.' })
    );
    expect(monitorizare.logClientError).toHaveBeenCalledTimes(1);
  });
});
