// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLaunchForm } from './useLaunchForm';
import type { LaunchOutcome } from './useLaunchForm';
import { onlineManager } from '@tanstack/react-query';
import { formResponse } from '../../../../tests/support/publicForms';

const VALID = { nume: 'Popescu', prenume: 'Andrei', email: 'a@b.ro', telefon: '069123456' } as const;

type Hook = { current: ReturnType<typeof useLaunchForm> };

const fillValid = (r: Hook) => {
  act(() => {
    (Object.keys(VALID) as Array<keyof typeof VALID>).forEach((k) => r.current.setField(k, VALID[k]));
  });
};

const submitOnce = async (r: Hook): Promise<LaunchOutcome> => {
  let outcome: LaunchOutcome | undefined;
  await act(async () => {
    outcome = await r.current.submit();
  });
  return outcome as LaunchOutcome;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLaunchForm', () => {
  it('draft invalid → outcome „invalid", fără fetch', async () => {
    const requests = formResponse();
    const { result } = renderHook(() => useLaunchForm());
    const outcome = await submitOnce(result);
    expect(outcome.kind).toBe('invalid');
    expect(requests.count).toBe(0);
  });

  it('draft valid → outcome „success" și state „success"', async () => {
    formResponse({ status: 201 });
    const { result } = renderHook(() => useLaunchForm());
    fillValid(result);
    const outcome = await submitOnce(result);
    expect(outcome).toMatchObject({ kind: 'success', duplicate: false, email: VALID.email });
    expect(result.current.state).toBe('success');
  });

  it('HTTP 409 (email deja înscris) → success cu duplicate=true', async () => {
    formResponse({ status: 409, text: 'duplicate' });
    const { result } = renderHook(() => useLaunchForm('despre-noi'));
    fillValid(result);
    const outcome = await submitOnce(result);
    expect(outcome).toMatchObject({ kind: 'success', duplicate: true });
  });

  it('navigator.onLine=false (fals-offline) NU blochează — încearcă submit-ul', async () => {
    // Regresie: pe unele rețele/VPN `navigator.onLine` e fals `false`. Formularul nu
    // trebuie să refuze preemptiv, ci să încerce trimiterea (ca la înscriere).
    const requests = formResponse({ status: 201 });
    onlineManager.setOnline(false);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      const { result } = renderHook(() => useLaunchForm());
      fillValid(result);
      const outcome = await submitOnce(result);
      expect(outcome.kind).toBe('success');
      expect(requests.count).toBe(1);
    } finally {
      onlineManager.setOnline(true);
      delete (navigator as { onLine?: boolean }).onLine;
    }
  });
});

describe('useLaunchForm — stratul anti-bot', () => {
  it('trimite dovezile anti-bot în plicul către submit-form', async () => {
    const requests = formResponse();
    const { result } = renderHook(() => useLaunchForm());
    fillValid(result);
    await submitOnce(result);

    const plic = requests.bodies[0];
    expect(plic).toMatchObject({ mode: 'launch', hp: '' });
    expect(typeof plic.elapsed).toBe('number');
  });

  it('serverul respinge ca bot → mesaj despre verificare, nu despre conexiune', async () => {
    // „Verifică conexiunea" ar trimite omul pe o pistă greșită.
    formResponse({ status: 403, text: '{"error":"captcha_failed"}' });
    const { result } = renderHook(() => useLaunchForm());
    fillValid(result);
    const outcome = await submitOnce(result);
    expect(outcome.kind).toBe('error');
    expect((outcome as { message: string }).message).toMatch(/anti-bot/i);
    expect(result.current.state).toBe('form');
  });

  it('expune câmpul-capcană formularului', async () => {
    const { result } = renderHook(() => useLaunchForm());
    expect(result.current.hpProps.name).toBe('website');
    expect(result.current.hpProps.tabIndex).toBe(-1);
  });
});
