import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { rand, baraActiuni, confirma, gardaIesire, randeaza, deschideCiorna, deschideGrupurile, camp, listEventConfig, saveEventConfigDraft } from './test-support';

describe('ciorna nesalvată nu dispare tăcut', () => {
  /** Textul barei lipite de jos. */
  const bara = (): string => baraActiuni().textContent ?? '';

  it('o ciornă pornită din publicat e nesalvată din prima clipă', async () => {
    await deschideCiorna();
    expect(bara()).toContain('Nesalvat');
  });

  it('o ciornă încărcată de pe server nu e nesalvată', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    expect(bara()).not.toContain('Nesalvat');
  });

  it('tastarea aprinde „Nesalvat", iar revenirea la valoarea inițială îl stinge', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    const nume = camp('Numele evenimentului');
    const initial = nume.value;
    fireEvent.change(nume, { target: { value: 'Altceva' } });
    expect(bara()).toContain('Nesalvat');

    fireEvent.change(nume, { target: { value: initial } });
    expect(bara()).not.toContain('Nesalvat');
  });

  it('salvarea stinge „Nesalvat" fără să aștepte reîncărcarea', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalled());
    await waitFor(() => expect(bara()).not.toContain('Nesalvat'));
  });

  it('„Renunță" cu diferențe întreabă, iar refuzul păstrează ciorna intactă', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Altceva' } });

    confirma.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));

    expect(confirma).toHaveBeenCalled();
    // Ciorna e tot acolo, cu editarea în ea.
    expect(screen.getByRole('button', { name: 'Renunță' })).toBeTruthy();
    expect(camp('Numele evenimentului').value).toBe('Altceva');
  });

  it('„Renunță" confirmat închide ciorna', async () => {
    await deschideCiorna();
    confirma.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByRole('button', { name: 'Renunță' })).toBeNull();
  });

  it('„Renunță" pe o ciornă salvată nu mai întreabă nimic', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Renunță' }));
    expect(confirma).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Renunță' })).toBeNull();
  });

  it('garda de ieșire din tab refuză plecarea când răspunsul e „nu"', async () => {
    await deschideCiorna();
    expect(gardaIesire.curenta).toBeTruthy();

    confirma.mockReturnValue(false);
    expect(gardaIesire.curenta?.()).toBe(false);

    confirma.mockReturnValue(true);
    expect(gardaIesire.curenta?.()).toBe(true);
  });

  it('garda lasă plecarea liberă fără diferențe nesalvate', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    expect(gardaIesire.curenta?.()).toBe(true);
    expect(confirma).not.toHaveBeenCalled();
  });

  it('fără ciornă deschisă nu există nimic de păzit', async () => {
    randeaza();
    await screen.findByRole('button', { name: /Editează ediția/ });
    expect(gardaIesire.curenta?.()).toBe(true);
    expect(confirma).not.toHaveBeenCalled();
  });

  it('avertismentul browserului e înregistrat doar cât timp există ce pierde', async () => {
    const adauga = vi.spyOn(window, 'addEventListener');
    const scoate = vi.spyOn(window, 'removeEventListener');

    await deschideCiorna();
    expect(adauga.mock.calls.some(([tip]) => tip === 'beforeunload')).toBe(true);

    confirma.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    await waitFor(() =>
      expect(scoate.mock.calls.some(([tip]) => tip === 'beforeunload')).toBe(true)
    );
  });
});
