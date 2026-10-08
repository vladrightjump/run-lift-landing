import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranAcum } from '../../src/admin/EcranAcum';
import { citesteFiltruUrmatorul } from '../../src/admin/sala/filtruUrmatorul';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../src/content/eventConfig';
import { dateSala } from './helpers/salaFixtures';
import type { SemnaleAdmin } from '../../src/admin/stareCurenta';

/**
 * Ecranul Acum (U8): săptămâna, „De rezolvat", antrenamentul și ediția, pe
 * datele existente (R8–R11, R35, R37; F1).
 */

const api = vi.hoisted(() => ({ incarcaSala: vi.fn(), trimiteComanda: vi.fn(), marcheazaComandaVerificata: vi.fn() }));
vi.mock('../../src/lib/salaApi', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/salaApi')>()),
  ...api,
}));

const config: EventConfig = {
  ...SNAPSHOT_CONFIG,
  number: 8,
  eventName: 'Hyrox Trial',
  tz: '+03:00',
  launchAt: '2026-09-20T12:00:00',
  registrationDeadline: '2026-10-09T18:00:00',
  start: '2026-10-10T07:00:00',
  durationHours: 1,
  nextEditionAt: '2026-10-17T07:00:00',
  slots: { ...SNAPSHOT_CONFIG.slots, total: 30 },
};

const SEMNALE: SemnaleAdmin = { nelivrate: 1, asteptare: 0, ciornaNepublicata: false, metaInUrma: false, arhiva: false };

