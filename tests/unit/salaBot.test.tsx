import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranBot } from '../../src/admin/sala/EcranBot';
import { comandaSala, dateSala } from './helpers/salaFixtures';

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
const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={vi.fn()}>
      <EcranBot inregistreazaGardaIesire={(g) => (garda = g)} />
    </FurnizorSesiuneAdmin>
  );

const mesaj = () => document.querySelector('.admin-sala-telegram')?.textContent ?? '';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.salveazaConfigBot.mockResolvedValue(undefined);
  api.pornesteBot.mockResolvedValue(undefined);
  api.trimiteComanda.mockResolvedValue('id');
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
