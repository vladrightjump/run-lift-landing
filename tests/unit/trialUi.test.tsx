import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TrialTraining } from '../../src/components/TrialTraining';
import { trialLink } from '../../src/lib/trialPublic';
import { EcranProbe } from '../../src/admin/sala/EcranProbe';
import { TrialSettings } from '../../src/admin/sala/TrialSettings';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import type { TrialData } from '../../src/lib/trialApi';

const api = vi.hoisted(() => ({ loadTrials: vi.fn(), saveTrialConfig: vi.fn(), trialAttendance: vi.fn(), trialReply: vi.fn(), retryTrialMessage: vi.fn() }));
vi.mock('../../src/lib/trialApi', () => api);
const toast = vi.fn();
const fixture = (): TrialData => ({
  config: { enabled: false, bot_username: 'ParkTrialBot', welcome_text: 'Bine ai venit', trial_conditions: 'Vino la timp', trial_price: '100 MDL', bring_text: 'Apă', continuation_conditions: 'Abonament', duration_minutes: 60, organizer_telegram_id: 123, contact_text: 'Scrie-ne', permissions_verified_at: null },
  prospects: [{ id: 'p1', telegram_user_id: 456, telegram_username: 'ana', full_name: 'Ana Rusu', source: 'home', stage: 'awaiting_attendance', dm_enabled: true }],
  bookings: [{ id: 'b1', prospect_id: 'p1', status: 'awaiting_attendance', version: 1, session_start: '2026-10-08T03:30:00Z', session_location: 'Parc', attendance_at: null, continuation: null }],
  questions: [{ id: 'q1', prospect_id: 'p1', body: 'Ce aduc?', response: null, status: 'open' }],
  messages: [{ id: 'm1', prospect_id: 'p1', kind: 'reminder', status: 'ambiguous', result: 'Timeout', created_at: '2026-10-08T02:00:00Z' }],
  organizers: [{ id: 'a1', full_name: 'Vlad', telegram_user_id: 123 }],
});
const admin = (child: React.ReactNode) => render(<FurnizorSesiuneAdmin token="token" onAuthError={() => false} showToast={toast}>{child}</FurnizorSesiuneAdmin>);
beforeEach(() => { Object.values(api).forEach(f => f.mockReset()); api.loadTrials.mockResolvedValue(fixture()); toast.mockReset(); });
afterEach(cleanup);

describe('intrarea la proba', () => {
  it('trimite spre bot, nu spre un grup, si explica Start', () => {
    render(<TrialTraining config={{ enabled: true, bot_username: 'ParkTrialBot', contact_text: '' }} />);
    expect(screen.getByRole('link', { name: /Vreau la un antrenament/ }).getAttribute('href')).toBe('https://t.me/ParkTrialBot?start=trial_home');
    expect(screen.getByText(/Apasă Start/)).toBeDefined();
  });
  it('nu publica CTA dezactivat sau username invalid', () => {
    const { rerender } = render(<TrialTraining config={{ enabled: false, bot_username: 'ParkTrialBot', contact_text: '' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<TrialTraining config={{ enabled: true, bot_username: 'https://evil.test', contact_text: '' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(trialLink('@ParkTrialBot', 'share')).toBe('https://t.me/ParkTrialBot?start=trial_share');
  });
});

describe('persoane noi', () => {
  it('cere confirmare inainte sa marcheze prezenta si pastreaza eroarea', async () => {
    api.trialAttendance.mockRejectedValue(new Error('offline'));
    admin(<EcranProbe />);
    fireEvent.click(await screen.findByRole('button', { name: /Ana Rusu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A venit' }));
    expect(api.trialAttendance).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmă' }));
    await waitFor(() => expect(api.trialAttendance).toHaveBeenCalledWith('token', 'b1', true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })));
    expect(screen.getByRole('alertdialog')).toBeDefined();
  });
  it('previzualizeaza raspunsul si avertizeaza despre retry ambiguu', async () => {
    admin(<EcranProbe />);
    fireEvent.click(await screen.findByRole('button', { name: /Ana Rusu/ }));
    fireEvent.change(screen.getByLabelText('Răspuns pentru Ana Rusu'), { target: { value: 'Apă și prosop.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Previzualizează răspunsul' }));
    expect(within(screen.getByRole('alertdialog')).getByText('Apă și prosop.')).toBeDefined();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmă' }));
    await waitFor(() => expect(api.trialReply).toHaveBeenCalledWith('token', 'q1', 'Apă și prosop.'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reîncearcă mesajul' }));
    expect(screen.getByText(/Mesajul poate să fi ajuns deja/)).toBeDefined();
    expect(api.retryTrialMessage).not.toHaveBeenCalled();
  });
  it('nu permite activarea inainte de verificarea botului dar salveaza ciorna', async () => {
    admin(<TrialSettings />);
    const toggle = await screen.findByRole('checkbox');
    expect((toggle as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Costul probei'), { target: { value: '150 MDL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează setările probei' }));
    await waitFor(() => expect(api.saveTrialConfig).toHaveBeenCalledWith('token', expect.objectContaining({ enabled: false, trial_price: '150 MDL' })));
  });
});
