import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { linkCuToken, raspunde, TOKEN } from '../../../../tests/support/linkEmail';
import { RenuntPage } from './RenuntPage';

/**
 * `/renunt?token=…`, „Nu mai pot veni". Spre deosebire de confirmare și
 * dezabonare, pagina NU atinge nimic la încărcare: locul eliberat pleacă pe loc
 * la primul de pe lista de așteptare, iar scanerele de linkuri ale providerilor
 * de email deschid URL-urile singure. Cererea pleacă doar la click.
 */

const elibereaza = () => screen.getByRole('button', { name: 'Da, eliberează-mi locul' });

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Renunțarea la loc', () => {
  it('la deschidere întreabă, cu „Rămân înscris" primul, și nu trimite nimic', () => {
    const cereri = raspunde('decline_spot', { body: 'renuntat' });
    linkCuToken('/renunt');
    render(<RenuntPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nu mai poți veni?');
    const actiuni = screen.getAllByRole('link', { name: 'Nu, rămân înscris' });
    expect(actiuni[0].getAttribute('href')).toBe('/');
    expect(elibereaza()).toBeTruthy();
    expect(cereri.numar).toBe(0);
  });

  it.each([
    ['renuntat', 'Locul e eliberat'],
    ['deja_renuntat', 'Nu mai ești pe listă'],
    ['prea_tarziu', 'E prea târziu pentru link'],
    ['invalid', 'Link invalid'],
  ])('după click, serverul răspunde %s → „%s"', async (raspuns, asteptat) => {
    const cereri = raspunde('decline_spot', { body: raspuns });
    linkCuToken('/renunt');
    render(<RenuntPage />);
    fireEvent.click(elibereaza());
    expect((await screen.findByText(asteptat)).tagName).toBe('H1');
    expect(cereri.corpuri).toEqual([{ p_token: TOKEN }]);
  });

  it('cât se trimite, butonul e dezactivat, iar un al doilea click nu mai trimite', async () => {
    const cereri = raspunde('decline_spot', { body: 'renuntat' });
    linkCuToken('/renunt');
    render(<RenuntPage />);
    fireEvent.click(elibereaza());
    const buton = screen.getByRole('button', { name: 'Se eliberează…' }) as HTMLButtonElement;
    expect(buton.disabled).toBe(true);
    fireEvent.click(buton);
    await screen.findByText('Locul e eliberat');
    expect(cereri.numar).toBe(1);
  });

  it('o eroare de server spune că locul a rămas neatins', async () => {
    raspunde('decline_spot', { status: 500, body: { message: 'down' } });
    linkCuToken('/renunt');
    render(<RenuntPage />);
    fireEvent.click(elibereaza());
    expect((await screen.findByText('Nu am putut procesa')).tagName).toBe('H1');
    expect(screen.getByText(/locul tău a rămas neatins/)).toBeTruthy();
  });

  it('offline arată eroarea imediat și nu păstrează renunțarea pentru reconectare', async () => {
    const cereri = raspunde('decline_spot', { retea: true });
    linkCuToken('/renunt');
    const { unmount, rerender } = render(<RenuntPage />);
    onlineManager.setOnline(false);
    try {
      fireEvent.click(elibereaza());
      expect((await screen.findByText('Nu am putut procesa')).tagName).toBe('H1');
      expect(cereri.numar).toBe(1);
      rerender(<></>);
      await act(async () => { onlineManager.setOnline(true); });
      expect(cereri.numar).toBe(1);
    } finally {
      await act(async () => { onlineManager.setOnline(true); });
      unmount();
    }
  });

  it('fără un token valid → link invalid direct, fără buton și fără cerere', () => {
    const cereri = raspunde('decline_spot', { body: 'renuntat' });
    linkCuToken('/renunt', 'nu-e-uuid');
    render(<RenuntPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Link invalid');
    expect(screen.queryByRole('button')).toBeNull();
    expect(cereri.numar).toBe(0);
  });
});
