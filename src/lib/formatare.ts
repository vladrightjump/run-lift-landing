/**
 * Formatarea în română a datelor și orelor, într-un singur loc.
 *
 * Erau șase definiții `Intl.DateTimeFormat('ro-RO', …)` risipite prin patru
 * fișiere, dintre care trei identice caracter cu caracter sub trei nume
 * diferite (`eventFmt`, `timpFmt`, `timpDifuzare`). O ediție cu alt fus sau o
 * schimbare de format cerea patru editări și găsea trei.
 *
 * Câte o funcție per FORMĂ de ieșire, nu o funcție parametrizată: la apel se
 * vede din nume ce iese, în loc să trebuiască citit un obiect de opțiuni.
 *
 * Modulul e pur — fără React, fără DOM — ca să poată fi testat direct.
 *
 * NU înlocuiește `content/format.ts`, care derivă string-urile dependente de
 * ediție (data cursei, `EVENT_WHEN`, badge-ul). Acolo e vorba de conținutul
 * ediției; aici, de afișarea unui moment oarecare în backoffice și în
 * numărătoarea inversă.
 */

const caData = (valoare: Date | string): Date =>
  valoare instanceof Date ? valoare : new Date(valoare);

/**
 * Fusul evenimentului, nu al vizitatorului.
 *
 * Un organizator care deschide backoffice-ul din altă țară trebuie să vadă ora
 * cursei, nu ora lui — altfel „reminderul pleacă la 18:00" înseamnă alt moment
 * pentru fiecare care citește.
 */
const FUS = 'Europe/Chisinau';

const ziLunaOraFmt = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FUS,
});

const ziSiLunaFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

const momentCompletFmt = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FUS,
});

const ziLunaLungaFmt = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  timeZone: FUS,
});

/** „5 sep, 07:00" — momentul unei difuzări sau al unui eveniment din jurnal. */
export const ziLunaOra = (valoare: Date | string): string =>
  ziLunaOraFmt.format(caData(valoare));

/**
 * „5 sep" — data unei înscrieri, în listă.
 *
 * Singura fără fus impus: e o dată de calendar, nu un moment, iar `Intl` pune
 * un punct după luna prescurtată („5 sept.") pe care coloana nu-l vrea.
 */
export const ziSiLuna = (valoare: Date | string): string =>
  ziSiLunaFmt.format(caData(valoare)).replace('.', '');

/** „5 septembrie 2026, 07:00" — ținta numărătorii inverse, scrisă în clar. */
export const momentComplet = (valoare: Date | string): string =>
  momentCompletFmt.format(caData(valoare));

/** „5 septembrie" — fără an și fără oră, pentru badge. */
export const ziLunaLunga = (valoare: Date | string): string =>
  ziLunaLungaFmt.format(caData(valoare));
