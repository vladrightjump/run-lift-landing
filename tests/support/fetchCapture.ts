import { vi } from 'vitest';

/** Preserve raw fetch arguments for RequestInit/header/signal characterizations. */
export const createFetchCapture = (implementation?: (...args: Parameters<typeof fetch>) => Promise<Response>) => {
  const capture = vi.fn(implementation);
  vi.stubGlobal('fetch', capture);
  return capture;
};
