import { vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../../data/adminSession';
import { AdminEventTab } from '../AdminEventTab';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import type { AdminEventConfigRow } from '../api';

/**
 * Tabul „Eveniment" — editarea ciornei.
 *
 * Contractul păzit aici: nimic din ce tastează organizatorul nu ajunge pe site
 * până la „Publică", iar publicarea nu poate porni dintr-un config invalid.
 */

const {
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
  listEmailLog,
} = vi.hoisted(() => ({
  listEventConfig: vi.fn(),
  saveEventConfigDraft: vi.fn(),
  publishEventConfig: vi.fn(),
  restoreEventConfig: vi.fn(),
  listEmailLog: vi.fn(),
}));

vi.mock('../api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
  listEmailLog,
}));

const rand = (over: Partial<AdminEventConfigRow> = {}): AdminEventConfigRow => ({
  id: 'row-publicat',
  editie: SNAPSHOT_CONFIG.number,
  config: SNAPSHOT_CONFIG,
  status: 'published',
  created_at: '2026-08-01T10:00:00Z',
  published_at: '2026-08-01T10:00:00Z',
  ...over,
});

/**
 * Momente exprimate în ore FAȚĂ DE STARTUL din instantaneu, în formatul cerut de
 * `datetime-local` (fără secunde). Scrise de mână, se legau de ediția care le-a
 * inspirat și cădeau de partea greșită a validării la prima aliniere a
 * instantaneului pe ediția publicată.
 */
const fataDeStart = (ore: number): string => {
  const d = new Date(`${SNAPSHOT_CONFIG.start}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(ore * 60));
  return d.toISOString().slice(0, 16);
};

/**
 * Bara lipită de jos: regiunea `status` care ține „Publică" (și „Se publică…").
 * Aruncă dacă bara lipsește, ca o aserțiune negativă pe conținutul ei să nu
 * treacă degeaba.
 */
const baraActiuni = (): HTMLElement => {
  const bara = screen.queryAllByRole('status').find((r) => within(r).queryByRole('button', { name: /publică/i }));
  if (!bara) throw new Error('Bara de acțiuni lipsește');
  return bara;
};

/** Ce problemă arată bara: refuzul serverului (`alert`) sau câmpurile de reparat. */
const problemaDinBara = (): string => {
  const bara = baraActiuni();
  return (
    (within(bara).queryByRole('alert') ?? within(bara).queryByRole('button', { name: /de reparat/ }))
      ?.textContent ?? ''
  );
};

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);
/** Spionul se pune la fiecare test: `restoreMocks` îl desface după fiecare. */
let confirma: MockInstance<typeof window.confirm>;
/**
 * Garda „pot pleca din tab?", predată dashboardului. Aici o capturăm ca s-o
 * putem interoga: ea e ce apără ciorna nesalvată la schimbarea tabului.
 */
const gardaIesire = { curenta: null as (() => boolean) | null };
const inregistreazaGardaIesire = (g: (() => boolean) | null) => {
  gardaIesire.curenta = g;
};

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={onAuthError} showToast={showToast}>
      <AdminEventTab inregistreazaGardaIesire={inregistreazaGardaIesire} />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => {
  vi.clearAllMocks();
  gardaIesire.curenta = null;
  // Ciorna nesalvată întreabă înainte să dispară. Implicit răspundem „da", ca
  // testele care nu sînt despre gardă să treacă prin ea neschimbate; cele care
  // SÎNT despre ea își pun propriul răspuns.
  confirma = vi.spyOn(window, 'confirm').mockReturnValue(true);
  listEventConfig.mockResolvedValue([rand()]);
  saveEventConfigDraft.mockResolvedValue('draft-id');
  publishEventConfig.mockResolvedValue('pub-id');
  restoreEventConfig.mockResolvedValue('restored-id');
  // Jurnal gol = „am citit și n-a plecat nimic", starea reală a proiectului:
  // niciun rând `broadcast` n-a existat vreodată în `email_log`.
  listEmailLog.mockResolvedValue([]);
});

afterEach(cleanup);

/** Deschide ciorna pornind de la ediția publicată. */
const deschideCiorna = async () => {
  randeaza();
  const buton = await screen.findByRole('button', {
    name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
  });
  fireEvent.click(buton);
  // Grupurile pornesc pliate. Testele de mai jos sînt despre reguli (validare,
  // salvare, publicare), nu despre plierea în sine, deci le deschidem pe toate
  // — exact ce face și organizatorul când vrea să vadă tot documentul.
  // Plierea are propriul bloc de teste, mai jos.
  deschideGrupurile();
};

/** Deschide dialogul de ediție nouă, de pe ecranul fără ciornă. */
const deschideDialogEditieNoua = async () => {
  randeaza();
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(`Ciornă pentru ediția ${SNAPSHOT_CONFIG.number + 1}`),
    })
  );
};

/** Parcurge dialogul până la ciorna deschisă în formular. */
const creeazaPrinDialog = async (data = '2026-10-03', ora = '07:00', locuri?: string) => {
  await deschideDialogEditieNoua();
  fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: data } });
  fireEvent.change(screen.getByLabelText('Ora startului'), { target: { value: ora } });
  if (locuri !== undefined) {
    fireEvent.change(screen.getByLabelText('Locuri'), { target: { value: locuri } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Creează ciorna' }));
};

/** Deschide fiecare grup încă pliat. */
const deschideGrupurile = () => {
  for (const cap of screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-controls'))) {
    if (cap.getAttribute('aria-expanded') === 'false') fireEvent.click(cap);
  }
};

const camp = (eticheta: string | RegExp): HTMLInputElement =>
  screen.getByLabelText(eticheta) as HTMLInputElement;

/**
 * Textul erorii afișate SUB un câmp, ajuns la prin `aria-describedby`.
 *
 * Trecem prin legătura de accesibilitate, nu prin clasa CSS: dacă mesajul e
 * pus lângă câmp dar nu e legat de el, un cititor de ecran n-o să-l anunțe
 * niciodată — iar testul trebuie să prindă exact asta.
 */
const eroareaCampului = (eticheta: string | RegExp): string => {
  const descris = camp(eticheta).getAttribute('aria-describedby') ?? '';
  return descris
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
};

export { rand, fataDeStart, baraActiuni, problemaDinBara, showToast, confirma, gardaIesire, randeaza, deschideCiorna, deschideDialogEditieNoua, creeazaPrinDialog, deschideGrupurile, camp, eroareaCampului, listEventConfig, saveEventConfigDraft, publishEventConfig, restoreEventConfig };
