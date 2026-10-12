import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { linkCuToken, raspunde, TOKEN } from '../../../../tests/support/linkEmail';
import { ConfirmarePage } from './ConfirmarePage';

/**
 * `/confirmare?token=…`, linkul din emailul de double opt-in. Pagina confirmă
 * la încărcare; un token cu formă greșită nu ajunge la server, iar o problemă
 * de rețea arată altfel decât un link pe care serverul nu-l recunoaște.
 */

const titlu = () => screen.findByRole('heading', { level: 1 });

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Confirmarea înscrierii', () => {
  it.each([
    ['confirmat', 'Înscriere confirmată!'],
    ['deja_confirmat', 'Erai deja confirmat'],
    ['invalid', 'Link invalid'],
    ['ceva necunoscut', 'Link invalid'],
  ])('serverul răspunde %s → „%s"', async (raspuns, asteptat) => {
    const cereri = raspunde('confirm_signup', { body: raspuns });
    linkCuToken('/confirmare');
    render(<ConfirmarePage />);
    expect((await titlu()).textContent).toBe(asteptat);
    expect(cereri.corpuri).toEqual([{ p_token: TOKEN }]);
  });

  it('cât așteaptă răspunsul, spune că verifică', () => {
    raspunde('confirm_signup', { body: 'confirmat' });
    linkCuToken('/confirmare');
    render(<ConfirmarePage />);
    expect(screen.getByText('Verificăm linkul…')).toBeTruthy();
  });

  it.each([
    ['fără token', null],
    ['cu un token malformat', 'nu-e-uuid'],
  ])('%s → link invalid, fără nicio cerere', async (_caz, token) => {
    const cereri = raspunde('confirm_signup', { body: 'confirmat' });
    linkCuToken('/confirmare', token);
    render(<ConfirmarePage />);
    expect((await titlu()).textContent).toBe('Link invalid');
    expect(cereri.numar).toBe(0);
  });

  it.each([
    ['o eroare de server', { status: 500, body: { message: 'down' } }],
    ['un răspuns care nu e JSON', { brut: '<html>gateway</html>' }],
  ])('%s → mesaj de reîncercare, nu „link invalid"', async (_caz, raspuns) => {
    raspunde('confirm_signup', raspuns);
    linkCuToken('/confirmare');
    render(<ConfirmarePage />);
    expect((await titlu()).textContent).toBe('Nu am putut verifica');
  });

  it('linkul de întoarcere duce la pagina principală', async () => {
    raspunde('confirm_signup', { body: 'confirmat' });
    linkCuToken('/confirmare');
    render(<ConfirmarePage />);
    await titlu();
    expect(screen.getByRole('link', { name: 'Înapoi la pagina principală' }).getAttribute('href')).toBe('/');
  });
});
