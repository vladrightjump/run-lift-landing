import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { GrupRemindere } from '../../src/admin/eventTab/grupuri/GrupRemindere';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import type { LivrareReminder } from '../../src/admin/remindere';
import {
  SNAPSHOT_CONFIG,
  REMINDER_GRACE_HOURS,
  type EventConfig,
  type ReminderEntry,
} from '../../src/content/eventConfig';

/**
 * Ce vede organizatorul, nu ce calculează funcția.
 *
 * Miza e că `remindere.ts` poate fi perfect corect iar ecranul să mintă în
 * continuare: pictograma, stilul notei și verbul ecoului enumerau stările pe
 * nume, cu o ramură implicită. O stare nouă cădea pe „✓". Adică `neplecat` —
 * starea inventată tocmai ca să arate că reminderul n-a plecat — s-ar fi
 * randat cu bifă verde, sub un ecou care scrie „pleacă joi".
 *
 * `acum` e prop, deci testele nu depind de ziua în care rulează și n-au nevoie
 * de ceas fals.
 */

const ORA = 3_600_000;
const START = new Date(`${SNAPSHOT_CONFIG.start}${SNAPSHOT_CONFIG.tz}`).getTime();

/** Scadența celui de 24h a trecut cu o oră peste grație. */
const DUPA_GRATIE = START - 24 * ORA + (REMINDER_GRACE_HOURS + 1) * ORA;
const IN_FEREASTRA = START - 23 * ORA;

const rem = (offsetHours: number, enabled = true): ReminderEntry => ({
  offsetHours,
  enabled,
  template: 'bulk_participant_reminder',
});

const livr = (
  la: number,
  status: 'trimis' | 'esuat' = 'trimis'
): LivrareReminder => ({ sablon: 'bulk_participant_reminder', status, la });

let radacina: HTMLElement;
const showToast = vi.fn();
const seteazaRemindere = vi.fn();

beforeEach(() => {
  showToast.mockClear();
  seteazaRemindere.mockClear();
});

/** Capacul grupului: și butonul de pliere, și locul unde stă rezumatul. */
const capul = (): HTMLElement =>
  radacina.querySelector('.admin-config-grup-cap') as HTMLElement;

/**
 * `deschide: false` lasă grupul pliat — rezumatul de pe capac ține locul
 * câmpurilor doar cât timp e închis, deci testele lui nu-l pot deschide.
 */
const randeaza = (
  livrari: LivrareReminder[] | null,
  acum = DUPA_GRATIE,
  reminders = [rem(24)],
  deschide = true
) => {
  const ciorna: EventConfig = { ...SNAPSHOT_CONFIG, reminders };
  const r = render(
    // Grupul cere sesiunea pentru `showToast`: ștergerea unui rând se poate
    // anula din toast.
    <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={showToast}>
      <GrupRemindere
        ciorna={ciorna}
        seteazaRemindere={seteazaRemindere}
        erori={new Map()}
        acum={acum}
        livrari={livrari}
      />
    </FurnizorSesiuneAdmin>
  );
  radacina = r.container;
  if (deschide) fireEvent.click(capul());
  return r;
};

/** Primul rând de orar — semnul, ecoul și nota stau toate în el. */
const rand = (): HTMLElement =>
  radacina.querySelectorAll('li')[0] as HTMLElement;

const nota = (): HTMLElement | null => rand().querySelector('[role="status"]');
const ecoul = (): string => rand().querySelector('.admin-config-ecou')?.textContent ?? '';

