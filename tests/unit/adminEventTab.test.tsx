import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { AdminEventTab } from '../../src/admin/AdminEventTab';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import type { AdminEventConfigRow } from '../../src/lib/adminApi';

/**
 * Tabul „Eveniment" — editarea ciornei.
 *
 * Contractul păzit aici: nimic din ce tastează organizatorul nu ajunge pe site
 * până la „Publică", iar publicarea nu poate porni dintr-un config invalid.
 */

const { listEventConfig, saveEventConfigDraft, publishEventConfig, restoreEventConfig } =
  vi.hoisted(() => ({
    listEventConfig: vi.fn(),
    saveEventConfigDraft: vi.fn(),
    publishEventConfig: vi.fn(),
    restoreEventConfig: vi.fn(),
  }));

vi.mock('../../src/lib/adminApi', () => ({
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
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

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);

const randeaza = () =>
  render(<AdminEventTab token="t" onAuthError={onAuthError} showToast={showToast} />);

beforeEach(() => {
  vi.clearAllMocks();
  listEventConfig.mockResolvedValue([rand()]);
  saveEventConfigDraft.mockResolvedValue('draft-id');
  publishEventConfig.mockResolvedValue('pub-id');
  restoreEventConfig.mockResolvedValue('restored-id');
});

afterEach(cleanup);

/** Deschide ciorna pornind de la ediția publicată. */
const deschideCiorna = async () => {
  randeaza();
  const buton = await screen.findByRole('button', {
    name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
  });
  fireEvent.click(buton);
};

const camp = (eticheta: string | RegExp): HTMLInputElement =>
  screen.getByLabelText(eticheta) as HTMLInputElement;

describe('starea inițială', () => {
  it('arată ediția publicată fără să deschidă o ciornă', async () => {
    randeaza();
    expect(await screen.findByText(`Ediția ${SNAPSHOT_CONFIG.number}`)).toBeTruthy();
    expect(screen.getByText(/Nicio ciornă deschisă/)).toBeTruthy();
  });

  it('spune ce vede vizitatorul acum', async () => {
    randeaza();
    expect(await screen.findByText('Landing')).toBeTruthy();
  });

  it('nu salvează și nu publică nimic doar prin deschiderea tabului', async () => {
    randeaza();
    await screen.findByText(/Nicio ciornă deschisă/);
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });
});

describe('ciorna pentru ediția următoare', () => {
  it('o ciornă cu ALT număr decât ediția publicată e găsită și încărcată', async () => {
    // Regresie: `admin_get_event_config` filtra pe ediția curentă, deci ciorna
    // ediției următoare — care are prin construcție alt număr — era invizibilă.
    // Ciorna salvată „dispărea" la reîncărcare și preview-ul cădea pe publicat.
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-6',
        editie: SNAPSHOT_CONFIG.number + 1,
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, number: SNAPSHOT_CONFIG.number + 1 },
      }),
      rand(),
    ]);
    randeaza();
    // Formularul se deschide singur pe ciorna existentă, fără să apeși nimic.
    await waitFor(() =>
      expect(camp('Ediția evenimentului').value).toBe(String(SNAPSHOT_CONFIG.number + 1))
    );
  });

  it('pornește de la cea publicată, cu ediția incrementată', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Ciornă pentru ediția ${SNAPSHOT_CONFIG.number + 1}`),
      })
    );
    expect(camp('Ediția evenimentului').value).toBe(String(SNAPSHOT_CONFIG.number + 1));
    // Locul se păstrează ca punct de plecare, nu se golește.
    expect(camp('Locul — nume').value).toBe(SNAPSHOT_CONFIG.venue.name);
  });
});

describe('editarea nu atinge site-ul', () => {
  it('tastarea nu trimite nimic la server', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('„Salvează ciorna" trimite documentul editat', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează ciorna' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, editie, doc] = saveEventConfigDraft.mock.calls[0];
    expect(editie).toBe(SNAPSHOT_CONFIG.number);
    expect(doc.eventName).toBe('Winter Trial');
    // Publicarea rămâne un act separat.
    expect(publishEventConfig).not.toHaveBeenCalled();
  });
});

describe('validarea blochează publicarea', () => {
  it('un deadline după start dezactivează „Publică" și spune de ce', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Deadline înscriere'), { target: { value: '2026-08-22T09:00:00' } });

    expect(screen.getByText(/nu poate fi după startul cursei/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvează ciorna' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('coordonate scrise ca text sunt respinse', async () => {
    await deschideCiorna();
    fireEvent.change(camp(/coordonate/), { target: { value: 'Valea Morilor' } });
    // Doar în bannerul de erori — „lat,lng" apare și în eticheta câmpului.
    const banner = document.querySelector('.admin-banner.warn') as HTMLElement;
    expect(within(banner).getByText(/lat,lng/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);
  });

  it('corectarea reactivează publicarea', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Deadline înscriere'), { target: { value: '2026-08-22T09:00:00' } });
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(camp('Deadline înscriere'), { target: { value: '2026-08-22T07:00:00' } });
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('avertismentele nu blochează', () => {
  it('ediția de lansare înaintea celei a evenimentului avertizează, dar lasă publicarea', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Ediția de lansare'), {
      target: { value: String(SNAPSHOT_CONFIG.number + 1) },
    });
    expect(screen.getByText(/confirmare/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('publicarea cere confirmare și spune ce urmează', () => {
  it('confirmarea numește ce va vedea vizitatorul', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/landing-ul cu înscrieri/)).toBeTruthy();
    // Share preview-ul rămâne pe build — spus explicit, nu ascuns.
    expect(within(dialog).getByText(/share preview/i)).toBeTruthy();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('Coming Soon e numit ca atare în confirmare', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText('Homepage-ul arată'), { target: { value: 'soon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    expect(within(screen.getByRole('alertdialog')).getByText('Coming Soon')).toBeTruthy();
  });

  it('anularea nu publică nimic', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('confirmarea publică ediția ciornei', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledWith('t', SNAPSHOT_CONFIG.number));
  });
});

describe('refuzurile serverului ajung la organizator', () => {
  it('ascunderea înscrierii cât timp e deschisă e explicată, nu doar „a eșuat"', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('Supabase 400: registration_hidden_while_open: inscrierile sunt deschise pana la ...')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        kind: 'error',
        msg: expect.stringMatching(/nu poți ascunde secțiunea de înscriere/i),
      })
    );
  });

  it('un config respins de server e raportat cu motivul lui', async () => {
    saveEventConfigDraft.mockRejectedValue(
      new Error('Supabase 400: config_invalid: capacitatea trebuie sa fie pozitiva')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează ciorna' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        kind: 'error',
        msg: expect.stringMatching(/capacitatea trebuie sa fie pozitiva/),
      })
    );
  });
});

describe('aranjarea secțiunilor', () => {
  it('mută o secțiune și renumerotează', async () => {
    await deschideCiorna();
    const randuri = screen.getAllByRole('listitem');
    expect(randuri[0].textContent).toContain('Formatul');

    fireEvent.click(screen.getByRole('button', { name: /Mută „Locația" mai sus/ }));
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Locația');
  });

  it('ascunderea scoate numărul și marchează rândul', async () => {
    await deschideCiorna();
    const randVenue = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('Locația'))!;
    fireEvent.click(within(randVenue).getByRole('button', { name: 'Ascunde' }));

    const dupa = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('Locația'))!;
    expect(dupa.className).toContain('ascunsa');
    expect(within(dupa).getByRole('button', { name: 'Arată' })).toBeTruthy();
  });
});

describe('versiuni anterioare', () => {
  it('o versiune înlocuită poate fi readusă', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'veche', status: 'superseded', published_at: '2026-07-01T09:00:00Z' }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Revino la asta' }));
    await waitFor(() => expect(restoreEventConfig).toHaveBeenCalledWith('t', 'veche'));
  });

  it('fără versiuni înlocuite, secțiunea nu apare', async () => {
    randeaza();
    await screen.findByText(/Nicio ciornă deschisă/);
    expect(screen.queryByText('Versiuni anterioare')).toBeNull();
  });
});
