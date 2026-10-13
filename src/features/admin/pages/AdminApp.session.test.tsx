import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { AdminApp } from './AdminApp';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';

const TOKEN_KEY = 'runlift_admin_token';
afterEach(() => localStorage.removeItem(TOKEN_KEY));

it('verifică tokenul salvat o dată și deschide Acum', async () => {
  localStorage.setItem(TOKEN_KEY, 'token-salvat');
  const verifica = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({ p_token: 'token-salvat' });
    return HttpResponse.json(true);
  });
  server.use(rpcHandler('admin_check_token', verifica));
  render(<AdminApp />);
  await screen.findByRole('heading', { name: 'Acum', level: 1 });
  expect(verifica).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(TOKEN_KEY)).toBe('token-salvat');
});

it('un token refuzat este șters înainte de afișarea autentificării', async () => {
  localStorage.setItem(TOKEN_KEY, 'token-salvat');
  server.use(rpcHandler('admin_check_token', () => HttpResponse.json(false)));
  render(<AdminApp />);
  await screen.findByRole('button', { name: 'Intră în cont' });
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
});

it('o verificare indisponibilă cere autentificarea și păstrează tokenul', async () => {
  localStorage.setItem(TOKEN_KEY, 'token-salvat');
  server.use(rpcHandler('admin_check_token', () => HttpResponse.text('indisponibil', { status: 500 })));
  render(<AdminApp />);
  await screen.findByRole('button', { name: 'Intră în cont' });
  expect(localStorage.getItem(TOKEN_KEY)).toBe('token-salvat');
});

it('un corp RPC gol păstrează refuzul falsy al verificării vechi', async () => {
  localStorage.setItem(TOKEN_KEY, 'token-salvat');
  server.use(rpcHandler('admin_check_token', () => new HttpResponse('', { status: 200 })));
  render(<AdminApp />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Intră în cont' })).toBeDefined());
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
});
