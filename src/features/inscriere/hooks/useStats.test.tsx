import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useStats } from './useStats';
import { raspunde } from '../../../../tests/support/linkEmail';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !check(); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  expect(check()).toBe(true);
};

it('statisticile înlocuiesc o cerere lentă la fiecare 15 secunde și la revenirea în tab', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requests = raspunde('public_stats', { asteapta: pending });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const view = renderHook(() => useStats());
  try {
    expect(view.result.current.stats).toBeNull();
    await until(() => requests.numar === 1);
    act(() => { vi.advanceTimersByTime(15_000); });
    await until(() => requests.numar === 2);
    expect(requests.semnale[0].aborted).toBe(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await until(() => requests.numar === 3);
    expect(requests.semnale[1].aborted).toBe(true);
    view.unmount();
    await until(() => requests.semnale[2].aborted);
  } finally { release(); view.unmount(); }
});
