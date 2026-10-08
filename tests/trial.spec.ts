import { test, expect } from '@playwright/test';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

const config = { enabled: true, bot_username: 'ParkTrialBot', welcome_text: 'Bine ai venit!', trial_conditions: 'Vino cu 10 minute înainte.', trial_price: '100 MDL', bring_text: 'Apă și prosop.', continuation_conditions: 'Discutăm abonamentul.', duration_minutes: 60, organizer_telegram_id: 123, contact_text: 'Scrie-ne pe Instagram.', permissions_verified_at: new Date().toISOString() };
for (const width of [375, 1280]) {
  for (const phase of ['landing', 'soon', 'leaderboard', 'next']) {
    test(`intrare Telegram ${phase} la ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/rest/v1/rpc/*', route => {
        const name = route.request().url().split('/').pop();
        const value = name === 'public_trial_config' ? { enabled: true, bot_username: config.bot_username, contact_text: config.contact_text }
          : name === 'public_stats' ? { count: 0, participants: [], waitlist: 0 } : null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      });
      await page.goto(`/?preview=${phase}`);
      const section = page.getByRole('region', { name: 'Primul tău antrenament cu noi.' });
      await expect(section).toBeVisible();
      await expect(section.getByRole('link', { name: /Vreau la un antrenament/ })).toHaveAttribute('href', 'https://t.me/ParkTrialBot?start=trial_home');
      await expect(page.locator('body')).not.toContainText('Gratuit');
      if (phase === 'landing') await expect(page.locator('.e3-hero').getByRole('link', { name: 'Înscrie-te la eveniment' })).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (phase === 'landing') await section.screenshot({ path: `/tmp/trial-home-${width}.png` });
    });
  }
  test(`admin confirma proba fara a invita prematur la ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let attended = false;
    const writes: string[] = [];
    await page.route('**/rest/v1/rpc/*', async route => {
      const name = route.request().url().split('/').pop()!;
      if (name === 'admin_trial_attendance') { attended = true; writes.push(name); }
      const data = { config, prospects: [{ id: 'p1', full_name: 'Ana Rusu', telegram_user_id: 456, telegram_username: 'ana', source: 'home', stage: attended ? 'attended' : 'awaiting_attendance', dm_enabled: true }], bookings: [{ id: 'b1', prospect_id: 'p1', version: 1, status: attended ? 'attended' : 'awaiting_attendance', session_start: '2026-10-08T03:30:00Z', session_location: 'Parcul Dumitru Râșcanu', attendance_at: attended ? new Date().toISOString() : null, continuation: null }], questions: [], messages: [], invitations: [], organizers: [{ id: 'a1', full_name: 'Vlad', telegram_user_id: 123 }] };
      const value = name === 'admin_check_token' ? true : name === 'admin_trial_data' ? data : name === 'admin_list_editions' ? [{ editie: SNAPSHOT_CONFIG.number, participanti: 0, asteptare: 0, lansare: 0, prima: null, ultima: null, este_curenta: true }] : name === 'admin_sala_date' ? { azi: '2026-10-08', config: null, membri: [], antrenamente: [], raspunsuri: [], necunoscuti: [], comenzi: [], scoateri: [] } : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
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
