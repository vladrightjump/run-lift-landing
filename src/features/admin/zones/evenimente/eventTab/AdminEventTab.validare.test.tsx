import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';

import { fataDeStart, deschideCiorna, camp, eroareaCampului } from './test-support';

describe('validarea blochează publicarea', () => {
  it('un deadline după start dezactivează „Publică" și spune de ce', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(2) } });

    // Mesajul apare în DOUĂ locuri, deliberat: bannerul de sus (îl vezi și când
    // câmpul vinovat e sub fold) și sub câmpul însuși (nu trebuie să ghicești
    // care dintre cele optsprezece e cel reclamat).
    const banner = document.querySelector('[data-css~="admin-banner"].warn') as HTMLElement;
    expect(within(banner).getByText(/nu poate fi după startul cursei/i)).toBeTruthy();
    expect(eroareaCampului('Se închid înscrierile')).toMatch(/nu poate fi după startul cursei/i);

    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvează' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('coordonate scrise ca text sunt respinse', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });
    // Doar în bannerul de erori — „lat,lng" apare și în eticheta câmpului.
    const banner = document.querySelector('[data-css~="admin-banner"].warn') as HTMLElement;
    expect(within(banner).getByText(/lat,lng/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);
  });

  it('corectarea reactivează publicarea', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(2) } });
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(0) } });
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('erorile indexate deschid grupul care le conține', () => {
  const grupul = (titlu: string) =>
    [...document.querySelectorAll('[data-css~="admin-config-grup"]')].find((g) =>
      g.querySelector('[data-css~="admin-config-grup-cap"]')?.textContent?.includes(titlu)
    );

  const capul = (titlu: string) =>
    grupul(titlu)?.querySelector('[data-css~="admin-config-grup-cap"]') as HTMLElement;

  it('un avans invalid pe un rând marchează grupul și îl ține deschis', async () => {
    await deschideCiorna();

    // Zero e sub minimul de 1 -> cheia `reminders.0.offsetHours`, indexată.
    fireEvent.change(camp('Cu câte ore înainte de start'), { target: { value: '0' } });

    expect(grupul('Remindere')?.className).toContain('invalid');
    fireEvent.click(capul('Remindere')); // încercăm să-l închidem
    expect(capul('Remindere').getAttribute('aria-expanded')).toBe('true');
  });

  it('un avans peste maxim marchează la fel', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Cu câte ore înainte de start'), { target: { value: '721' } });
    expect(grupul('Remindere')?.className).toContain('invalid');
  });

  it('un avans valid nu marchează nimic', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Cu câte ore înainte de start'), { target: { value: '12' } });
    expect(grupul('Remindere')?.className).not.toContain('invalid');
  });
});

describe('indicatorul de erori duce la câmp', () => {
  it('apăsarea lui focusează primul câmp invalid', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });

    fireEvent.click(screen.getByRole('button', { name: /câmp de reparat/ }));
    expect(document.activeElement).toBe(camp('Coordonatele'));
  });

  it('cu două probleme, merge la prima din document, nu la ultima', async () => {
    await deschideCiorna();
    // „Numele evenimentului" e sus în document, coordonatele mai jos.
    fireEvent.change(camp('Numele evenimentului'), { target: { value: '' } });
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });

    fireEvent.click(screen.getByRole('button', { name: /câmpuri de reparat/ }));
    expect(document.activeElement).toBe(camp('Numele evenimentului'));
  });

  it('fără probleme, bara arată ediția și nu mai e buton', async () => {
    await deschideCiorna();
    expect(screen.queryByRole('button', { name: /de reparat/ })).toBeNull();
  });

  it('fiecare cheie produsă de validare are un câmp care o poartă', async () => {
    // Garda care ține cele două vocabulare lipite: dacă o validare nouă scrie o
    // cheie pe care niciun `Camp` n-o stampilează, saltul ar duce nicăieri.
    await deschideCiorna();
    const stampilate = new Set(
      [...document.querySelectorAll('[data-camp]')].map((e) => e.getAttribute('data-camp'))
    );
    const cheiSimple = [
      'number',
      'launchNumber',
      'eventName',
      'concept',
      'tz',
      'start',
      'durationHours',
      'checkinFrom',
      'registrationDeadline',
      'launchAt',
      'nextEditionAt',
      'leaderboardLeadHours',
      'slots.total',
      'slots.waitlist',
      'slots.occupiedFallback',
      'venue.name',
      'venue.city',
      'venue.mapQuery',
      'venue.zoom',
    ];
    for (const cheie of cheiSimple) expect(stampilate).toContain(cheie);
  });
});
