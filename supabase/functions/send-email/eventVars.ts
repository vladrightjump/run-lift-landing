// Variabilele de eveniment din șabloanele de email, derivate din configul
// publicat (`public_config()`).
//
// De ce trăiesc AICI și nu în `src/content/format.ts`, care le are deja:
// funcția Edge rulează pe Deno și se deployează separat, cu directorul ăsta ca
// rădăcină; nu are niciun import în afara lui, iar un import din `src/` n-ar fi
// verificabil decât la deploy — pe o cale unde eșecul e tăcut (confirmarea e
// best-effort). Deci derivarea e duplicată deliberat.
//
// Duplicarea e ținută în frâu de `tests/unit/edgeEventVars.test.ts`, care
// compară ieșirile celor două implementări pe un set de date. Dacă schimbi
// formatul aici sau dincolo și nu în ambele, testul pică. Nu-l ocoli: fără el,
// emailul de confirmare ar putea anunța altă oră decât pagina, pentru aceeași
// cursă.
//
// Fișierul e pur — fără `Deno.*`, fără fetch — tocmai ca testul din vitest să-l
// poată importa.

const LUNI_RO = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

const ZILE_RO = [
  "duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă",
];

/** Componentele unui `YYYY-MM-DDTHH:mm[:ss]` local, fără dependență de fus. */
function parti(localIso: string) {
  const [data, ora = ""] = String(localIso).split("T");
  const [an, luna, zi] = data.split("-").map(Number);
  return { an, luna, zi, hm: ora.slice(0, 5) };
}

/** „5 septembrie 2026". */
function dataLunga(localIso: string): string {
  const { an, luna, zi } = parti(localIso);
  return `${zi} ${LUNI_RO[luna - 1]} ${an}`;
}

/** „5 septembrie" — forma pentru subiect, fără an. */
function dataScurta(localIso: string): string {
  const { luna, zi } = parti(localIso);
  return `${zi} ${LUNI_RO[luna - 1]}`;
}

/**
 * Ziua săptămânii, calculată determinist (Sakamoto) din componentele
 * calendaristice — nu din `new Date`, care ar depinde de fusul serverului.
 */
function ziuaSaptamanii(localIso: string, capitala = false): string {
  const { an, luna, zi } = parti(localIso);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = luna < 3 ? an - 1 : an;
  const idx =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[luna - 1] + zi) % 7;
  const nume = ZILE_RO[idx];
  return capitala ? nume.charAt(0).toUpperCase() + nume.slice(1) : nume;
}

/** Forma minimă de config de care depind variabilele. */
export type ConfigEveniment = {
  number: number;
  eventName: string;
  start: string;
  checkinFrom: string;
  venue: { name: string; city: string };
};

/**
 * „Scările de Granit, Valea Morilor" — locul cursei, într-un singur rând.
 * Oglindește `placeStrings` din `src/content/format.ts` pentru un loc fără
 * reper (cursa n-are `landmark`).
 */
function locul(venue: ConfigEveniment["venue"]): string {
  return [venue.name, venue.city].filter(Boolean).join(", ");
}

export function eventVarsDinConfig(
  config: ConfigEveniment | null,
): Record<string, string> {
  if (!config) return {};
  return {
    "{data_cursei}": `${ziuaSaptamanii(config.start, true)}, ${dataLunga(config.start)}`,
    "{data_scurta}": dataScurta(config.start),
    "{ora_start}": parti(config.start).hm,
    "{ora_checkin}": config.checkinFrom,
    "{locul}": locul(config.venue),
    "{numele_cursei}": config.eventName,
    "{editia}": String(config.number),
  };
}

/**
 * Înlocuiește variabilele de eveniment. Fără config le lasă LITERALE, la fel ca
 * pe partea de client: un email care spune „{data_cursei}" arată stricat și e
 * raportat, pe când unul cu o dată greșită trimite omul în ziua greșită.
 */
export function fillEventVars(
  text: string,
  config: ConfigEveniment | null,
): string {
  const vars = eventVarsDinConfig(config);
  return Object.keys(vars).reduce(
    (out, nume) => out.split(nume).join(vars[nume]),
    text,
  );
}
