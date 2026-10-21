import { test, expect } from '../support/playwright';
import { installAdminResponses } from '../support/admin';
import { adminNavigationData } from '../support/builders/admin';
import { atribuire, blocProgram, documentProgram, profilSportiv, program, ziProgram } from '../support/builders/programare';
import { http, HttpResponse } from 'msw';

const citireSintetica = () => {
  const a = atribuire({ data_start: '2026-09-07', data_sfarsit: '2026-11-28', sportiv_gen: 'feminin' });
  const p = program({ saptamani: 12, zile_pe_saptamana: 6, atribuiri: [a] });
  const profil = profilSportiv({ gen: 'feminin' });
  const baza = blocProgram();
  const secundar = { ...baza.seturi[0], id: 'set-2', exercitiu: 2, repetari: null, incarcare: null,
    calorii: 18, tinte_feminine: { calorii: 14 },
    miscare: { ...baza.seturi[0].miscare, id: 'miscare-2', nume: 'Transport demo', youtube_id: null } };
  const forta = blocProgram({ note_sportiv: 'Notă sintetică de ritm', note_antrenor: 'Notă privată exclusiv antrenorului',
    seturi: [baza.seturi[0], secundar].flatMap(s => [1, 2, 3].map(ordine => ({ ...s, id: `${s.id}-${ordine}`, ordine }))) });
  const liber = blocProgram({ id: 'bloc-2', ordine: 2, tip: 'generic', nume: 'Mobilitate demo',
    text: 'Mișcare liberă, după confort.', parametri: { prefix: 'B' }, seturi: [] });
  const zile = ['2026-10-21', '2026-10-22'].map((data, i) => ({
    ...ziProgram({ id: `zi-${i + 1}`, saptamana: 7, zi: i + 3, blocuri: [forta, liber] }),
    data, stare: i ? 'viitor' : 'nefăcut',
  }));
  return {
    ...adminNavigationData(), admin_prog_profil: profil, admin_prog_programe: [p],
    admin_prog_azi: ({ p_data }: { p_data: string }) => ({ data: p_data, profil,
      antrenamente: zile.filter(z => z.data === p_data).map(zi => ({ atribuire: a, program: p, zi })) }),
    admin_prog_calendar: { atribuire: a, zile, totaluri: { zile_antrenament: 2, rezultate: 0, pr: 0 } },
  };
};

