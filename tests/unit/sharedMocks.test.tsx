import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminDashboard } from '../../src/admin/AdminDashboard';
import { RadacinaAdmin } from '../../src/admin/AdminApp';
import { createHandlers } from '../support/handlers';
import { participant } from '../support/builders/registrations';
import { configRow } from '../support/builders/config';
import { server } from '../support/vitest.setup';
import { adminPreviewData } from '../support/builders/preview';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

it('preview-ul păstrează probele indisponibile și comenzile botului reușite', async () => {
  server.use(...createHandlers(adminPreviewData()));
  window.location.hash = '#grup-bot';
  render(<RadacinaAdmin><AdminDashboard token="token-preview" onLogout={() => {}} /></RadacinaAdmin>);
  expect(await screen.findByText('Configurarea probelor nu este disponibilă. Verifică migrarea bazei de date și reîncarcă pagina.')).toBeTruthy();
  expect(screen.queryByLabelText('Username-ul botului')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Trimite sondajul acum' }));
  fireEvent.click(screen.getByRole('button', { name: /^Trimite$/ }));
  expect(await screen.findByText('Sondajul apare în grup în cel mult un minut.')).toBeTruthy();
});

it('dashboardul citește participantul prin handler-ele Supabase comune', async () => {
  server.use(...createHandlers({
    admin_list_registrations: [participant({ id: 'r1', nume: 'Ana Popescu', email: 'ana@exemplu.ro' })],
    admin_get_event_config: [configRow()],
  }));
  window.location.hash = '#participanti';
  render(<RadacinaAdmin><AdminDashboard token="token-test" onLogout={() => {}} /></RadacinaAdmin>);
  expect(await screen.findByText('Ana Popescu')).toBeTruthy();
});
