/**
 * Schelăria pentru testele de componentă din backoffice.
 *
 * `AdminDashboard` vorbește exclusiv prin `src/lib/adminApi`, deci un singur
 * mock peste modulul acela e de ajuns ca să randăm taburile fără rețea. Fișierul
 * ăsta ține fixture-urile și fabrica de mock într-un loc, ca fiecare test nou
 * să nu-și rescrie propria versiune (și să nu dividă adevărul despre forma
 * datelor).
 *
 * Nu e el însuși un test — `vitest.config.ts` colectează doar `*.test.ts(x)`.
 */
import type {
  AdminRegistration,
  AdminWaitlistEntry,
  AdminEmailLogEntry,
  AdminEvent,
  AdminEdition,
  AdminLaunchSignup,
  AdminEmailTemplate,
  AdminEventConfigRow,
} from '../../../src/lib/adminApi';

export const participant = (
  over: Partial<AdminRegistration> & Pick<AdminRegistration, 'id' | 'nume' | 'email'>
): AdminRegistration => ({
  created_at: '2026-08-20T10:00:00Z',
  telefon: '069000000',
  echipa: '',
  editie: 5,
  dezabonat_la: null,
  ...over,
});

export const logEntry = (
  over: Partial<AdminEmailLogEntry> & Pick<AdminEmailLogEntry, 'id' | 'email' | 'subiect'>
): AdminEmailLogEntry => ({
  created_at: '2026-08-20T12:00:00Z',
  nume: '',
  text_email: '',
  mod: 'admin',
  audienta: 'participanti',
  status: 'trimis',
  provider_status: 200,
  eroare: null,
  editie: 5,
  ...over,
});

export const editie = (over: Partial<AdminEdition> = {}): AdminEdition => ({
  editie: 5,
  participanti: 2,
  asteptare: 0,
  lansare: 0,
  prima: '2026-08-01T10:00:00Z',
  ultima: '2026-08-20T10:00:00Z',
  este_curenta: true,
  ...over,
});

export type AdminApiSeed = {
  registrations?: AdminRegistration[];
  waitlist?: AdminWaitlistEntry[];
  emailLog?: AdminEmailLogEntry[];
  events?: AdminEvent[];
  editions?: AdminEdition[];
  launch?: AdminLaunchSignup[];
  templates?: AdminEmailTemplate[];
  eventConfig?: AdminEventConfigRow[];
};

/**
 * Fabrica pentru `vi.mock('../../src/lib/adminApi', …)`. Scrierile sunt `vi.fn()`
 * ca testul să poată verifica CE s-a cerut serverului — exact locul unde stau
 * defectele pe care le acoperă tranșa A (undo care reinserează, trimitere fără
 * cheie de idempotență).
 *
 * `vi` se dă ca argument: `vi.mock` e hoisted, deci fabrica nu poate importa
 * nimic din afara ei.
 */
export const adminApiMock = (
  vi: { fn: (typeof import('vitest'))['vi']['fn'] },
  seed: AdminApiSeed = {}
) => {
  const s = {
    registrations: seed.registrations ?? [],
    waitlist: seed.waitlist ?? [],
    emailLog: seed.emailLog ?? [],
    events: seed.events ?? [],
    editions: seed.editions ?? [editie()],
    launch: seed.launch ?? [],
    templates: seed.templates ?? [],
    eventConfig: seed.eventConfig ?? [],
  };

  class InvalidTokenError extends Error {
    constructor() {
      super('invalid_token');
    }
  }

  return {
    InvalidTokenError,
    getStoredToken: vi.fn(() => 'token-test'),
    storeToken: vi.fn(),
    clearStoredToken: vi.fn(),
    adminLogin: vi.fn(async () => 'token-test'),
    checkToken: vi.fn(async () => true),
    adminLogout: vi.fn(async () => undefined),

    // Semnăturile sunt scrise explicit, nu deduse din `async () => …`: testele
    // verifică CU CE a fost apelat serverul (ediția cerută, cheia de idempotență,
    // datele trimise la undo), iar fără parametri declarați `mock.calls` ar fi
    // un tuplu gol pentru typecheck.
    listRegistrations: vi.fn(async (_token: string, _editie?: number, _signal?: AbortSignal) =>
      s.registrations
    ),
    listWaitlist: vi.fn(async (_token: string, _editie?: number, _signal?: AbortSignal) =>
      s.waitlist
    ),
    listEmailLog: vi.fn(
      async (_token: string, _editie?: number, _cuText?: boolean, _signal?: AbortSignal) =>
        s.emailLog
    ),
    listAdminEvents: vi.fn(
      async (_token: string, _limit?: number, _signal?: AbortSignal) => s.events
    ),
    listEditions: vi.fn(async (_token: string, _signal?: AbortSignal) => s.editions),
    // Dashboardul îl citește pentru semnalul „ai o ciornă nepublicată" din
    // panoul „Acum"; tabul „Eveniment" pentru documentul propriu-zis.
    listEventConfig: vi.fn(
      async (_token: string, _editie?: number, _signal?: AbortSignal) => s.eventConfig
    ),
    listLaunchNotifications: vi.fn(async (_token: string, _signal?: AbortSignal) => s.launch),
    listEmailTemplates: vi.fn(async (_token: string, _signal?: AbortSignal) => s.templates),

    addRegistration: vi.fn(
      async (
        _token: string,
        _data: { nume: string; telefon: string; email: string },
        _force?: boolean
      ) => 'id-nou'
    ),
    updateRegistration: vi.fn(
      async (
        _token: string,
        _id: string,
        _data: { nume: string; telefon: string; email: string }
      ) => undefined
    ),
    deleteRegistration: vi.fn(async (_token: string, _id: string) => undefined),
    undeleteRegistration: vi.fn(
      async (_token: string, _id: string, _force?: boolean) => undefined
    ),
    deleteWaitlist: vi.fn(async (_token: string, _id: string) => undefined),
    promoteWaitlist: vi.fn(async (_token: string, _id: string) => 'id-promovat'),
    createEdition: vi.fn(async (_token: string) => 6),
    saveEmailTemplate: vi.fn(
      async (_token: string, _cheie: string, _subiect: string, _text: string) => undefined
    ),
    sendBulkEmail: vi.fn(
      async (
        _token: string,
        _messages: { to: string; subject: string; text: string }[],
        _meta?: Record<string, unknown>,
        _signal?: AbortSignal
      ) => ({ sent: 0, failed: 0 })
    ),
  };
};
