import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { AdminComingSoonTab } from './AdminComingSoonTab';
import { EventConfigProvider } from '../../../../shared/lib/useEventConfig';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../../../shared/content/eventConfig';
import type { AdminEventConfigRow } from '../evenimente/api';

/**
 * Panoul „Coming Soon" — singurul loc din admin cu efect IMEDIAT pe site.
 *
 * Contractul păzit aici: nimic nu pleacă fără confirmare, ce pleacă e exact ce
 * s-a setat, iar ciorna deschisă (care ar suprascrie totul la publicare) e
 * anunțată înainte, nu descoperită după.
 */

const { listEventConfig, setComingSoon, setHomepageOrder, loadPublicHomepage } = vi.hoisted(() => ({
  listEventConfig: vi.fn(),
  setComingSoon: vi.fn(),
  setHomepageOrder: vi.fn(),
  loadPublicHomepage: vi.fn(),
}));

vi.mock('../evenimente/api', () => ({ listEventConfig }));
vi.mock('./api', () => ({ setComingSoon, setHomepageOrder }));
vi.mock('../../../../shared/lib/homepagePublic', () => ({ loadPublicHomepage }));

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);

const PUBLICAT: EventConfig = {
  ...SNAPSHOT_CONFIG,
  showComingSoon: true,
  // Mult în viitor, ca faza să fie „coming-soon" indiferent când rulează testul.
  launchAt: '2099-08-19T12:00:00',
};

const randeaza = (config: EventConfig = PUBLICAT) =>
  render(
    <EventConfigProvider override={config}>
      <FurnizorSesiuneAdmin token="t" onAuthError={onAuthError} showToast={showToast}>
        <AdminComingSoonTab />
      </FurnizorSesiuneAdmin>
    </EventConfigProvider>
  );

/** Butonul de trimitere, tipat — repo-ul n-are `jest-dom`, deci fără matchere DOM. */
const butonAplica = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /Aplică acum/ }) as HTMLButtonElement;

const rand = (over: Partial<AdminEventConfigRow> = {}): AdminEventConfigRow => ({
  id: 'row',
  editie: SNAPSHOT_CONFIG.number,
  config: PUBLICAT,
  status: 'published',
  created_at: '2026-08-01T10:00:00Z',
  published_at: '2026-08-01T10:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  listEventConfig.mockResolvedValue([rand()]);
  setComingSoon.mockResolvedValue('id-nou');
  setHomepageOrder.mockResolvedValue(undefined);
  loadPublicHomepage.mockResolvedValue({ trialFirst: false, trainingLocation: null });
});

afterEach(cleanup);

describe('excepția declarată', () => {
  it('spune pe ecran că are efect imediat', async () => {
    // R15: celelalte ecrane de conținut au ciornă și publicare. Ăsta n-are, și
    // o spune — nu o lasă dedusă din lipsa unui buton.
    randeaza();
    expect(await screen.findByText(/efect imediat/i)).toBeDefined();
    expect(screen.getByText(/nu există ciornă/i)).toBeDefined();
  });

  it('nu oferă „Publică" — n-ar avea ce publica', async () => {
    randeaza();
    await screen.findByText(/efect imediat/i);
    expect(screen.queryByRole('button', { name: 'Publică' })).toBeNull();
  });
});

describe('spune ce vede vizitatorul ACUM', () => {
  it('cu Coming Soon pornit și anunțul în viitor, arată „Coming Soon"', async () => {
    randeaza();
    await waitFor(() => expect(screen.getAllByText('Coming Soon').length).toBeGreaterThan(0));
    expect(screen.getByText('Acum vizitatorul vede').parentElement?.textContent).toContain(
      'Coming Soon'
    );
  });

  it('cu anunțul deja trecut, comutatorul zice una și site-ul alta — și o spunem', async () => {
    // Capcana reală: `showComingSoon` e true, dar ceasul a trecut de `launchAt`,
    // deci `App.tsx` randează deja landing-ul. Fără nota asta, organizatorul
    // apasă degeaba pe comutator.
    randeaza({ ...PUBLICAT, launchAt: '2020-01-01T12:00:00' });
    expect(screen.getByText('Acum vizitatorul vede').parentElement?.textContent).toContain(
      'Landing'
    );
    expect(await screen.findByText(/ora anunțului a trecut/)).toBeTruthy();
  });
});

