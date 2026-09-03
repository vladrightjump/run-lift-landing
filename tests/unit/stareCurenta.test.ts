import { describe, it, expect } from 'vitest';
import { fazaSite, repere, semnaleDeAtentie, stareCurenta } from '../../src/admin/stareCurenta';
import type { SemnaleAdmin } from '../../src/admin/stareCurenta';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import { deriveEditionDates, type EditionDates } from '../../src/lib/config';
import type { EventConfig } from '../../src/content/eventConfig';

/**
 * Panoul „Acum" din backoffice.
 *
 * Contractul păzit aici: faza pe care o raportează adminul e ACEEAȘI cu cea pe
 * care o randează pagina publică. Dacă cele două se despart, backoffice-ul
 * devine mai rău decât inutil — spune cu încredere ceva fals despre site.
 */

const config = (over: Partial<EventConfig> = {}): EventConfig => ({
  ...SNAPSHOT_CONFIG,
  ...over,
});

const la = (c: EventConfig, local: string) => new Date(`${local}${c.tz}`).getTime();

/**
 * Momentele se derivă din repere, nu se scriu de mână. Un „2026-08-20T10:00:00"
 * era corect doar cât timp instantaneul rămânea pe ediția 5: la prima aliniere
 * pe ediția publicată cădea în altă fază și testul pica fără ca regula să se fi
 * schimbat.
 */
const inainteDeAnunt = (d: EditionDates) => d.LAUNCH_DATE.getTime() - 86_400_000;
const intreAnuntSiCursa = (d: EditionDates) =>
  Math.floor((d.LAUNCH_DATE.getTime() + d.LEADERBOARD_DATE.getTime()) / 2);

const fara: SemnaleAdmin = {
  nelivrate: 0,
  asteptare: 0,
  ciornaNepublicata: false,
  metaInUrma: false,
  arhiva: false,
};

describe('faza site-ului', () => {
  it('înainte de anunț, cu Coming Soon pornit: Coming Soon', () => {
    const c = config({ showComingSoon: true });
    const d = deriveEditionDates(c);
    expect(fazaSite(c, d, inainteDeAnunt(d))).toBe('coming-soon');
  });

  it('Coming Soon oprit: landing chiar și înainte de momentul anunțului', () => {
    // Poarta de lansare e a configului, nu a ceasului: cu comutatorul pe
    // „landing", `launchAt` nu mai ascunde nimic.
    const c = config({ showComingSoon: false });
    const d = deriveEditionDates(c);
    expect(fazaSite(c, d, inainteDeAnunt(d))).toBe('landing');
  });

  it('după anunț și înainte de fereastra cursei: landing', () => {
    const c = config({ showComingSoon: true });
    const d = deriveEditionDates(c);
    expect(fazaSite(c, d, intreAnuntSiCursa(d))).toBe('landing');
  });

  it('în fereastra de dinaintea startului: „cine vine"', () => {
    const c = config();
    const d = deriveEditionDates(c);
    // Exact pe graniță faza nouă câștigă — la fel ca `usePagePhase`, care
    // citește `done` de la countdown și nu lasă niciun moment fără fază.
    expect(fazaSite(c, d, d.LEADERBOARD_DATE.getTime())).toBe('cine-vine');
  });

  it('după finalul cursei: numărătoare spre următorul antrenament', () => {
    const c = config();
    const d = deriveEditionDates(c);
    expect(fazaSite(c, d, d.EVENT_END_DATE.getTime())).toBe('dupa-cursa');
  });
});

describe('reperele', () => {
  it('sunt în ordine cronologică', () => {
    const c = config();
    const lista = repere(c, deriveEditionDates(c));
    const momente = lista.map((r) => r.moment.getTime());
    expect([...momente].sort((a, b) => a - b)).toEqual(momente);
  });

  it('fără Coming Soon, momentul anunțului nu mai e un reper', () => {
    // Nu se mai întâmplă nimic vizibil atunci — l-am arăta ca pe o promisiune.
    const c = config({ showComingSoon: false });
    const etichete = repere(c, deriveEditionDates(c)).map((r) => r.eticheta);
    expect(etichete).not.toContain('se anunță ediția');
  });

  it('„urmează" e primul reper care n-a trecut', () => {
    // Deadline-ul e mutat cu o zi înaintea cursei ca ordinea să fie neambiguă.
    // În configul livrat, înscrierile se închid FIX la start, deci reperul
    // „cine vine" (care e cu ore înainte) e cel următor — corect, dar n-ar
    // testa nimic despre alegerea primului reper.
    const c = config({ showComingSoon: true, registrationDeadline: '2026-08-21T12:00:00' });
    const d = deriveEditionDates(c);
    const stare = stareCurenta(c, d, la(c, '2026-08-20T10:00:00'), fara);
    expect(stare.urmatorul?.eticheta).toBe('se închid înscrierile');
  });

  it('după ultimul reper nu mai inventează unul', () => {
    const c = config();
    const d = deriveEditionDates(c);
    const stare = stareCurenta(c, d, d.NEXT_EDITION_DATE.getTime() + 1000, fara);
    expect(stare.urmatorul).toBeNull();
  });
});

describe('semnalele de atenție', () => {
  it('emailurile nelivrate sunt urgente și duc la tabul „Livrare"', () => {
    const [semnal] = semnaleDeAtentie({ ...fara, nelivrate: 3 }, 'landing');
    expect(semnal.urgent).toBe(true);
    expect(semnal.tab).toBe('livrare');
    expect(semnal.text).toContain('3 emailuri');
  });

  it('ce e stricat vine înaintea a ce e doar de știut', () => {
    const lista = semnaleDeAtentie(
      { ...fara, nelivrate: 1, asteptare: 2, ciornaNepublicata: true },
      'landing'
    );
    expect(lista[0].cheie).toBe('nelivrate');
  });

  it('lista de așteptare tace după cursă — nu mai poate fi promovat nimeni', () => {
    // Un semnal permanent care nu cere nimic devine zgomot pe care organizatorul
    // învață să-l ignore, inclusiv când apare ceva important lângă el.
    const cuLume = { ...fara, asteptare: 4 };
    expect(semnaleDeAtentie(cuLume, 'landing').some((a) => a.cheie === 'asteptare')).toBe(true);
    expect(semnaleDeAtentie(cuLume, 'dupa-cursa').some((a) => a.cheie === 'asteptare')).toBe(false);
  });

  it('fără nimic de semnalat, lista e goală', () => {
    expect(semnaleDeAtentie(fara, 'landing')).toEqual([]);
  });

  it('singularul e scris corect', () => {
    const [unul] = semnaleDeAtentie({ ...fara, nelivrate: 1 }, 'landing');
    expect(unul.text).toContain("email n-a ajuns");
    const [unaSingura] = semnaleDeAtentie({ ...fara, asteptare: 1 }, 'landing');
    expect(unaSingura.text).toContain('persoană așteaptă');
  });
});
