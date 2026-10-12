import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LandingPage } from './LandingPage';
import { ComingSoon } from '../components/ComingSoon';
import { EventConfigProvider } from '../../../shared/lib/useEventConfig';
import { SNAPSHOT_CONFIG } from '../../../shared/content/eventConfig';
import { deriveEditionDates } from '../../../shared/lib/config';
import { formResponse } from '../../../../tests/support/publicForms';

beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const page = (preview?: string) => {
  window.history.replaceState(null, '', preview ? '/?preview=' + preview : '/');
  return render(<EventConfigProvider override={{ ...SNAPSHOT_CONFIG, showComingSoon: true }}><LandingPage /></EventConfigProvider>);
};

describe('fazele homepage-ului', () => {
  it('Coming Soon comută singur la landing după lansare', () => {
    const launch = deriveEditionDates(SNAPSHOT_CONFIG).LAUNCH_DATE.getTime();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(launch - 1000);
    page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/ComingSoon/);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/HyroxTrial/i);
  });

  it('leaderboard ascunde toate căile de înscriere și pune participanții primii', () => {
    page('leaderboard');
    expect(screen.queryByRole('button', { name: /Trimite înscrierea/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Înscrie-te/ })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 })[0].textContent).toBe('Cine vine');
  });

  it('next arată ecranul următorului antrenament', () => {
    page('next');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ne vedemcurând');
    expect(screen.getByRole('button', { name: /Anunță-mă/ })).toBeDefined();
  });
});

describe('formularul Coming Soon', () => {
  it('validarea goală rămâne lângă câmpuri fără să trimită', async () => {
    const requests = formResponse();
    const toast = vi.fn();
    render(<ComingSoon showToast={toast} />);
    fireEvent.click(screen.getByRole('button', { name: /Anunță-mă/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Anunță-mă$/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(requests.count).toBe(0);
    expect((screen.getByLabelText('Nume') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
  });

  it('emailul invalid rămâne pe formular fără comandă', async () => {
    const requests = formResponse();
    const toast = vi.fn();
    render(<ComingSoon showToast={toast} />);
    fireEvent.click(screen.getByRole('button', { name: /Anunță-mă/ }));
    for (const [label, value] of Object.entries({ Nume: 'Popescu', Prenume: 'Ana', Email: 'invalid', Telefon: '069123456' })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /^Anunță-mă$/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(requests.count).toBe(0);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('duplicatul afișează succesul existent', async () => {
    formResponse({ status: 409, text: 'duplicate' });
    render(<ComingSoon showToast={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Anunță-mă/ }));
    for (const [label, value] of Object.entries({ Nume: 'Popescu', Prenume: 'Ana', Email: 'ana@example.com', Telefon: '069123456' })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /^Anunță-mă$/ }));
    await screen.findByRole('heading', { name: /Ești deja pe listă/ });
  });

  it('eroarea de server păstrează formularul și anunță vizitatorul', async () => {
    formResponse({ status: 500, text: 'failed' });
    const toast = vi.fn();
    render(<ComingSoon showToast={toast} />);
    fireEvent.click(screen.getByRole('button', { name: /Anunță-mă/ }));
    for (const [label, value] of Object.entries({ Nume: 'Popescu', Prenume: 'Ana', Email: 'ana@example.com', Telefon: '069123456' })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /^Anunță-mă$/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', expect.stringMatching(/nu am putut trimite/i)));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ana@example.com');
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('Esc închide formularul', () => {
    render(<ComingSoon showToast={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Anunță-mă/ }));
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
