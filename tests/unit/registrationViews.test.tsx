import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RegistrationSection } from '../../src/components/landing/RegistrationSection';
import { RegistrationForm } from '../../src/components/landing/RegistrationForm';
import { EventConfigProvider } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import type { useRegistration } from '../../src/hooks/useRegistration';
import type { PublicStats } from '../../src/lib/supabase';

/**
 * Cele cinci stări ale înscrierii, randate de AMBELE suprafețe: secțiunea 03 de
 * pe landing și formularul de sine stătător (pagina `/inscriere` + overlay).
 *
 * Teste de CARACTERIZARE, scrise ÎNAINTE de mutarea prezentării în U5. Un tabel
 * de fixturi rulează pe amândouă componentele, ca echivalența dintre ele să fie
 * scrisă negru pe alb înainte să devină structurală.
 *
 * Nu fac snapshot pe tot arborele: ar face diff-ul din U5 ilizibil exact acolo
 * unde trebuie citit. Verifică textul și rolurile pe care le vede omul.
 */

vi.mock('../../src/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/supabase')>()),
  fetchPublicConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/lib/monitoring', () => ({
  logClientError: vi.fn(),
  setMonitoringEdition: vi.fn(),
}));

type Reg = ReturnType<typeof useRegistration>;

const stats: PublicStats = { count: 7, participants: [], waitlist: 0 };

/** Un `reg` în starea de bază; fiecare test schimbă doar ce-l interesează. */
const regDeBaza = (): Reg =>
  ({
    phase: 'form',
    setPhase: vi.fn(),
    errors: {},
    setErrors: vi.fn(),
    dateErrMsg: 'Introdu data nașterii.',
    confirmName: 'Ana',
    submittedAsWaitlist: false,
    birth: { d: '', m: '', y: '' },
    setBirth: vi.fn(),
    birthISO: '',
    formRef: { current: null },
    slots: { occupied: 7, remaining: SNAPSHOT_CONFIG.slots.total - 7 },
    isSoldOut: false,
    isWaitlistFull: false,
    waitlistMode: false,
    waitlistLeft: SNAPSHOT_CONFIG.slots.waitlist,
    showForm: true,
    closedReason: null,
    handleSubmit: vi.fn(),
    clearErrorFor: vi.fn(),
    resetForm: vi.fn(),
  }) as unknown as Reg;

const cu = (over: Partial<Reg>): Reg => ({ ...regDeBaza(), ...over }) as Reg;

const randeaza = (ui: ReactElement) =>
  render(<EventConfigProvider override={SNAPSHOT_CONFIG}>{ui}</EventConfigProvider>);

/**
 * Cele două suprafețe, sub același tabel de fixturi. `nume` intră în titlul
 * testului, ca eșecul să spună din prima care dintre ele a picat.
 */
const SUPRAFETE = [
  {
    nume: 'secțiunea de pe landing',
    randeaza: (reg: Reg) => randeaza(<RegistrationSection reg={reg} stats={stats} />),
  },
  {
    nume: 'formularul de sine stătător',
    randeaza: (reg: Reg) => randeaza(<RegistrationForm reg={reg} stats={stats} />),
  },
] as const;

