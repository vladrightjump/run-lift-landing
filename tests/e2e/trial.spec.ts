import { test, expect } from '../support/playwright';
import { createHandlers } from '../support/handlers';
import { installAdminResponses } from '../support/admin';
import { trialData } from '../support/builders/trial';
import { dateSala } from '../support/builders/sala';
import { trialBrowserConfig, trialBrowserData, trialBrowserAdminResponses } from '../support/builders/trialBrowser';

const config = trialBrowserConfig();
for (const width of [375, 1280]) {
  for (const phase of ['landing', 'soon', 'leaderboard', 'next']) {
    test(`intrare Telegram ${phase} la ${width}px`, async ({ page, network }) => {
      await page.setViewportSize({ width, height: 900 });
      network.use(...createHandlers({
        public_trial_config: { enabled: true, bot_username: config.bot_username, contact_text: config.contact_text },
        public_homepage: null, public_training_reels: null, public_weekly_workouts: null,
      }));
      await page.goto(`/?preview=${phase}`);
      const section = page.getByRole('region', { name: 'Primul tău antrenament cu noi.' });
      await expect(section).toBeVisible();
      await expect(section.getByRole('link', { name: /Vreau la un antrenament/ })).toHaveAttribute('href', 'https://t.me/ParkTrialBot?start=trial_home');
      await expect(page.locator('body')).not.toContainText('Gratuit');
      if (phase === 'landing') await expect(page.locator("[data-css~=\"e3-hero\"]").getByRole('link', { name: 'Înscrie-te la eveniment' })).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (phase === 'landing') await section.screenshot({ path: `/tmp/trial-home-${width}.png` });
    });
  }
  test(`admin confirma proba fara a invita prematur la ${width}px`, async ({ page, network }) => {
    await page.setViewportSize({ width, height: 900 });
    let attended = false;
    const writes: string[] = [];
    installAdminResponses(network, {
      ...trialBrowserAdminResponses(),
      admin_trial_data: () => trialBrowserData(attended, config),
      admin_trial_attendance: () => { attended = true; writes.push('admin_trial_attendance'); return []; },
    });
    await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
    await page.goto('/admin#grup-probe');
    await page.getByRole('button', { name: /Ana Rusu/ }).click();
    await page.getByRole('button', { name: 'A venit', exact: true }).click();
    expect(writes).toEqual([]);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmă', exact: true }).click();
    await expect(page.getByText('Așteaptă răspunsul privind continuarea.')).toBeVisible();
    expect(writes).toEqual(['admin_trial_attendance']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/trial-admin-${width}.png`, fullPage: true });
  });
}

for (const width of [375, 1280]) test(`editează mesajul de probă în setări la ${width}px`, async ({ page, network }) => {
  await page.setViewportSize({ width, height: 900 });
  let saved: ReturnType<typeof trialBrowserConfig> | null = null;
  const sala = dateSala({ azi: '2026-10-08', membri: [], antrenamente: [], raspunsuri: [] });
  sala.config = { ...sala.config!, poll_days: [0, 2, 4], enabled: false };
  installAdminResponses(network, {
    ...trialBrowserAdminResponses(),
    admin_sala_date: sala,
    admin_trial_data: () => trialData({ config: saved ?? config }),
    admin_trial_config: (payload: { p_config: ReturnType<typeof trialBrowserConfig> }) => { saved = payload.p_config; return []; },
  });
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
  await page.goto('/admin#grup-bot');
  await page.getByLabel('Mesaj de editat').selectOption('reminder');
  await expect(page.getByLabel('Textul mesajului de probă', { exact: true })).toHaveValue('Te așteptăm la antrenamentul de probă:');
  await page.getByLabel('Textul mesajului de probă', { exact: true }).fill('Ne vedem mâine!\nAdu apă și energie.');
  await page.locator("[data-css~='admin-probe-copy']").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("[data-css~='admin-probe-copy']").screenshot({ path: `/tmp/trial-copy-${width}.png` });
  await page.getByRole('button', { name: 'Salvează setările probei' }).click();
  await expect.poll(() => saved?.message_texts).toEqual({ reminder: 'Ne vedem mâine!\nAdu apă și energie.' });
  await page.reload();
  await page.getByLabel('Mesaj de editat').selectOption('reminder');
  await expect(page.getByLabel('Textul mesajului de probă', { exact: true })).toHaveValue('Ne vedem mâine!\nAdu apă și energie.');
});
