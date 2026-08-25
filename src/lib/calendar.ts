/**
 * Generare „Adaugă în calendar" (.ics) + share, derivate din ediția curentă
 * (`content/edition.ts` + datele absolute din `config.ts`). Fără backend.
 *
 * Momentul absolut (EVENT_DATE/EVENT_END_DATE) e deja compus cu fusul Chișinăului,
 * așa că îl scriem în .ics ca UTC (`...Z`) — calendarele îl afișează corect în orice fus.
 */
import { EVENT_DATE, EVENT_END_DATE } from './config';
import { EDITION } from '../content/edition';
import { EVENT_WHERE } from '../content/format';

const EVENT_TITLE = `${EDITION.brand} · ${EDITION.eventName}`;
/** Locul cursei vine din `format.ts`, nu recalculat — o singură sursă. */
const EVENT_LOCATION = EVENT_WHERE;

const pad = (n: number) => String(n).padStart(2, '0');

/** Data în format iCalendar UTC: YYYYMMDDTHHMMSSZ. */
const toIcsUtc = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Escape pentru valori TEXT din iCalendar (RFC 5545): `\ , ;` și newline. */
const escIcs = (s: string): string => s.replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');

/** Construiește conținutul fișierului .ics pentru evenimentul ediției curente. */
export const buildEventIcs = (): string => {
  const stamp = toIcsUtc(new Date());
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Run + Lift//parktraining.fit//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:runlift-editia-${EDITION.number}-${EVENT_DATE.getTime()}@parktraining.fit`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(EVENT_DATE)}`,
    `DTEND:${toIcsUtc(EVENT_END_DATE)}`,
    `SUMMARY:${escIcs(EVENT_TITLE)}`,
    `LOCATION:${escIcs(EVENT_LOCATION)}`,
    `DESCRIPTION:${escIcs(`Ne vedem la ${EVENT_TITLE}! Check-in de la ${EDITION.checkinFrom}. Detalii: ${EDITION.urls.site}`)}`,
    `URL:${EDITION.urls.site}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

/** Descarcă .ics-ul evenimentului (deschide în Apple/Google/Outlook Calendar). */
export const downloadEventIcs = (): void => {
  const blob = new Blob([buildEventIcs()], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `run-lift-editia-${EDITION.number}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
};

/** Textul de share pre-completat. */
export const buildShareText = (): string =>
  `M-am înscris la ${EVENT_TITLE}! Vino și tu — ${EDITION.urls.site}`;

/** URL de share pe WhatsApp cu text pre-completat (fallback dacă nu e Web Share). */
export const whatsappShareUrl = (): string =>
  `https://wa.me/?text=${encodeURIComponent(buildShareText())}`;

/**
 * Distribuie înscrierea: folosește Web Share API pe mobil (nativ), altfel deschide
 * WhatsApp. Anularea din share-ul nativ nu face nimic (nu cădem pe WhatsApp).
 */
export const shareSignup = async (): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: EVENT_TITLE, text: buildShareText(), url: EDITION.urls.site });
    } catch {
      // Utilizatorul a anulat share-ul nativ — nu deschidem WhatsApp peste.
    }
    return;
  }
  window.open(whatsappShareUrl(), '_blank', 'noopener,noreferrer');
};
