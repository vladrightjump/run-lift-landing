import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LiniaDeTimp } from '../../src/admin/LiniaDeTimp';
import { EventConfigProvider } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../src/content/eventConfig';
import type { SemnaleAdmin } from '../../src/admin/stareCurenta';

/**
 * Linia de timp — primul lucru de pe ecran în backoffice.
 *
 * Contractul păzit aici: starea fiecărui nod se citește ca text, nu doar ca
 * marcaj vizual; acțiunea stă pe nodul de care ține; iar o ediție de arhivă se
 * vede întreagă fără să ofere nimic de apăsat.
 */

/**
 * O ediție măsurată față de ACUM, nu scrisă ca dată.
 *
 * `SNAPSHOT_CONFIG` are startul pe 19 septembrie 2026. Testele astea citesc
 * ceasul real (prin `useNow`), deci pe un instantaneu cu dată fixă ar fi trecut
 * verzi în ziua scrierii și ar fi picat a doua zi, când toate reperele devin
 * trecute și niciunul nu mai „urmează". Aceeași capcană pe care seed-ul SQL a
 * plătit-o o dată deja (vezi `tests/unit/sql/db.ts`).
 */
const peste = (ore: number): string => {
  const d = new Date(Date.now() + ore * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`
  );
};

/** Start peste 48h, cu anunțul deja consumat — o ediție în plină desfășurare. */
const EDITIE: EventConfig = {
  ...SNAPSHOT_CONFIG,
  tz: '+00:00',
  showComingSoon: true,
  launchAt: peste(-24),
  registrationDeadline: peste(47),
  checkinFrom: '06:45',
  start: peste(48),
  nextEditionAt: peste(200),
  reminders: [],
};

const fara: SemnaleAdmin = {
  nelivrate: 0,
  asteptare: 0,
  ciornaNepublicata: false,
  metaInUrma: false,
  arhiva: false,
};

const onTab = vi.fn();
const onEditieNoua = vi.fn();

const randeaza = (o: { config?: EventConfig; semnale?: SemnaleAdmin; arhiva?: boolean } = {}) =>
  render(
    <EventConfigProvider override={o.config ?? EDITIE}>
      <LiniaDeTimp
        semnale={o.semnale ?? fara}
        onTab={onTab}
        onEditieNoua={onEditieNoua}
        arhiva={o.arhiva ?? false}
      />
    </EventConfigProvider>
  );

const noduri = (): HTMLElement[] => Array.from(document.querySelectorAll('.admin-linie-nod'));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('nodurile', () => {
  it('apar în ordine cronologică, nu în ordinea câmpurilor', () => {
    randeaza();
    const etichete = noduri().map((n) => n.querySelector('.admin-linie-nume')?.textContent);
    expect(etichete).toContain('Startul cursei');
    expect(etichete.indexOf('Se închid înscrierile')).toBeLessThan(
      etichete.indexOf('Startul cursei')
    );
  });

  it('include reperele pe care formularul nu le arată — „cine vine" și reminderele', () => {
    const etichete = () =>
      noduri().map((n) => n.querySelector('.admin-linie-nume')?.textContent ?? '');
    randeaza({
      config: {
        ...EDITIE,
        reminders: [{ offsetHours: 24, enabled: true, template: 'bulk_participant_reminder' }],
      },
    });
    expect(etichete().some((e) => e.includes('cine vine'))).toBe(true);
    expect(etichete().some((e) => e.includes('reminderul'))).toBe(true);
  });

  it('starea fiecărui nod se citește ca text, nu doar ca marcaj', () => {
    // R11: „spune starea în cuvinte". Un punct colorat satisface cerința doar
    // pentru cine vede culoarea.
    randeaza();
    const stari = noduri().map((n) => n.querySelector('.admin-linie-stare')?.textContent);
    expect(stari.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
    expect(stari).toContain('a trecut');
  });

  it('exact un nod e marcat drept următorul', () => {
    randeaza();
    const urmeaza = noduri()
      .map((n) => n.querySelector('.admin-linie-stare')?.textContent)
      .filter((s) => s === 'urmează');
    expect(urmeaza).toHaveLength(1);
  });

  it('un nod cu problemă își poartă semnalul pe el', () => {
    randeaza({
      config: { ...EDITIE, checkinFrom: '09:00' },
    });
    const cuSemnal = noduri().filter((n) => n.querySelector('.admin-linie-semnal'));
    expect(cuSemnal.length).toBeGreaterThan(0);
  });
});

describe('acțiunile', () => {
  it('nodul înscrierilor duce la lista de participanți', () => {
    randeaza();
    fireEvent.click(screen.getByRole('button', { name: /Vezi lista/ }));
    expect(onTab).toHaveBeenCalledWith('participanti');
  });

  it('ultimul nod pornește ediția următoare, fără să ceară un tab', () => {
    randeaza();
    fireEvent.click(screen.getByRole('button', { name: /Pornește ediția următoare/ }));
    expect(onEditieNoua).toHaveBeenCalled();
  });
});

describe('ediția de arhivă', () => {
  it('nodurile se văd, dar nicio acțiune de scriere nu se oferă', () => {
    randeaza({ arhiva: true, semnale: { ...fara, arhiva: true } });

    expect(noduri().length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Pornește ediția următoare/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editează/ })).toBeNull();
  });

  it('citirea rămâne — saltul spre listă nu e o scriere', () => {
    randeaza({ arhiva: true, semnale: { ...fara, arhiva: true } });
    expect(screen.getByRole('button', { name: /Vezi lista/ })).toBeDefined();
  });
});

describe('semnalele de atenție', () => {
  it('un email nelivrat apare și duce la tabul care-l rezolvă', () => {
    randeaza({ semnale: { ...fara, nelivrate: 2 } });
    fireEvent.click(screen.getByRole('button', { name: /emailuri n-au ajuns/ }));
    expect(onTab).toHaveBeenCalledWith('livrare');
  });

  it('fără niciun semnal, spune asta în loc să tacă', () => {
    randeaza();
    expect(screen.getByText(/Nimic care să ceară atenție/)).toBeDefined();
  });
});

describe('un document stricat', () => {
  it('nu desenează o ordine calculată din NaN', () => {
    randeaza({ config: { ...EDITIE, nextEditionAt: 'mâine' } });
    expect(noduri()).toHaveLength(0);
    expect(screen.getByText(/nu se poate desena/i)).toBeDefined();
  });
});
