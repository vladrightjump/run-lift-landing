import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAppQueryClient } from '../../../app/providers';
import { HttpResponse } from 'msw';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';
import { saptamanaPublica } from '../../../../tests/support/builders/workouts';
import { CardAntrenament } from './CardAntrenament';

/**
 * Cardul „Până atunci" de pe ecranul de așteptare: arată conținutul, nu o
 * etichetă, și tace complet când n-are ce arăta. E decor pe un ecran al cărui
 * rost e formularul de notificare; o eroare aici n-are voie să strice pagina.
 * Fade-ul (care cere măsurători reale), lățimea pe telefon și locul cardului
 * pe ecranele de așteptare sunt în `tests/e2e/antrenament.spec.ts`.
 */

const CORP = 'ÎNCĂLZIRE\n5 min alergare ușoară\nINTERVALE\n1200 m · RPE 5/10';

let cereri = 0;
const program = (body: unknown, status = 200) => {
  cereri = 0;
  server.use(
    rpcHandler('public_weekly_workouts', () => {
      cereri += 1;
      return new HttpResponse(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    })
  );
};

/**
 * Randează cu un client propriu și așteaptă ca cererea să se fi încheiat, ca un
 * card absent să însemne „a tăcut", nu „încă n-a venit răspunsul".
 */
const randeazaPanaLaRaspuns = async () => {
  const client = createAppQueryClient();
  const vedere = render(
    <QueryClientProvider client={client}>
      <CardAntrenament />
    </QueryClientProvider>
  );
  await waitFor(() => expect(client.getQueryState(['antrenament', 'program'])?.status).not.toBe('pending'));
  return vedere;
};

describe('Cardul „Până atunci"', () => {
  it('arată săptămâna curentă — numărul, titlul și primele rânduri — ca link spre pagină', async () => {
    program([
      saptamanaPublica(1, { titlu: 'Intervale 1', corp: CORP }),
      saptamanaPublica(2, { titlu: 'Intervale 2', corp: CORP }),
    ]);
    render(<CardAntrenament />);
    const link = await screen.findByRole('link', { name: 'Antrenamentul săptămânii 2: Intervale 2' });
    expect(link.getAttribute('href')).toBe('/antrenament');
    expect(link.textContent).toContain('Săptămâna 2');
    expect(link.textContent).toContain('ÎNCĂLZIRE\n5 min alergare ușoară');
  });

  it('numele accesibil e scurt, nu tot antrenamentul', async () => {
    program([saptamanaPublica(3, { titlu: 'Intervale 3', corp: CORP })]);
    render(<CardAntrenament />);
    const link = await screen.findByRole('link');
    expect(link.getAttribute('aria-label')).toBe('Antrenamentul săptămânii 3: Intervale 3');
  });

  it.each([
    ['fără niciun antrenament vizibil', [], 200],
    ['la o eroare de server', { message: 'down' }, 500],
    ['la un răspuns stricat', { nu: 'e un array' }, 200],
  ])('tace %s', async (_caz, body, status) => {
    program(body, status);
    const { container } = await randeazaPanaLaRaspuns();
    expect(cereri).toBe(1);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