const showToast = vi.fn();
const randeaza = (over: Partial<Parameters<typeof EcranAcum>[0]> = {}) => {
  const onEcran = vi.fn();
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={showToast}>
      <EcranAcum
        semnale={SEMNALE}
        faza="landing"
        config={config}
        inscrisi={22}
        asteptare={4}
        onEcran={onEcran}
        onEditieNoua={vi.fn()}
        {...over}
      />
    </FurnizorSesiuneAdmin>
  );
  return { onEcran };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T17:15:00Z')); // miercuri, 20:15 la Chișinău
  Object.values(api).forEach((f) => f.mockReset());
  api.incarcaSala.mockResolvedValue(dateSala());
  api.trimiteComanda.mockResolvedValue('ok');
  showToast.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('Acum pe desktop', () => {
  it('arată săptămâna de luni până duminică, cu azi marcat', async () => {
    randeaza();
    expect(await screen.findByRole('heading', { name: 'Săptămâna 41' })).toBeDefined();
    expect(screen.getByText('5–11 octombrie')).toBeDefined();
    expect(screen.getByText('azi')).toBeDefined();
  });

  it('pune antrenamentul de joi și cursa de sâmbătă pe zilele lor', async () => {
    randeaza();
    expect(await screen.findByRole('button', { name: /Antrenament 06:30.*1 vine · 2 fără răspuns/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Hyrox Trial · Ed\. 8.*22\/30 · start 07:00/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Se închid înscrierile.*18:00 · Ediția 8/ })).toBeDefined();
  });

  it('o atingere pe cursă duce la Participanți', async () => {
    const { onEcran } = randeaza();
    fireEvent.click(await screen.findByRole('button', { name: /Hyrox Trial · Ed\. 8/ }));
    expect(onEcran).toHaveBeenCalledWith('participanti');
  });

  it('„De rezolvat" are numărul și acțiunea fiecărui rând', async () => {
    const { onEcran } = randeaza();
    const bloc = screen.getByRole('heading', { name: /De rezolvat/ }).parentElement as HTMLElement;
    expect(within(bloc).getByText('1 email nelivrat')).toBeDefined();
    fireEvent.click(within(bloc).getByRole('button', { name: 'Vezi' }));
    expect(onEcran).toHaveBeenCalledWith('livrare');
  });

  it('fără nimic de rezolvat, spune asta explicit (R35)', async () => {
    randeaza({ semnale: { ...SEMNALE, nelivrate: 0 } });
    await screen.findByRole('button', { name: /Antrenament 06:30/ });
    expect(screen.getByText('Nimic de rezolvat acum.')).toBeDefined();
  });

  it('Covers F1: „fără răspuns" duce la Următorul, filtrat (R10)', async () => {
    const { onEcran } = randeaza();
    const card = (await screen.findByRole('heading', { name: /după sondaj/ })).parentElement as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^2\s*fără răspuns$/ }));
    expect(onEcran).toHaveBeenCalledWith('grup-prezente');
    expect(citesteFiltruUrmatorul()).toBe('fara');
  });

  it('cât timp datele grupului nu sosesc, cardul antrenamentului e schelet, nu zero', () => {
    api.incarcaSala.mockReturnValue(new Promise(() => {}));
    randeaza();
    expect(screen.getByLabelText('Antrenamentul următor').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('0')).toBeNull();
  });

  it('dacă datele grupului nu se pot încărca, cardul spune asta în loc de un schelet fără sfârșit', async () => {
    api.incarcaSala.mockRejectedValue(new Error('rețea'));
    randeaza();
    expect(await screen.findByText(/Nu s-au putut încărca datele grupului/)).toBeDefined();
  });

  it('Covers R37: înainte de sondaj, cardul spune când pleacă și nu numără pe nimeni', async () => {
    vi.setSystemTime(new Date('2026-10-07T06:00:00Z')); // 09:00, sondajul pleacă la 12:00
    api.incarcaSala.mockResolvedValue(
      dateSala({
        antrenamente: [
          { id: 's2', session_date: '2026-10-08', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
        ],
        raspunsuri: [],
      })
    );
    randeaza();
    expect(await screen.findByText('Sondajul pleacă miercuri la 12:00.')).toBeDefined();
    expect(screen.queryByText(/fără răspuns/)).toBeNull();
  });

  it('o comandă eșuată azi se reia din „De rezolvat"', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        comenzi: [
          { id: 'c1', action: 'send_summary', member_id: null, status: 'failed', result: 'Telegram n-a răspuns', created_at: '2026-10-07T03:00:00Z', processed_at: '2026-10-07T03:00:30Z' },
        ],
      })
    );
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Reîncearcă' }));
    await waitFor(() => expect(api.trimiteComanda).toHaveBeenCalledWith('tok', 'send_summary'));
  });

  it('marchează avertizarea fără a retrimite comanda și o ascunde după reîncărcare', async () => {
    const esec = { id: 'c1', action: 'kick_member' as const, member_id: 'ion', status: 'failed' as const, result: 'Blocat', created_at: '2026-10-07T03:00:00Z', processed_at: null };
    api.incarcaSala.mockResolvedValue(dateSala({ comenzi: [esec] }));
    randeaza();
    const buton = await screen.findByRole('button', { name: 'Marchează ca verificat' });
    api.incarcaSala.mockResolvedValue(dateSala({ comenzi: [{ ...esec, reviewed_at: '2026-10-07T04:00:00Z' }] }));
    fireEvent.click(buton);
    await waitFor(() => expect(api.marcheazaComandaVerificata).toHaveBeenCalledWith('tok', 'c1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marchează ca verificat' })).toBeNull());
    expect(api.trimiteComanda).not.toHaveBeenCalled();
  });

  it('păstrează avertizarea dacă marcarea eșuează', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ comenzi: [{ id: 'c1', action: 'kick_member', member_id: 'ion', status: 'failed', result: 'Blocat', created_at: '2026-10-07T03:00:00Z', processed_at: null }] }));
    api.marcheazaComandaVerificata.mockRejectedValue(new Error('request failed'));
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Marchează ca verificat' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })));
    expect(screen.getByRole('button', { name: 'Marchează ca verificat' })).toBeTruthy();
    expect(api.trimiteComanda).not.toHaveBeenCalled();
  });

  it('o reluare pending blochează retrimiterea, inclusiv după reîncărcarea paginii', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ comenzi: [
      { id: 'c1', action: 'send_summary', member_id: null, status: 'failed', result: 'Rețea', created_at: '2026-10-07T17:13:00Z', processed_at: null },
      { id: 'c2', action: 'send_summary', member_id: null, status: 'pending', result: null, created_at: '2026-10-07T17:14:00Z', processed_at: null },
    ] }));
    randeaza();
    const buton = await screen.findByRole('button', { name: 'Se reia…' });
    expect((buton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(buton);
    expect(api.trimiteComanda).not.toHaveBeenCalled();
  });

  it('mesajele personalizate eșuate deschid editorul fără RPC de retrimitere gol', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ comenzi: [
      { id: 'c1', action: 'send_message', member_id: null, status: 'failed', result: 'Rețea', created_at: '2026-10-07T17:13:00Z', processed_at: null },
    ] }));
    const { onEcran } = randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Deschide mesajele' }));
    expect(onEcran).toHaveBeenCalledWith('grup-bot');
    expect(api.trimiteComanda).not.toHaveBeenCalled();
  });

  it('cardul ediției arată ocuparea și reperul următor', async () => {
    randeaza();
    expect(screen.getByRole('img', { name: '22 din 30 locuri ocupate' })).toBeDefined();
    expect(screen.getByText(/22 din 30 înscriși · 4 în așteptare/)).toBeDefined();
    expect(screen.getByText(/Se închid înscrierile vineri/)).toBeDefined();
  });
});
