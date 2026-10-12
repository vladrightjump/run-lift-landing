import { test, expect } from '../support/playwright';
import { HttpResponse } from 'msw';
import { rpcHandler, functionHandler } from '../support/handlers';

/**
 * Paginile din linkurile de email, în browser: drumul omului care apasă linkul.
 * Stările fiecărei pagini (deja folosit, invalid, eroare, token malformat) sunt
 * teste de componentă, lângă cod, în `src/features/{confirmare,unsubscribe,renunt}/`.
 * RPC-urile sunt mock-uite: testele nu ating baza reală.
 */

const TOKEN = '123e4567-e89b-42d3-a456-426614174000';

test.describe('Linkurile din email', () => {
  test('confirmarea: linkul confirmă, iar butonul duce înapoi acasă', async ({ page, network }) => {
    network.use(rpcHandler('confirm_signup', () => HttpResponse.json('confirmat')));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/înscriere confirmată/i);
    await page.getByRole('link', { name: /înapoi la pagina principală/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('dezabonarea: linkul dezabonează la deschidere', async ({ page, network }) => {
    network.use(rpcHandler('unsubscribe', () => HttpResponse.json('dezabonat')));
    await page.goto(`/unsubscribe?token=${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/te-am dezabonat/i);
  });

  test('renunțarea: deschiderea nu atinge locul, abia click-ul îl eliberează', async ({ page, network }) => {
    let cereri = 0;
    network.use(rpcHandler('decline_spot', () => {
      cereri += 1;
      return HttpResponse.json('renuntat');
    }));
    await page.goto(`/renunt?token=${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/nu mai poți veni/i);
    expect(cereri).toBe(0);

    await page.getByRole('button', { name: /eliberează-mi locul/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/locul e eliberat/i);
    expect(cereri).toBe(1);
  });
});

test.describe('Formularele anunță confirmarea', () => {
  test('Coming Soon: succesul cere verificarea emailului', async ({ page, network }) => {
    network.use(functionHandler('submit-form', () => HttpResponse.json({ ok: true })));

    await page.goto('/?preview=soon');
    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Confirmare');
    await modal.getByPlaceholder('andrei@email.ro').fill('conf@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(modal.getByText(/linkul din el ca să confirmi/i)).toBeVisible();
  });

  test('Coming Soon: înscrierea pleacă spre submit-form, care trimite emailul', async ({ page, network }) => {
    // Emailul de confirmare nu mai e declanșat din browser: îl trimite funcția
    // Edge, după ce a verificat token-ul Turnstile. Aici verificăm doar că plicul
    // ajunge corect la ea — restul e responsabilitatea serverului.
    let plic: Record<string, unknown> = {};
    network.use(functionHandler('submit-form', async ({ request }) => {
      plic = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }));
    let emailCerut = false;
    network.use(functionHandler('send-email', () => {
      emailCerut = true;
      return HttpResponse.json({ sent: 1 });
    }));

    await page.goto('/?preview=soon');
    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Confirmare');
    await modal.getByPlaceholder('andrei@email.ro').fill('conf@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect.poll(() => plic.mode).toBe('launch');
    expect((plic.data as Record<string, unknown>).email).toBe('conf@example.com');
    expect(emailCerut).toBe(false);
  });
});
