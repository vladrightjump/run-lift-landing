import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { participant, logEntry } from './unit/helpers/adminHarness';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Primul test de browser al backoffice-ului.
 *
 * Suita lui era numai unitară, iar comutarea între ecrane — exact ce a
 * introdus trecerea la „un ecran pe rând" — e clasa de regresie pe care
 * testele unitare n-o pot prinde structural: fragmentul din URL, istoricul
 * browserului și butonul „înapoi" nu există în jsdom așa cum există aici.
 *
 * Nu scrie nimic: toate RPC-urile Supabase sînt interceptate.
 */

const RPC = '**/rest/v1/rpc/*';

/** Răspunsuri plauzibile, cât să se randeze fiecare ecran. */
const RASPUNSURI: Record<string, unknown> = {
  admin_check_token: true,
  admin_list_registrations: [],
  admin_list_waitlist: [],
  admin_list_email_log: [],
  admin_list_events: [],
  admin_list_editions: [
    { editie: SNAPSHOT_CONFIG.number, participanti: 0, asteptare: 0, lansare: 0, prima: null, ultima: null, este_curenta: true },
  ],
  admin_list_launch_notifications: [],
  admin_list_email_templates: [],
  admin_get_event_config: [],
  admin_list_training_reels: [],
  admin_list_weekly_workout: [],
};

const deschideAdminul = async (page: Page, ecran = '', raspunsuri: Record<string, unknown> = RASPUNSURI) => {
  await page.route(RPC, async (ruta) => {
    const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      // Un răspuns-funcție primește corpul cererii (de ex. ediția cerută).
      body: JSON.stringify(
        typeof raspunsuri[nume] === 'function'
          ? raspunsuri[nume](ruta.request().postDataJSON())
          : (raspunsuri[nume] ?? null)
      ),
    });
  });
  // Tokenul sărit peste login: testul e despre navigare, nu despre autentificare.
  await page.addInitScript(() => {
    localStorage.setItem('runlift_admin_token', 'token-e2e');
  });
  await page.goto(`/admin${ecran}`);
};

