/**
 * sync-edition — EMITE (nu aplică) SQL-ul care aliniază `app_config` din Supabase
 * la ediția din `src/content/edition.ts` (SSOT).
 *
 * De ce doar emite: aplicarea directă ar atinge producția fără revizuire, iar
 * DB-ul e partajat cu gym-app. Îl revezi și-l rulezi tu (SQL Editor / MCP).
 *
 * De ce DOAR `app_config`: singurul lucru din backend care TREBUIE să urmeze codul
 * per ediție e ediția curentă. Textul emailurilor e DB-only (editabil din /admin) —
 * NU-l regenerăm din cod (ar suprascrie editările). Vezi GHID-EDITIE-NOUA.md.
 *
 * Rulare: `npm run sync-edition`
 */
import { EDITION } from '../src/content/edition';

const sql = `-- Generat de scripts/sync-edition.ts — aliniază app_config la EDITION.
-- Ediția evenimentului = ${EDITION.number}, ediția de lansare = ${EDITION.launchNumber}.
-- Rulează în Supabase (schema runlift). NU atinge schema public (gym-app/bot).

update runlift.app_config set value = '${EDITION.number}'       where key = 'current_event_edition';
update runlift.app_config set value = '${EDITION.launchNumber}' where key = 'current_launch_edition';

select key, value from runlift.app_config
where key in ('current_event_edition', 'current_launch_edition')
order by key;`;

console.log(sql);
