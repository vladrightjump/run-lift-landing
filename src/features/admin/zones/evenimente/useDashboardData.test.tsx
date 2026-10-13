import type { ReactNode } from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { adminApiMock } from '../../../../../tests/support/adminHarness';
import { participant, logEntry } from '../../../../../tests/support/builders/registrations';
import { deferred } from '../../../../../tests/support/deferred';
import type { AdminRegistration, AdminWaitlistEntry, AdminEmailLogEntry } from './api';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { useDashboardData } from './useDashboardData';

const api = vi.hoisted(() => ({ current: null as ReturnType<typeof adminApiMock> | null }));
vi.mock('./api', async original => {
  const actual = await original<Record<string, unknown>>();
  const { adminApiMock: build } = await import('../../../../../tests/support/adminHarness');
  api.current = build(vi);
  return { ...actual, ...api.current };
});

it('o arhivă în așteptare sau eșuată păstrează semnalele bune ale ediției curente', async () => {
  const arhiva = deferred<AdminRegistration[]>();
  const asteptare = deferred<AdminWaitlistEntry[]>();
  const email = deferred<AdminEmailLogEntry[]>();
  let citiriCurente = 0;
  api.current!.listRegistrations.mockImplementation(async (_token, editie) => editie === 7
    ? [participant({ id: 'r1', nume: 'Ana', email: 'ana@exemplu.ro' })] : arhiva.promise);
  api.current!.listWaitlist.mockImplementation(async (_token, editie) => {
    if (editie !== 7) return [];
    return citiriCurente++ === 0
      ? [{ id: 'w1', nume: 'Ion', email: 'ion@exemplu.ro', telefon: '069000000', editie: 7, created_at: '2026-10-13T09:00:00Z' }]
      : asteptare.promise;
  });
  let jurnaleCurente = 0;
  api.current!.listEmailLog.mockImplementation(async (_token, editie) => {
    if (editie !== 7) return [];
    return jurnaleCurente++ === 0
      ? [logEntry({ id: 'e1', email: 'ana@exemplu.ro', subiect: 'Reminder', status: 'esuat' })]
      : email.promise;
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={() => {}}>{children}</FurnizorSesiuneAdmin>;
  const { result, rerender } = renderHook(editie => useDashboardData(editie, 7, 'participanti'), { initialProps: 7, wrapper });
  await waitFor(() => expect(result.current.semnaleEditieCurenta).toEqual({ asteptare: 1, nelivrate: 1 }));
  rerender(6);
  await waitFor(() => expect(citiriCurente).toBe(2));
  expect(result.current.rows).toBeNull();
  expect(result.current.semnaleEditieCurenta).toEqual({ asteptare: 1, nelivrate: 1 });
  await act(async () => {
    arhiva.reject(new Error('indisponibil'));
    asteptare.reject(new Error('indisponibil'));
    email.reject(new Error('indisponibil'));
  });
  await waitFor(() => expect(result.current.loadError).toBe(true));
  expect(result.current.rows).toBeNull();
  expect(result.current.semnaleEditieCurenta).toEqual({ asteptare: 1, nelivrate: 1 });
  api.current!.listWaitlist.mockResolvedValue([]);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(result.current.semnaleEditieCurenta).toEqual({ asteptare: 0, nelivrate: 1 }));
  api.current!.listEmailLog.mockResolvedValue([]);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(result.current.semnaleEditieCurenta).toEqual({ asteptare: 0, nelivrate: 0 }));
});