beforeEach(() => {
  // `useCountUp` (contorul de locuri din secțiune) întreabă dacă utilizatorul a
  // cerut mai puțină mișcare; jsdom n-are `matchMedia`.
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe.each(SUPRAFETE)('stările înscrierii — $nume', ({ randeaza: randeazaSuprafata }) => {
  it('starea „formular": toate câmpurile, acordul și butonul de trimitere', () => {
    randeazaSuprafata(regDeBaza());
    expect(screen.getByRole('textbox', { name: /Nume/ })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /Prenume/ })).toBeDefined();
    expect(document.querySelector('input[name="telefon"]')).not.toBeNull();
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="dataNasterii"]')).not.toBeNull();
    expect(screen.getByRole('checkbox')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Trimite înscrierea' })).toBeDefined();
  });

  it('în modul listă de așteptare, butonul își schimbă textul', () => {
    randeazaSuprafata(cu({ waitlistMode: true, isSoldOut: true }));
    expect(screen.getByRole('button', { name: 'Intră pe lista de așteptare' })).toBeDefined();
  });

  it('starea „se încarcă": nicio urmă de formular și niciun mesaj de eroare', () => {
    randeazaSuprafata(cu({ phase: 'loading', showForm: false }));
    expect(screen.getByText('Se trimite înscrierea…')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Trimite înscrierea' })).toBeNull();
    expect(screen.queryByText('Ceva n-a mers')).toBeNull();
  });

  it('starea „eroare": mesajul și butonul de reîncercare', () => {
    randeazaSuprafata(cu({ phase: 'error', showForm: false }));
    expect(screen.getByText('Ceva n-a mers')).toBeDefined();
    expect(
      screen.getByText(
        'Înscrierea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.'
      )
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Încearcă din nou' })).toBeDefined();
  });

  it('starea „succes": numele trimis, plus calendarul și distribuirea', () => {
    randeazaSuprafata(cu({ phase: 'success', showForm: false }));
    expect(screen.getByText(/Ana!/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Adaugă în calendar' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Distribuie' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Înscrie altă persoană' })).toBeDefined();
  });

  it('succes pe lista de așteptare: alt text, fără calendar și fără distribuire', () => {
    randeazaSuprafata(cu({ phase: 'success', showForm: false, submittedAsWaitlist: true }));
    expect(screen.getByText(/Ești pe lista de așteptare/)).toBeDefined();
    expect(
      screen.getByText(
        'Toate locurile sunt ocupate momentan. Te contactăm pe email sau telefon imediat ce se eliberează un loc — în ordinea înscrierii.'
      )
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Adaugă în calendar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Adaugă altă persoană' })).toBeDefined();
  });

  it.each([
    ['ended', 'Evenimentul a avut loc', 'Ne vedem la ediția următoare. Urmărește-ne pentru anunțuri.'],
    [
      'reg',
      'Înscrierile s-au închis',
      'Perioada de înscriere s-a încheiat. Scrie-ne pe Instagram — dacă se eliberează un loc, te anunțăm.',
    ],
    [
      'full',
      'Locurile sunt pline',
      'Toate locurile și lista de așteptare sunt ocupate. Scrie-ne pe Instagram dacă apare o disponibilitate.',
    ],
  ])('starea „închis" (%s) arată titlul și motivul, fără formular', (motiv, titlu, mesaj) => {
    randeazaSuprafata(
      cu({ showForm: false, closedReason: motiv as 'ended' | 'reg' | 'full' })
    );
    expect(screen.getByText(titlu)).toBeDefined();
    expect(screen.getByText(mesaj)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Contactează organizatorii' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Trimite înscrierea' })).toBeNull();
  });

  it('o eroare de câmp apare lângă câmpul ei', () => {
    randeazaSuprafata(cu({ errors: { email: true, nume: true } }));
    expect(screen.getByText('Adresa de email nu e validă.')).toBeDefined();
    expect(screen.getByText('Completează numele de familie.')).toBeDefined();
    expect(screen.queryByText('Numărul de telefon nu e valid.')).toBeNull();
  });

  it('locurile rămase se numără din aceleași statistici', () => {
    const { container } = randeazaSuprafata(regDeBaza());
    const ramase = SNAPSHOT_CONFIG.slots.total - 7;
    // `{n} / {total}` sunt două noduri de text, deci se citește din conținutul
    // containerului, nu cu un matcher pe un singur element.
    expect(container.textContent).toContain(`${ramase} / ${SNAPSHOT_CONFIG.slots.total}`);
  });
});

/**
 * Ce trebuie să RĂMÂNĂ diferit după U5.
 *
 * Cele două suprafețe nu spun același lucru la succes, iar diferența e veche și
 * intenționată la nivel de produs: pagina de înscriere confirmă locul ocupat,
 * secțiunea de pe landing nu. Mutarea prezentării nu are voie să le uniformizeze
 * — ar fi o schimbare de conținut, nu un refactor. Testele astea o fixează.
 */
describe('diferențele dintre suprafețe se păstrează', () => {
  it('secțiunea de pe landing spune „Te-ai înregistrat"', () => {
    randeaza(<RegistrationSection reg={cu({ phase: 'success', showForm: false })} stats={stats} />);
    expect(screen.getByText(/Te-ai înregistrat,/)).toBeDefined();
    expect(screen.queryByText(/Te-ai înscris,/)).toBeNull();
  });

  it('formularul de sine stătător spune „Te-ai înscris"', () => {
    randeaza(<RegistrationForm reg={cu({ phase: 'success', showForm: false })} stats={stats} />);
    expect(screen.getByText(/Te-ai înscris,/)).toBeDefined();
    expect(screen.queryByText(/Te-ai înregistrat,/)).toBeNull();
  });

  it('doar formularul de sine stătător anunță locul ocupat', () => {
    randeaza(<RegistrationForm reg={cu({ phase: 'success', showForm: false })} stats={stats} />);
    expect(screen.getByText(new RegExp(`Locul 7 din ${SNAPSHOT_CONFIG.slots.total}`))).toBeDefined();
  });

  it('secțiunea de pe landing NU anunță locul ocupat', () => {
    randeaza(<RegistrationSection reg={cu({ phase: 'success', showForm: false })} stats={stats} />);
    expect(screen.queryByText(/Locul 7 din/)).toBeNull();
  });

  it('doar secțiunea de pe landing are numărul și titlul de secțiune', () => {
    const { container } = randeaza(<RegistrationSection reg={regDeBaza()} stats={stats} />);
    expect(within(container).getByText('Înscriere')).toBeDefined();
    expect(container.querySelector('.e3-title-num')?.textContent).toBe('03');
  });

  it('doar formularul de sine stătător poate primi conținut sub el', () => {
    randeaza(
      <RegistrationForm reg={regDeBaza()} stats={stats} footerSlot={<span>Vezi tot →</span>} />
    );
    expect(screen.getByText('Vezi tot →')).toBeDefined();
  });
});
