/**
 * Logica anunțului către toți participanții de până acum (tabul „Emailuri").
 *
 * Pură și testabilă, ca `emailAudience.ts` și `sendLock.ts` — `AnuntIstoric`
 * doar o consumă. Vezi `tests/unit/anunt.test.ts`.
 *
 * Lista de destinatari NU se calculează aici: o rezolvă serverul
 * (`runlift.anunt_recipients`), fiindcă poartă tokenurile de dezabonare ale
 * tuturor edițiilor. Clientul doar arată cine e în ea și îi spune serverului pe
 * cine să SCOATĂ.
 */
import { AnuntError, InvalidTokenError } from '../lib/adminApi';
import type { AdminEmailLogEntry, DestinatarAnunt } from '../lib/adminApi';
import type { Recipient } from './emailAudience';
import type { DifuzareAnterioara } from './sendLock';

/** Cheia șablonului implicit, creat de `supabase-migration-anunt-istoric.sql`. */
export const SABLON_ANUNT = 'bulk_participant_anunt';

/** Adresa, adusă la forma pe care o compară și serverul. */
export const cheieAdresa = (email: string): string => email.trim().toLowerCase();

/** Cine rămâne după debifări. Ordinea listei de la server se păstrează. */
export const destinatariRamasi = (
  lista: DestinatarAnunt[],
  excluse: ReadonlySet<string>
): DestinatarAnunt[] => lista.filter((d) => !excluse.has(cheieAdresa(d.email)));

/**
 * Destinatarul în forma pe care o așteaptă `fillTemplate`, pentru previzualizare.
 *
 * `tokenRenunt` gol, deliberat: nimeni din audiență n-are loc la ediția anunțată,
 * iar serverul face la fel — paragraful cu `{link_renunt}` cade.
 */
export const caDestinatar = (d: DestinatarAnunt): Recipient => ({
  id: cheieAdresa(d.email),
  nume: d.nume,
  prenume: d.nume.trim().split(/\s+/)[0] ?? '',
  email: d.email,
  telefon: '',
  created_at: '',
  dezabonat: false,
  tokenRenunt: '',
});

/**
 * Variabilele care au sens într-un anunț.
 *
 * Mai puține decât în difuzarea obișnuită, pentru că le rezolvă SERVERUL, nu
 * clientul, iar serverul știe despre destinatar doar numele și adresa: n-are
 * telefonul, n-are data înscrierii, n-are un loc de eliberat.
 */
export const VARIABILE_ANUNT = [
  '{prenume}',
  '{nume}',
  '{email}',
  '{numele_cursei}',
  '{data_cursei}',
  '{data_scurta}',
  '{ora_start}',
  '{ora_checkin}',
  '{locul}',
  '{editia}',
] as const;

/**
 * Variabile din alte difuzări care, într-un anunț, n-ar fi completate.
 *
 * `{data_inscrierii}` ar pleca LITERAL — un email care spune „te-ai înscris pe
 * {data_inscrierii}" arată stricat. `{telefon}` ar pleca gol, iar
 * `{link_renunt}` și-ar pierde tot paragraful. Niciuna nu blochează trimiterea;
 * operatorul trebuie doar să afle înainte, nu din inboxul cuiva.
 */
const NESUPORTATE = ['{data_inscrierii}', '{telefon}', '{link_renunt}'] as const;

export const variabileNesuportate = (...texte: string[]): string[] =>
  NESUPORTATE.filter((v) => texte.some((t) => t.includes(v)));

/** Între două rânduri ale aceluiași anunț trec secunde; între două anunțuri, ore. */
const PAUZA_INTRE_LOTURI_MS = 10 * 60_000;

/**
 * Ultimul anunț plecat în ediția asta, oricare i-ar fi fost subiectul.
 *
 * Nu pe subiect, spre deosebire de `ultimaDifuzare`: jurnalul reține subiectul cu
 * variabilele DEJA completate („Ne vedem din nou? Hyrox, 3 octombrie"), iar
 * câmpul din formular le are încă între acolade — nu s-ar potrivi niciodată. Și
 * nici n-ar trebui: o ediție se anunță o dată; al doilea anunț, cu alt subiect,
 * e tot al doilea email către aceiași oameni.
 *
 * Doar `anunt`, nu și `anunt_test`: un test către operator nu e o difuzare.
 */
export const ultimulAnunt = (
  intrari: AdminEmailLogEntry[],
  editie: number
): DifuzareAnterioara | null => {
  const ale = intrari
    .filter((e) => e.mod === 'anunt' && e.editie === editie)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (ale.length === 0) return null;
  // Lotul = rândurile legate de ultimul fără o pauză mai mare decât `PAUZA_INTRE_LOTURI_MS`.
  // Nu „aceeași minută": jurnalul se scrie pe parcurs, iar un anunț de 40 s
  // trece aproape sigur peste granița unui minut.
  let capat = 1;
  while (
    capat < ale.length &&
    Date.parse(ale[capat - 1].created_at) - Date.parse(ale[capat].created_at) <= PAUZA_INTRE_LOTURI_MS
  ) {
    capat++;
  }
  return {
    cand: ale[0].created_at,
    catreCati: new Set(ale.slice(0, capat).map((e) => cheieAdresa(e.email))).size,
  };
};

/**
 * Eroarea, în termenii operatorului.
 *
 * Două coduri merită nume proprii fiindcă ascund o problemă de DEPLOY, nu una de
 * rețea: `unknown_mode` înseamnă că funcția din producție e mai veche decât
 * codul, iar `recipients_failed` apare cât timp migrarea n-a fost aplicată. Un
 * mesaj generic „încearcă din nou" l-ar pune pe operator să reîncerce la
 * nesfârșit ceva ce nu se repară singur.
 */
export const motivEroareAnunt = (err: unknown): string => {
  if (err instanceof InvalidTokenError) return 'Sesiune expirată — reautentifică-te.';
  if (err instanceof AnuntError) {
    switch (err.cod) {
      case 'unknown_mode':
        return 'Funcția de email din producție nu cunoaște încă anunțul — trebuie redeployată.';
      case 'recipients_failed':
        return 'Nu am putut calcula lista. Dacă migrarea anunțului nu e aplicată încă, lista nu există.';
      case 'missing_content':
        return 'Completează subiectul și mesajul.';
      case 'bad_test_to':
        return 'Adresa pentru test nu arată valid.';
      case 'bad_exclude':
        return 'Lista de debifați e prea lungă sau invalidă.';
    }
  }
  return 'Nu s-a putut trimite. Verifică configurarea Resend și încearcă din nou.';
};