test.describe('Programare — etapa 1', () => {
  test('foaia mobilă păstrează supersetul, schimbă blocul și se închide prin Înapoi', async ({ page, network }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00Z'));
    installAdminResponses(network, citireSintetica());
    network.use(http.get('https://www.youtube-nocookie.com/*', () => new HttpResponse('<html>Demo video</html>', { headers: { 'Content-Type': 'text/html' } })));
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-azi/2026-10-21');
    const deschide = page.getByRole('button', { name: 'Deschide antrenamentul' });
    await deschide.click();
    const foaie = page.getByRole('dialog', { name: 'Antrenament: Program sintetic' });
    await expect(foaie).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    const blocuri = foaie.getByRole('navigation', { name: 'Blocurile antrenamentului' });
    await blocuri.getByRole('button', { name: 'A2', exact: true }).click();
    await expect(page).toHaveURL(/#prog-azi\/2026-10-21\/bloc-1\/2\/atribuire-1$/);
    await expect(blocuri.getByRole('button', { name: 'A2', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(foaie.getByRole('region', { name: 'Blocurile zilei' }).locator('li[aria-current="true"]')).toContainText('Transport demo 14 calorii');
    await foaie.getByRole('tab', { name: 'Istoric', exact: true }).click();
    await expect(foaie.getByText('Nu există rezultate înregistrate pentru acest exercițiu.')).toBeVisible();
    await foaie.getByRole('tab', { name: 'Exercițiu', exact: true }).click();
    await blocuri.getByRole('button', { name: 'A1', exact: true }).click();
    await foaie.getByRole('region', { name: 'Exercițiul curent' }).getByRole('button', { name: 'Video: Genuflexiune demo' }).click();
    const video = page.getByRole('dialog', { name: 'Genuflexiune demo', exact: true });
    await expect(video).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(video).toHaveCount(0);
    await expect(foaie).toBeVisible();
    await blocuri.getByRole('button', { name: 'B', exact: true }).click();
    await expect(foaie.getByText('Mișcare liberă, după confort.')).toBeVisible();
    await expect(foaie.locator('form')).toHaveCount(0);
    expect(await foaie.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.goBack();
    await expect(foaie).toHaveCount(0);
    await expect(page).toHaveURL(/#prog-azi\/2026-10-21$/);
    await expect(deschide).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await deschide.click();
    await page.getByRole('button', { name: 'Închide antrenamentul' }).click();
    await expect(foaie).toHaveCount(0);
    await expect(deschide).toBeFocused();
  });

  test('un link direct se închide în Azi, fără să părăsească adminul', async ({ page, network }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00Z'));
    installAdminResponses(network, citireSintetica());
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-azi/2026-10-21/bloc-1/2/atribuire-1');
    await expect(page.getByRole('dialog', { name: 'Antrenament: Program sintetic' })).toBeVisible();
    await page.getByRole('button', { name: 'Închide antrenamentul' }).click();
    await expect(page).toHaveURL(/\/admin#prog-azi\/2026-10-21$/);
    await expect(page.getByRole('button', { name: 'Deschide antrenamentul' })).toBeVisible();
  });

  test('antrenamentul are trei coloane pe desktop', async ({ page, network }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00Z'));
    installAdminResponses(network, citireSintetica());
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-azi/2026-10-21/bloc-1/1/atribuire-1');
    const pagina = page.getByRole('region', { name: 'Antrenament: Program sintetic' });
    await expect(pagina).toBeVisible();
    const coloane = await Promise.all(['Blocurile zilei', 'Exercițiul curent', 'Istoricul exercițiului'].map(name => pagina.getByRole('region', { name }).boundingBox()));
    expect(coloane[0]!.x).toBeLessThan(coloane[1]!.x);
    expect(coloane[1]!.x).toBeLessThan(coloane[2]!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('schimbarea pragului de 640 px închide video înainte de a muta foaia', async ({ page, network }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00Z'));
    installAdminResponses(network, citireSintetica());
    network.use(http.get('https://www.youtube-nocookie.com/*', () => new HttpResponse('<html>Demo video</html>', { headers: { 'Content-Type': 'text/html' } })));
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-azi/2026-10-21/bloc-1/1/atribuire-1');
    const pagina = page.getByRole('region', { name: 'Antrenament: Program sintetic' });
    const video = page.getByRole('dialog', { name: 'Genuflexiune demo', exact: true });
    await pagina.getByRole('region', { name: 'Exercițiul curent' }).getByRole('button', { name: 'Video: Genuflexiune demo' }).click();
    await expect(video).toBeVisible();

    await page.setViewportSize({ width: 640, height: 844 });
    await expect(video).toHaveCount(0);
    const foaie = page.getByRole('dialog', { name: 'Antrenament: Program sintetic' });
    await expect(foaie).toBeVisible();
    await expect(foaie.getByRole('tab', { name: 'Exercițiu', exact: true })).toBeFocused();
    await foaie.getByRole('button', { name: 'A2', exact: true }).click();
    await expect(foaie.getByRole('button', { name: 'A2', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await foaie.getByRole('button', { name: 'A1', exact: true }).click();
    const declansator = foaie.getByRole('region', { name: 'Exercițiul curent' }).getByRole('button', { name: 'Video: Genuflexiune demo' });
    await declansator.click();
    await video.getByRole('button', { name: 'Închide video' }).click();
    await expect(video).toHaveCount(0);
    await expect(declansator).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await declansator.click();
    await expect(video).toBeVisible();
    await page.setViewportSize({ width: 641, height: 844 });
    await expect(video).toHaveCount(0);
    await expect(foaie).toHaveCount(0);
    await expect(pagina).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await pagina.getByRole('button', { name: 'Închide antrenamentul' }).click();
    await expect(page.getByRole('button', { name: 'Deschide antrenamentul' })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('Azi la 390 px: extindere, ținte feminine, video și navigare în viitor', async ({ page, network }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00Z'));
    installAdminResponses(network, citireSintetica());
    network.use(http.get('https://www.youtube-nocookie.com/*', () => new HttpResponse('<html>Demo video</html>', { headers: { 'Content-Type': 'text/html' } })));
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-azi/2026-10-21');
    const card = page.getByRole('article', { name: 'Program sintetic' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Pauză 30 de secunde')).toHaveCount(0);
    await card.getByRole('button', { name: 'Arată tot antrenamentul' }).click();
    await expect(card.getByText(/15 kg/)).toBeVisible();
    await expect(card.getByText(/Transport demo 14 calorii/)).toBeVisible();
    await expect(card.getByText('Notă sintetică de ritm')).toBeVisible();
    await expect(card.getByText('Notă privată exclusiv antrenorului')).toHaveCount(0);
    const video = card.getByRole('button', { name: 'Video: Genuflexiune demo' });
    await video.click();
    const modal = page.getByRole('dialog', { name: 'Genuflexiune demo' });
    await expect(modal.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?/);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(video).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: /22 octombrie 2026, are antrenament/ }).click();
    await expect(page).toHaveURL(/#prog-azi\/2026-10-22$/);
    await expect(page.getByRole('button', { name: 'Înapoi la azi' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#prog-azi\/2026-10-21$/);
    await expect(page.getByRole('heading', { name: 'Azi', exact: true })).toBeVisible();
  });

  test('calendarul pe telefon deschide și o zi viitoare', async ({ page, network }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00Z'));
    installAdminResponses(network, citireSintetica());
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-calendar');
    await expect(page.getByRole('img', { name: 'Harta antrenamentelor în 2026' })).toBeVisible();
    await expect(page.locator('dl').getByText('2', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: /22 octombrie 2026, viitor/ }).click();
    await expect(page).toHaveURL(/#prog-azi\/2026-10-22\/bloc-1\/1\/atribuire-1$/);
  });

  test('pe telefon, profilul, importul confirmat și repornirea păstrează atribuirile', async ({ page, network }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let profil: ReturnType<typeof profilSportiv> | null = null;
    let programe: ReturnType<typeof program>[] = [];
    const atribuiri: ReturnType<typeof atribuire>[] = [];
    let importuri = 0;
    installAdminResponses(network, {
      ...adminNavigationData(),
      admin_prog_profil: () => profil,
      admin_prog_profil_salveaza: (p: Record<string, unknown>) => {
        profil = profilSportiv({ nume: String(p.p_nume), gen: p.p_gen as 'masculin' | 'feminin' });
        return profil;
      },
      admin_prog_programe: () => programe,
      admin_prog_importa: () => { importuri++; programe = [program()]; return { ...program(), zile: [] }; },
      admin_prog_program: () => ({ ...program(), atribuiri, zile: [] }),
      admin_prog_atribuie: (p: Record<string, unknown>) => {
        const sfarsit = new Date(`${p.p_data_start}T12:00:00Z`);
        sfarsit.setUTCDate(sfarsit.getUTCDate() + 13);
        const a = atribuire({ id: `atribuire-${atribuiri.length + 1}`, sportiv_nume: profil!.nume, sportiv_gen: profil!.gen,
          data_start: String(p.p_data_start), data_sfarsit: sfarsit.toISOString().slice(0, 10) });
        atribuiri.push(a); return a;
      },
    });
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#prog-programe');
    await page.getByLabel('Nume afișat').fill('Sportiv E2E');
    await page.getByLabel('Gen').selectOption('feminin');
    await expect(page.getByText(/Fără id Telegram, nu vei primi alerte/)).toBeVisible();
    await page.getByRole('button', { name: 'Salvează profilul' }).click();
    await expect(page.getByText('Profil salvat.')).toBeVisible();

    for (let i = 1; i <= 2; i++) {
      await page.getByLabel('Fișier JSON de import').setInputFiles({
        name: 'program-sintetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(documentProgram())),
      });
      await expect(page.getByRole('button', { name: 'Confirmă importul' })).toBeVisible();
      expect(importuri).toBe(i - 1);
      await page.getByRole('button', { name: 'Confirmă importul' }).click();
      await expect(page.getByRole('button', { name: 'Program sintetic', exact: true })).toHaveCount(1);
      expect(importuri).toBe(i);
    }
    await page.getByRole('button', { name: 'Program sintetic', exact: true }).click();
    await expect(page).toHaveURL(/#prog-programe\/program-1$/);
    await page.getByLabel('Data de start').fill('2026-09-07');
    await page.getByRole('button', { name: 'Atribuie-mi programul' }).click();
    await expect(page.getByRole('list', { name: 'Istoricul atribuirilor' }).getByRole('listitem')).toHaveCount(1);
    await page.getByLabel('Data de start').fill('2027-01-05');
    await page.getByRole('button', { name: 'Începe din nou' }).click();
    await expect(page.getByRole('list', { name: 'Istoricul atribuirilor' }).getByRole('listitem')).toHaveCount(2);
    expect(atribuiri.map(a => a.data_start)).toEqual(['2026-09-07', '2027-01-05']);
    const zone = page.getByRole('navigation', { name: 'Zone', exact: true });
    await expect(zone.getByRole('button')).toHaveCount(5);
    expect(await zone.getByRole('button').evaluateAll(els => new Set(els.map(el => Math.round(el.getBoundingClientRect().top))).size)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('adresa privată cere autentificare înainte de orice citire de program', async ({ page }) => {
    const cereri: string[] = [];
    page.on('request', r => { if (r.url().includes('/rpc/admin_prog_')) cereri.push(r.url()); });
    await page.goto('/admin#prog-azi/2026-10-21');
    await expect(page.getByRole('button', { name: 'Intră în cont' })).toBeVisible();
    expect(cereri).toEqual([]);
  });

  test('AE7: paginile publice nu cer niciun program privat', async ({ page }) => {
    const cereri: string[] = [];
    page.on('request', r => { if (r.url().includes('/rpc/admin_prog_')) cereri.push(r.url()); });
    for (const ruta of ['/antrenament#prog-azi/2026-10-21', '/?preview=landing', '/despre-noi', '/inscriere']) {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'Programare', exact: true })).toHaveCount(0);
    }
    expect(cereri).toEqual([]);
  });
});
