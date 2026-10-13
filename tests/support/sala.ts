import type { Page } from '@playwright/test';
import type { NetworkFixture } from '@msw/playwright';
import { installAdminResponses } from './admin';
import { salaBrowser, salaBrowserResponses } from './builders/salaBrowser';

const writes = [
  'admin_sala_comanda', 'admin_sala_leaga_cont', 'admin_sala_marcheaza_verificat',
  'admin_sala_membru_din_cont', 'admin_sala_porneste_bot', 'admin_sala_salveaza_config',
  'admin_sala_salveaza_membru', 'admin_sala_scoate_din_grup', 'admin_sala_set_prezenta',
  'admin_sala_seteaza_antrenament', 'admin_sala_uneste', 'admin_sala_verifica_membri',
];

export const deschideAdminul = async (page: Page, network: NetworkFixture, ecran = '', sala = salaBrowser()) => {
  const scrieri: { rpc: string; corp: Record<string, unknown> }[] = [];
  installAdminResponses(network, {
    ...salaBrowserResponses(sala),
    ...Object.fromEntries(writes.map(rpc => [rpc, (corp: Record<string, unknown>) => {
      scrieri.push({ rpc, corp });
      return null;
    }])),
  });
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
  await page.goto(`/admin${ecran}`);
  return scrieri;
};
