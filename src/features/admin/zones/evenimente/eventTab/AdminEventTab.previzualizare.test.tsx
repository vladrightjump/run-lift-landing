import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { rand, baraActiuni, problemaDinBara, randeaza, deschideCiorna, camp, listEventConfig, saveEventConfigDraft } from './test-support';

describe('previzualizarea arată ce e pe ecran', () => {
  const refuz = problemaDinBara;

  /** `window.open` care întoarce o fereastră falsă, ca s-o putem interoga. */
  const fereastraFalsa = () => {
    const fereastra = { location: { href: '' }, close: vi.fn() };
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue(fereastra as unknown as Window);
    return { fereastra, open };
  };

  it('cu diferențe nesalvate, salvează documentul de pe ecran înainte să deschidă', async () => {
    const { fereastra } = fereastraFalsa();
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Ediție de test' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvează și previzualizează/ }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(saveEventConfigDraft.mock.calls[0][2].eventName).toBe('Ediție de test');
    await waitFor(() => expect(fereastra.location.href).toBe('/?config=draft'));
  });

  it('o salvare refuzată nu deschide nimic și spune care pas a picat', async () => {
    const { fereastra } = fereastraFalsa();
    saveEventConfigDraft.mockRejectedValue(new Error('config_invalid: ceva'));
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Ediție de test' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvează și previzualizează/ }));

    await waitFor(() => expect(fereastra.close).toHaveBeenCalled());
    expect(fereastra.location.href).toBe('');
    await waitFor(() => expect(refuz()).toContain('Salvarea'));
  });

  it('fără diferențe, previzualizarea rămâne un link care nu scrie nimic', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    const link = screen.getByRole('link', { name: 'Previzualizează' });
    expect(link.getAttribute('href')).toBe('/?config=draft');
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('un config invalid face previzualizarea inertă, ca „Publică"', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: '' } });

    const buton = screen.getByRole('button', {
      name: /Salvează și previzualizează/,
    }) as HTMLButtonElement;
    expect(buton.disabled).toBe(true);
  });

  it('după previzualizare, ciorna nu mai e „Nesalvat"', async () => {
    fereastraFalsa();
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Ediție de test' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvează și previzualizează/ }));

    await waitFor(() =>
      expect(baraActiuni().textContent).not.toContain('Nesalvat')
    );
  });
});