describe('GrupRemindere — rândul nu mai poate afirma o livrare inexistentă', () => {
  it('neplecat NU primește bifă', () => {
    randeaza([]);
    expect(within(rand()).queryByText('✓')).toBeNull();
    expect(within(rand()).getByText('!')).toBeTruthy();
  });

  it('neplecat își spune nota ca eroare, cu rol de status', () => {
    randeaza([]);
    expect(nota()?.textContent).toContain('runlift_reminder');
    expect(nota()?.className).toContain('admin-config-eroare');
  });

  it('neplecat nu mai spune „pleacă" la prezent', () => {
    randeaza([]);
    expect(ecoul()).toContain('trebuia să plece');
    expect(ecoul()).not.toMatch(/^pleacă /);
  });

  it('trimis primește bifă și verbul la trecut', () => {
    randeaza([livr(IN_FEREASTRA)]);
    expect(within(rand()).getByText('✓')).toBeTruthy();
    expect(ecoul()).toContain('a plecat');
    // O livrare confirmată nu e o problemă de reparat.
    expect(nota()).toBeNull();
  });

  it('esuat e semnalat ca eroare, nu ca livrare', () => {
    randeaza([livr(IN_FEREASTRA, 'esuat')]);
    expect(within(rand()).getByText('!')).toBeTruthy();
    expect(nota()?.textContent).toContain('Livrare');
  });

  /**
   * Garda din KTD-F, la nivel de ecran: pe un jurnal indisponibil rândul cade
   * pe comportamentul de dinainte („ratat"), fără să afirme nici livrare, nici
   * absența ei.
   */
  it('jurnal indisponibil: rămâne pe comportamentul de azi', () => {
    randeaza(null);
    expect(nota()?.textContent).toContain('NU mai pleacă');
    expect(nota()?.textContent).not.toContain('runlift_reminder');
  });

  it('programat rămâne exact cum arăta', () => {
    randeaza([], START - 30 * ORA);
    expect(within(rand()).getByText('✓')).toBeTruthy();
    expect(ecoul()).toMatch(/^pleacă /);
    expect(nota()).toBeNull();
  });
});

describe('GrupRemindere — rezumatul de pe capac', () => {
  const rezumatul = () => capul().textContent ?? '';

  it('un rând neplecat nu se numără ca „activ"', () => {
    randeaza([], DUPA_GRATIE, [rem(24)], false);
    expect(rezumatul()).not.toContain('1 activ');
    expect(rezumatul()).toContain('niciunul nu mai pleacă');
  });

  /**
   * Regresia propriu-zisă: înainte, rezumatul spunea „1 activ · următorul
   * peste X" pentru un orar din care nu pleca nimic, fiindcă `pg_cron` nu
   * exista în proiect.
   */
  it('numără doar rândurile care chiar mai pot pleca', () => {
    // Cel de 24h e neplecat; cel de 3h e încă programat.
    randeaza([], DUPA_GRATIE, [rem(24), rem(3)], false);
    expect(rezumatul()).toContain('1 activ');
    expect(rezumatul()).not.toContain('2 active');
  });
});

/**
 * Ștergerea unui rând se aplica pe loc, fără confirmare și fără cale înapoi.
 * Undo, nu confirmare: o întrebare la fiecare ștergere e o întrebare pe care o
 * închizi fără s-o citești.
 */
describe('ștergerea se poate anula', () => {
  it('ștergerea scoate rândul și oferă undo', () => {
    randeaza(null, DUPA_GRATIE, [rem(24), rem(3)]);
    const stergeri = radacina.querySelectorAll('button[aria-label^="Șterge"]');
    fireEvent.click(stergeri[0]);

    expect(seteazaRemindere).toHaveBeenCalledWith([rem(3)]);
    const toast = showToast.mock.calls.at(-1)?.[0];
    expect(toast.msg).toContain('24');
    expect(typeof toast.undo).toBe('function');
  });

  it('undo-ul repune rândul cu avansul, șablonul și starea lui', () => {
    const oprit: ReminderEntry = {
      offsetHours: 3,
      enabled: false,
      template: 'bulk_participant_reminder_final',
    };
    randeaza(null, DUPA_GRATIE, [rem(24), oprit]);
    const stergeri = radacina.querySelectorAll('button[aria-label^="Șterge"]');
    fireEvent.click(stergeri[1]);

    showToast.mock.calls.at(-1)?.[0].undo();
    expect(seteazaRemindere).toHaveBeenLastCalledWith([rem(24), oprit]);
  });
});