describe('nimic nu pleacă fără confirmare', () => {
  it('„Aplică acum" e inert cât timp nu s-a schimbat nimic', async () => {
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());
    expect(butonAplica().disabled).toBe(true);
  });

  it('comutarea deschide confirmarea, nu trimite direct', async () => {
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Landing, cu înscrieri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplică acum' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(setComingSoon).not.toHaveBeenCalled();
  });

  it('abia „Da, aplică" trimite, cu exact valorile setate', async () => {
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Landing, cu înscrieri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplică acum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Da, aplică' }));

    await waitFor(() =>
      expect(setComingSoon).toHaveBeenCalledWith(
        't',
        false,
        PUBLICAT.launchAt,
        PUBLICAT.nextEditionAt
      )
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'success' })
    );
  });

  it('„Anulează modificările" readuce valorile publicate', async () => {
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Landing, cu înscrieri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anulează modificările' }));

    expect(butonAplica().disabled).toBe(true);
  });
});

describe('ciorna deschisă e anunțată înainte, nu descoperită după', () => {
  it('o ciornă cu alte valori pentru aceleași chei ridică bannerul', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({
        id: 'ciorna',
        status: 'draft',
        // Ciorna ar duce pagina înapoi pe landing la publicare.
        config: { ...PUBLICAT, showComingSoon: false },
      }),
    ]);
    randeaza();
    expect(await screen.findByText(/Există o ciornă deschisă/)).toBeTruthy();
  });

  it('o ciornă care nu atinge cheile astea NU ridică bannerul', async () => {
    // Altfel bannerul ar porni aprins la orice ciornă deschisă, iar un
    // avertisment mereu prezent nu mai e citit.
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', config: { ...PUBLICAT, eventName: 'Altceva' } }),
    ]);
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());
    expect(screen.queryByText(/Există o ciornă deschisă/)).toBeNull();
  });
});

describe('refuzurile serverului ajung citibile', () => {
  it('`no_published` explică ce lipsește', async () => {
    setComingSoon.mockRejectedValue(new Error('no_published'));
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Landing, cu înscrieri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplică acum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Da, aplică' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', msg: expect.stringContaining('config publicat') })
      )
    );
  });

  it('`config_invalid` păstrează motivul serverului, nu-l reformulează', async () => {
    setComingSoon.mockRejectedValue(
      new Error('config_invalid: următorul antrenament e înainte de finalul cursei')
    );
    randeaza();
    await waitFor(() => expect(listEventConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Landing, cu înscrieri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplică acum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Da, aplică' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('următorul antrenament e înainte de finalul cursei'),
        })
      )
    );
  });
});

describe('ordinea de pe ecranul dintre ediții', () => {
  const optiune = (nume: RegExp): HTMLInputElement =>
    screen.getByRole('radio', { name: nume }) as HTMLInputElement;

  it('arată ordinea salvată pe server', async () => {
    loadPublicHomepage.mockResolvedValue({ trialFirst: true, trainingLocation: null });
    randeaza();
    await waitFor(() => expect(optiune(/Proba primul/).checked).toBe(true));
    expect(optiune(/Antrenamentul săptămânii primul/).checked).toBe(false);
  });

  it('o alegere pleacă imediat, cu tokenul sesiunii, și confirmă', async () => {
    randeaza();
    await waitFor(() => expect(optiune(/Antrenamentul săptămânii primul/).checked).toBe(true));

    fireEvent.click(optiune(/Proba primul/));

    await waitFor(() => expect(setHomepageOrder).toHaveBeenCalledWith('t', true));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }))
    );
    expect(optiune(/Proba primul/).checked).toBe(true);
  });

  it('serverul refuză: alegerea revine la cea salvată și apare eroarea', async () => {
    setHomepageOrder.mockRejectedValue(new Error('boom'));
    randeaza();
    await waitFor(() => expect(optiune(/Antrenamentul săptămânii primul/).checked).toBe(true));

    fireEvent.click(optiune(/Proba primul/));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    );
    expect(optiune(/Antrenamentul săptămânii primul/).checked).toBe(true);
  });

  it('cât timp cererea e în zbor, alegerea e blocată', async () => {
    let gata: () => void = () => {};
    setHomepageOrder.mockReturnValue(new Promise<void>((r) => (gata = r)));
    randeaza();
    await waitFor(() => expect(optiune(/Antrenamentul săptămânii primul/).checked).toBe(true));

    fireEvent.click(optiune(/Proba primul/));
    await waitFor(() => expect(optiune(/Antrenamentul săptămânii primul/).disabled).toBe(true));

    gata();
    await waitFor(() => expect(optiune(/Antrenamentul săptămânii primul/).disabled).toBe(false));
  });

  it('setarea nu se poate citi (migrare neaplicată): spune asta și nu oferă alegerea', async () => {
    loadPublicHomepage.mockRejectedValue(new Error('404'));
    randeaza();
    expect(await screen.findByText(/nu se poate citi/i)).toBeDefined();
    expect(screen.queryByRole('radio', { name: /Proba primul/ })).toBeNull();
  });
});
