// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Rădăcina temei „Panoul" (U1, KTD2): login-ul și dashboard-ul stau sub
 * `.admin-app`, iar `<html>` poartă `admin-pagina` doar cât e montat adminul.
 */

vi.mock('../../src/lib/adminApi', () => ({
  getStoredToken: () => null,
  storeToken: vi.fn(),
  clearStoredToken: vi.fn(),
  checkToken: vi.fn(),
  adminLogout: vi.fn(() => Promise.resolve()),
  adminLogin: vi.fn(),
}));

afterEach(cleanup);

describe('rădăcina adminului', () => {
  it('randează login-ul sub rădăcina temei', async () => {
    const { AdminApp } = await import('../../src/admin/AdminApp');
    const { container } = render(<AdminApp />);
    const radacina = container.querySelector('.admin-app');
    expect(radacina).not.toBeNull();
    expect(radacina?.contains(screen.getByRole('button', { name: /intră|autentific|login/i }))).toBe(true);
  });

  it('pune clasa paginii pe <html> și o scoate la demontare', async () => {
    const { RadacinaAdmin } = await import('../../src/admin/AdminApp');
    const { unmount } = render(<RadacinaAdmin>conținut</RadacinaAdmin>);
    expect(document.documentElement.classList.contains('admin-pagina')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('admin-pagina')).toBe(false);
  });
});
