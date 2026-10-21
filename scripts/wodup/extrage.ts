import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { transforma } from './transforma';

/** Only messages authored here may reach the terminal; transport errors can echo headers. */
class EroareOperator extends Error {}

// Same read-only GraphQL fields used by WodUp's Timeline operation.
const query = `query Timeline($startDate: Date!, $endDate: Date!) {
  currentUser {
    activityTimeline(startDate: $startDate, endDate: $endDate) {
      date
      subscribedWods {
        id name occursOn
        classType { id name levels }
        fixedAssignmentSourceClassType { id name }
        wodComponents {
          id prefix rowOrder isAlternating hidden name notes notesForCoaches preInstructions postInstructions
          workout {
            type name details description officialInstructions
            movementData: movements {
              id name category hasReps hasLoad hasDistance hasDuration hasHeight hasCalories hasPower
              videosArray { service videoId }
              currentUserMovementOverlays { videosArray { service videoId } }
            }
          }
          additionalMovements {
            id name category hasReps hasLoad hasDistance hasDuration hasHeight hasCalories hasPower
            videosArray { service videoId }
            currentUserMovementOverlays { videosArray { service videoId } }
          }
        }
      }
    }
  }
}`;

async function main() {
  const cookie = process.env.WODUP_COOKIE;
  delete process.env.WODUP_COOKIE;
  if (!cookie) throw new EroareOperator('Setează WODUP_COOKIE doar în mediul procesului; nu îl salva în fișiere.');
  const [startDate = '2026-09-07', endDate = '2026-11-28', iesire = 'imports/hyrox-prep.json'] = process.argv.slice(2);
  const destinatie = resolve(iesire);
  const cale = relative(resolve('imports'), destinatie);
  if (cale.startsWith('..') || cale === '' || resolve('imports', cale) !== destinatie) throw new EroareOperator('Fișierul trebuie să fie în imports/.');
  const response = await fetch('https://www.wodup.com/api/graphql?op=Timeline', {
    method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ operationName: 'Timeline', variables: { startDate, endDate }, query }),
  });
  if (!response.ok) throw new EroareOperator(`WodUp a refuzat cererea (HTTP ${response.status}). Verifică sesiunea.`);
  const brut = await response.json() as { errors?: unknown[] };
  if (brut.errors?.length) throw new EroareOperator('WodUp a întors o eroare GraphQL. Verifică sesiunea și accesul la program.');
  const document = transforma(brut, { dataStart: startDate, saptamani: 12 });
  await mkdir(dirname(destinatie), { recursive: true });
  await writeFile(destinatie, JSON.stringify(document, null, 2), { mode: 0o600 });
  const blocuri = document.zile.flatMap(z => z.blocuri);
  console.log(JSON.stringify({ fisier: iesire, zile: document.zile.length, blocuri: blocuri.length,
    componente: blocuri.reduce((n,b) => n + (b.parametri.componente as string[]).length, 0), miscari: document.miscari.length }));
}

main().catch((eroare: unknown) => {
  // Neither the credential, response body nor paid program content is logged.
  console.error(eroare instanceof EroareOperator ? eroare.message : 'Extragerea a eșuat. Verifică sesiunea și datele programului.');
  process.exitCode = 1;
});
