import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { linkCuToken, raspunde, TOKEN } from '../../../../tests/support/linkEmail';
import { UnsubscribePage } from './UnsubscribePage';

/** `/unsubscribe?token=…`, linkul din subsolul emailurilor în masă. Dezabonează la încărcare. */

const titlu = () => screen.findByRole('heading', { level: 1 });

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Dezabonarea', () => {
  it.each([
    ['dezabonat', 'Te-am dezabonat'],
    ['deja_dezabonat', 'Erai deja dezabonat'],
    ['invalid', 'Link invalid'],
  ])('serverul răspunde %s → „%s"', async (raspuns, asteptat) => {
    const cereri = raspunde('unsubscribe', { body: raspuns });
    linkCuToken('/unsubscribe');
    render(<UnsubscribePage />);
    expect((await titlu()).textContent).toBe(asteptat);
    expect(cereri.corpuri).toEqual([{ p_token: TOKEN }]);
  });

  it('cât așteaptă răspunsul, spune că procesează', () => {
    raspunde('unsubscribe', { body: 'dezabonat' });
    linkCuToken('/unsubscribe');
    render(<UnsubscribePage />);
    expect(screen.getByText('Procesăm cererea…')).toBeTruthy();
  });

  it('fără un token valid → link invalid, fără nicio cerere', async () => {
    const cereri = raspunde('unsubscribe', { body: 'dezabonat' });
    linkCuToken('/unsubscribe', 'nu-e-uuid');
    render(<UnsubscribePage />);
    expect((await titlu()).textContent).toBe('Link invalid');
    expect(cereri.numar).toBe(0);
  });

  it('o eroare de server → mesaj de reîncercare', async () => {
    raspunde('unsubscribe', { status: 500, body: { message: 'down' } });
    linkCuToken('/unsubscribe');
    render(<UnsubscribePage />);
    expect((await titlu()).textContent).toBe('Nu am putut procesa');
  });
});
