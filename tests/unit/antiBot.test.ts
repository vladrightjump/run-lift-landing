// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Stratul anti-bot al formularelor publice: honeypot + timp pe formular + token
 * Turnstile. Toate trei sunt verificate PE SERVER (`submit-form`); aici testăm
 * doar că sunt colectate corect și că nu se pierd între submit-uri.
 */

const getTurnstileToken = vi.fn(async () => 'tok-proaspat');
const isTurnstileError = vi.fn((err: unknown) => (err as Error)?.name === 'TurnstileError');

vi.mock('../../src/lib/turnstile', () => ({
  getTurnstileToken: () => getTurnstileToken(),
  isTurnstileError: (err: unknown) => isTurnstileError(err),
}));

const { useAntiBot, antiBotErrorMessage, ANTIBOT_MESSAGES, HONEYPOT_NAME } = await import(
  '../../src/lib/antiBot'
);

beforeEach(() => {
  getTurnstileToken.mockClear();
  getTurnstileToken.mockResolvedValue('tok-proaspat');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAntiBot — colectarea dovezilor', () => {
  it('cere un token PROASPĂT la fiecare submit, nu unul de la montare', async () => {
    // Token-urile Turnstile sunt de unică folosință și expiră în ~5 minute; unul
    // luat la montare ar fi mort pentru cineva care completează pe îndelete.
    const { result } = renderHook(() => useAntiBot());
    expect(getTurnstileToken).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.collect();
    });
    expect(getTurnstileToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.collect();
    });
    expect(getTurnstileToken).toHaveBeenCalledTimes(2);
  });

  it('raportează timpul scurs de la afișarea formularului', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAntiBot());
    vi.advanceTimersByTime(7_000);

    let proofs!: Awaited<ReturnType<typeof result.current.collect>>;
    await act(async () => {
      proofs = await result.current.collect();
    });
    expect(proofs.elapsed).toBeGreaterThanOrEqual(7_000);
    expect(proofs.token).toBe('tok-proaspat');
    expect(proofs.hp).toBe('');
  });

  it('duce mai departe conținutul capcanei, ca serverul să poată respinge', async () => {
    const { result } = renderHook(() => useAntiBot());
    act(() => {
      result.current.hpProps.onChange({ target: { value: 'http://spam.example' } });
    });

    let proofs!: Awaited<ReturnType<typeof result.current.collect>>;
    await act(async () => {
      proofs = await result.current.collect();
    });
    expect(proofs.hp).toBe('http://spam.example');
  });

  it('restart() repornește cronometrul și golește capcana', async () => {
    // „Înscrie altă persoană" reafișează formularul fără remount: fără restart,
    // a doua înscriere ar părea instantanee doar fiindcă prima a durat.
    vi.useFakeTimers();
    const { result } = renderHook(() => useAntiBot());
    act(() => {
      result.current.hpProps.onChange({ target: { value: 'ceva' } });
    });
    vi.advanceTimersByTime(60_000);

    act(() => {
      result.current.restart();
    });
    vi.advanceTimersByTime(4_000);

    let proofs!: Awaited<ReturnType<typeof result.current.collect>>;
    await act(async () => {
      proofs = await result.current.collect();
    });
    expect(proofs.hp).toBe('');
    expect(proofs.elapsed).toBeLessThan(10_000);
  });

  it('propagă eroarea Turnstile în loc să trimită un token gol', async () => {
    // Un token gol ar fi respins de server ca „missing_token" și utilizatorul ar
    // vedea o eroare generică; aruncând, hook-ul poate da mesajul corect.
    const err = Object.assign(new Error('blocat'), { name: 'TurnstileError' });
    getTurnstileToken.mockRejectedValueOnce(err);
    const { result } = renderHook(() => useAntiBot());
    await expect(result.current.collect()).rejects.toBe(err);
  });
});

describe('câmpul-capcană (honeypot)', () => {
  it('e invizibil și ignorat de tastatură, autocomplete și cititoarele de ecran', () => {
    const { result } = renderHook(() => useAntiBot());
    const { hpProps } = result.current;
    expect(hpProps.name).toBe(HONEYPOT_NAME);
    expect(hpProps.tabIndex).toBe(-1);
    expect(hpProps.autoComplete).toBe('off');
    expect(hpProps['aria-hidden']).toBe(true);
    expect(hpProps.style.position).toBe('absolute');
    expect(hpProps.style.pointerEvents).toBe('none');
  });
});

describe('antiBotErrorMessage', () => {
  it('distinge „scriptul nu s-a încărcat" de „verificarea nu a trecut"', () => {
    // Mesaje diferite pentru cauze diferite: la adblocker omul are ce face,
    // la challenge picat nu.
    const blocat = Object.assign(new Error('api.js'), { name: 'TurnstileError' });
    expect(antiBotErrorMessage(blocat)).toBe(ANTIBOT_MESSAGES.captchaBlocked);
    expect(antiBotErrorMessage(new Error('altceva'))).toBe(ANTIBOT_MESSAGES.captcha);
  });
});