test.describe('navigarea între ecrane', () => {
  test('aterizarea e pe Acum, cu navigarea pe zone', async ({ page }) => {
    await deschideAdminul(page);

    await expect(page.getByRole('heading', { name: 'Acum', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Zone și ecrane' })).toBeVisible();
  });

  test('un ecran deschis din navigare schimbă și adresa', async ({ page }) => {
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Clipuri/ }).click();

    await expect(page.getByRole('heading', { name: 'Clipuri de antrenament' })).toBeVisible();
    await expect(page).toHaveURL(/#clipuri$/);
  });

  test('„înapoi" se întoarce la ecranul anterior, fără să iasă din admin', async ({ page }) => {
    // Regresia pe care o păzește: fără fragment în URL, butonul „înapoi" scotea
    // din /admin cu totul — pierdeai tot contextul pentru că voiai un pas înapoi.
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Clipuri/ }).click();
    await expect(page).toHaveURL(/#clipuri$/);

    await page.goBack();

    await expect(page).toHaveURL(/#acum$/);
    await expect(page.getByRole('heading', { name: 'Acum', exact: true })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/#clipuri$/);
    await expect(page.getByRole('heading', { name: 'Clipuri de antrenament' })).toBeVisible();
  });

  test('un singur ecran e randat odată', async ({ page }) => {
    await deschideAdminul(page);

    await page.getByRole('navigation', { name: 'Zone și ecrane' }).getByRole('button', { name: 'Mesaje', exact: true }).click();
    await page.getByRole('button', { name: /Șabloane/ }).click();

    await expect(page.getByRole('heading', { name: 'Șabloane de email' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acum', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Zone și ecrane' })).toBeVisible();
  });

  test('adresa deschide direct ecranul, deci se poate trimite prin link', async ({ page }) => {
    await page.route(RPC, async (ruta) => {
      const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(nume in RASPUNSURI ? RASPUNSURI[nume] : null),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('runlift_admin_token', 'token-e2e');
    });

    await page.goto('/admin#antrenament');

    await expect(page.getByRole('heading', { name: 'Antrenamentele' })).toBeVisible();
  });

  test('calea de întoarcere duce acasă de pe orice ecran', async ({ page }) => {
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Clipuri/ }).click();
    await page.getByRole('navigation', { name: 'Zone și ecrane' }).getByRole('button', { name: /^Acum/ }).click();

    await expect(page.getByRole('heading', { name: 'Acum', exact: true })).toBeVisible();
  });

  test('saltul peste antet e primul control focusabil și duce la ecran', async ({ page }) => {
    // Antetul are faza, numărătoarea, alerta, comutatorul și ieșirea din cont
    // — cinci opriri înaintea treburii, pe fiecare ecran.
    await deschideAdminul(page);
    await expect(page).toHaveURL(/#acum$/);

    const sari = page.getByRole('button', { name: 'Sari la ecran' });

    // Primul din ordinea de tabulare: nimic focusabil nu-l precede în document.
    const esteprimul = await page.evaluate(() => {
      const focusabile = document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return focusabile[0]?.textContent?.trim() === 'Sari la ecran';
    });
    expect(esteprimul).toBe(true);

    await sari.press('Enter');

    // Focusul e pe ecran, iar adresa NU s-a schimbat: fragmentul ține ecranul
    // curent, deci o ancoră „#ecran" ar fi trimis-o acasă.
    await expect(page.locator('main#ecran')).toBeFocused();
    await expect(page).toHaveURL(/#acum$/);
  });

  test('linkul vechi #desfasurare păstrează rezumatul ediției', async ({ page }) => {
    await deschideAdminul(page, '#desfasurare');
    await expect(page.getByLabel('Desfășurarea ediției')).toBeVisible();
    await expect(page).toHaveURL(/#desfasurare$/);
  });

  test('pe telefon, zonele și filele păstrează ultima destinație', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await deschideAdminul(page);
    const zone = page.getByRole('navigation', { name: 'Zone', exact: true });
    await zone.getByRole('button', { name: 'Site', exact: true }).click();
    await page.getByRole('navigation', { name: 'Ecrane din Site' }).getByRole('button', { name: 'Clipuri' }).click();
    await expect(page).toHaveURL(/#clipuri$/);
    await zone.getByRole('button', { name: /^Acum/ }).click();
    await expect(page.getByRole('heading', { name: 'Acum', exact: true })).toBeVisible();
    await zone.getByRole('button', { name: 'Site', exact: true }).click();
    await expect(page).toHaveURL(/#clipuri$/);
  });
});

test.describe('dialogul de prezență', () => {
  // Grupul radio e primul control: după o alegere, oprirea lui de Tab e
  // varianta aleasă, nu prima, iar Shift+Tab trebuie să rămână în dialog.
  for (const alegere of ['A venit', 'N-a venit']) {
    test(`focusul rămâne în dialog după ce e ales „${alegere}"`, async ({ page }) => {
      await deschideAdminul(page, '#participanti', {
        ...RASPUNSURI,
        admin_list_registrations: [participant({ id: 'r1', nume: 'Ana Popescu', email: 'ana@example.test', editie: SNAPSHOT_CONFIG.number, prezent: alegere === 'A venit' })],
      });
      const declansator = page.getByRole('button', { name: 'Prezență', exact: true });
      await declansator.click();
      const dialog = page.getByRole('dialog', { name: 'Ana Popescu' });
      const radio = dialog.getByRole('radio', { name: alegere, exact: true });
      await expect(radio).toBeFocused();
      await radio.check();
      await radio.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'Salvează' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(radio).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(declansator).toBeFocused();
    });
  }
});

test.describe('dialogul de ediție nouă', () => {
  test('Tab trece prin segmentele datei, nu sare la ora', async ({ page }) => {
    // Capcana de focus ia Tab-ul doar la margini. Dacă l-ar lua pe fiecare,
    // de pe lună ai sări direct la oră și ziua n-ar mai avea cum fi atinsă.
    const nou = SNAPSHOT_CONFIG.number + 1;
    await deschideAdminul(page, '#eveniment', {
      ...RASPUNSURI,
      admin_get_event_config: [{
        id: 'publicat', editie: SNAPSHOT_CONFIG.number, config: SNAPSHOT_CONFIG, status: 'published',
        created_at: '2026-01-01T00:00:00Z', published_at: '2026-01-01T00:00:00Z',
      }],
    });
    await page.getByRole('button', { name: `+ Ciornă pentru ediția ${nou}` }).click();
    const dialog = page.getByRole('dialog', { name: `Ediția ${nou}` });
    const data = dialog.getByLabel('Data cursei');
    await expect(data).toBeFocused();
    // Trei segmente (lună, zi, an) și butonul calendarului: trei Tab-uri rămân
    // în câmp, al patrulea iese la oră.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      await expect(data).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Ora startului')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('Acum și arhiva', () => {
  test('arhiva nu contaminează cifrele, alertele sau destinațiile de pe Acum', async ({ page }) => {
    const curenta = SNAPSHOT_CONFIG.number;
    const arhiva = curenta - 1;
    await page.clock.setFixedTime(new Date(Date.parse(`${SNAPSHOT_CONFIG.start}${SNAPSHOT_CONFIG.tz}`) - 86_400_000));
    await deschideAdminul(page, '', {
      ...RASPUNSURI,
      admin_list_editions: [
        { editie: curenta, participanti: 1, asteptare: 0, lansare: 0, prima: null, ultima: null, este_curenta: true },
        { editie: arhiva, participanti: 2, asteptare: 1, lansare: 0, prima: null, ultima: null, este_curenta: false },
      ],
      admin_list_registrations: ({ p_editie }: { p_editie: number }) => p_editie === curenta
        ? [participant({ id: 'c', nume: 'Participant curent', email: 'curent@example.test', editie: curenta })]
        : [participant({ id: 'a', nume: 'Participant arhivă', email: 'arhiva@example.test', editie: arhiva }), participant({ id: 'b', nume: 'Alt participant arhivă', email: 'b@example.test', editie: arhiva })],
      admin_list_waitlist: ({ p_editie }: { p_editie: number }) => p_editie === curenta ? [] : [participant({ id: 'w', nume: 'Așteptare arhivă', email: 'w@example.test', editie: arhiva })],
      admin_list_email_log: ({ p_editie }: { p_editie: number }) => p_editie === curenta ? [] : [logEntry({ id: 'e', email: 'arhiva@example.test', subiect: 'Confirmare', status: 'esuat', editie: arhiva })],
    });
    const sina = page.getByRole('navigation', { name: 'Zone și ecrane' });
    const card = page.getByRole('region', { name: new RegExp(`Ediția ${curenta} ·`) });
    await expect(card).toContainText(`1 din ${SNAPSHOT_CONFIG.slots.total} înscriși`);
    await card.getByRole('button', { name: 'Participanți' }).click();
    await page.getByLabel('Ediția', { exact: true }).selectOption(String(arhiva));
    await expect(page.getByText('Participant arhivă', { exact: true })).toBeVisible();
    await expect(sina.getByRole('button', { name: /^Acum/ })).toHaveText('Acum');
    await sina.getByRole('button', { name: /^Acum/ }).click();
    await expect(card).toContainText(`1 din ${SNAPSHOT_CONFIG.slots.total} înscriși`);
    await expect(page.getByText('1 email nelivrat')).toHaveCount(0);
    await expect(card).not.toContainText('în așteptare');
    // Navigarea obișnuită în Evenimente păstrează selecția arhivei.
    await sina.getByRole('button', { name: /^Participanți/ }).click();
    await expect(page.getByLabel('Ediția', { exact: true })).toHaveValue(String(arhiva));
    await page.goBack();
    await expect(card).toContainText(`1 din ${SNAPSHOT_CONFIG.slots.total} înscriși`);
    // Acțiunea explicită din card deschide participanții ediției curente.
    await card.getByRole('button', { name: 'Participanți' }).click();
    await expect(page.getByLabel('Ediția', { exact: true })).toHaveValue(String(curenta));
    await expect(page.getByText('Participant curent', { exact: true })).toBeVisible();
  });
});
