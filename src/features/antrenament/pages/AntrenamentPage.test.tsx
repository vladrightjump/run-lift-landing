import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';
import { programDe, saptamanaPublica } from '../../../../tests/support/builders/workouts';
import { Antrenament } from './AntrenamentPage';

/**
 * Pagina `/antrenament`: linkul de trimis în story sau în grupul de Telegram,
 * plus programul din care poate începe cineva de la capăt.
 *
 * Diferența dintre „nu e publicat nimic" și „n-am putut întreba" e tot rostul
 * paginii: dacă le-ar arăta la fel, un backend căzut ar arăta ca o săptămână
 * fără antrenament. Ce ține de CSS-ul real (rândurile păstrate, lățimea pe
 * telefon) și de rută (fără configul ediției) e în `tests/e2e/antrenament.spec.ts`.
 */

let cereri = 0;
const program = (body: unknown, status = 200) =>
  server.use(
    rpcHandler('public_weekly_workouts', () => {
      cereri += 1;
      return new HttpResponse(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    })
  );

const deschide = (fragment = '') => {
  window.history.replaceState(null, '', `/antrenament${fragment}`);
  return render(<Antrenament />);
};

const card = () => screen.getByRole('article');
const selector = () => screen.queryByLabelText(/Alege o săptămână/);

afterEach(() => {
  cereri = 0;
  window.history.replaceState(null, '', '/');
});

describe('Antrenamentul săptămânii', () => {
  it('arată săptămâna curentă — cea mai mare', async () => {
    program([
      saptamanaPublica(1, { titlu: 'Bază' }),
      saptamanaPublica(2, { titlu: 'Tempo', corp: '5×1000m\npauză 2 min' }),
    ]);
    deschide();
    expect(await screen.findByRole('heading', { name: 'Tempo' })).toBeTruthy();
    expect(within(card()).getByText('Săptămâna 2')).toBeTruthy();
    expect(card().textContent).toContain('5×1000m\npauză 2 min');
  });

  it('fără nicio săptămână vizibilă răspunde, nu dă eroare', async () => {
    program([]);
    deschide();
    expect(await screen.findByText(/Nu e publicat niciun antrenament/)).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
    expect(selector()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o eroare de rețea nu se dă drept „nimic publicat"', async () => {
    program({ message: 'down' }, 500);
    deschide();
    expect((await screen.findByRole('alert')).textContent).toContain('Nu am putut încărca');
    expect(screen.queryByText(/Nu e publicat niciun antrenament/)).toBeNull();
  });

  it('cât se încarcă, spune asta', () => {
    program(programDe(1));
    deschide();
    expect(screen.getByRole('status').textContent).toBe('Se încarcă…');
  });

  it('titlul paginii e vizibil și logo-ul duce acasă', async () => {
    program(programDe(1));
    deschide();
    expect(screen.getByRole('heading', { level: 1, name: 'Antrenamentul săptămânii' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'R + L' }).getAttribute('href')).toBe('/');
    await screen.findByRole('article');
  });
});

describe('Programul', () => {
  it('selectorul listează toate săptămânile, crescător', async () => {
    program(programDe(4));
    deschide();
    await screen.findByRole('article');
    const optiuni = within(selector()!).getAllByRole('option');
    expect(optiuni).toHaveLength(4);
    expect(optiuni[0].textContent).toBe('Săptămâna 1: Titlu 1');
    expect(optiuni[3].textContent).toBe('Săptămâna 4: Titlu 4');
  });

  it('alegerea schimbă cardul fără o cerere nouă și se scrie în fragment', async () => {
    program(programDe(4));
    deschide();
    await screen.findByRole('heading', { name: 'Titlu 4' });
    expect(cereri).toBe(1);

    fireEvent.change(selector()!, { target: { value: '1' } });

    expect(within(card()).getByText('Săptămâna 1')).toBeTruthy();
    expect(card().textContent).toContain('corpul săptămânii 1');
    expect(window.location.hash).toBe('#s1');
    expect(cereri).toBe(1);
  });

  it('un fragment valid deschide direct acea săptămână', async () => {
    program(programDe(4));
    deschide('#s2');
    expect(await screen.findByRole('heading', { name: 'Titlu 2' })).toBeTruthy();
  });

  it('un fragment care nu corespunde nimănui cade pe săptămâna curentă, fără eroare', async () => {
    program(programDe(4));
    deschide('#s99');
    expect(await screen.findByRole('heading', { name: 'Titlu 4' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cu o singură săptămână, selectorul nu se randează', async () => {
    program(programDe(1));
    deschide();
    await screen.findByRole('article');
    expect(selector()).toBeNull();
  });

  it('numerele sărite (o săptămână ascunsă) se arată ca atare, nu recalculate', async () => {
    program([saptamanaPublica(1), saptamanaPublica(2), saptamanaPublica(4)]);
    deschide();
    await screen.findByRole('article');
    const optiuni = within(selector()!).getAllByRole('option');
    expect(optiuni).toHaveLength(3);
    expect(optiuni[2].textContent).toContain('Săptămâna 4');
    expect(within(card()).getByText('Săptămâna 4')).toBeTruthy();
  });
});
