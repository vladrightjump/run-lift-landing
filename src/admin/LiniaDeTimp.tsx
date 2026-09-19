import { useEventConfig, useEditionDates } from '../hooks/useEventConfig';
import { useNow } from '../hooks/useNow';
import {
  fazaSite,
  semnaleDeAtentie,
  NODURI_DESFASURARE,
  type SemnaleAdmin,
  type TabAdmin,
} from './stareCurenta';
import { reperele, type Reper } from './reperele';
import { descrieMoment } from './eventConfigFields';

type Props = {
  semnale: SemnaleAdmin;
  /** Saltul spre tabul unde se rezolvă un nod sau un semnal. */
  onTab: (tab: TabAdmin) => void;
  /** Calea scurtă de creare a ediției următoare. */
  onEditieNoua: () => void;
  /** Ediție încheiată: nodurile se văd, scrierile nu se oferă. */
  arhiva: boolean;
};

/**
 * Desfășurarea ediției, ca prim bloc al backoffice-ului.
 *
 * Înlocuiește panoul „Acum". Amândouă răspund la aceeași întrebare — „unde
 * suntem?" — dar panoul o făcea în două propoziții (ce vede vizitatorul, ce
 * urmează), iar restul desfășurării rămânea de reconstruit din cap: ce s-a
 * consumat deja, ce mai e de făcut, și unde se rezolvă fiecare.
 *
 * Linia de timp e forma pe care organizatorul o are oricum în minte. Meniul îl
 * obliga s-o traducă în taburi: „reminderele" e un grup din tabul
 * „Evenimentul", „cine s-a înscris" e alt tab, „ediția următoare" e un dialog
 * ascuns în al treilea. Aici fiecare acțiune stă pe nodul de care ține.
 *
 * Nodurile vin din `reperele.ts` — singura listă, de la unificare încoace.
 */

/** Ce acțiune stă pe fiecare nod, și dacă e o scriere. */
const ACTIUNI: Partial<Record<Reper['cheie'], { eticheta: string; tab: TabAdmin; scrie: boolean }>> =
  {
    launchAt: { eticheta: 'Schimbă momentul', tab: 'coming-soon', scrie: true },
    registrationDeadline: { eticheta: 'Vezi lista', tab: 'participanti', scrie: false },
    reminder: { eticheta: 'Schimbă orarul', tab: 'eveniment', scrie: true },
    start: { eticheta: 'Editează ediția', tab: 'eveniment', scrie: true },
  };

/**
 * Starea nodului, în cuvinte.
 *
 * Nu doar un punct colorat: R11 cere ca starea să se poată citi, iar un marcaj
 * vizual o spune numai celor care văd culoarea.
 *
 * Semnalul NU intră aici, deși prima variantă îl lăsa să înlocuiască starea.
 * Sunt două lucruri diferite — unde a ajuns ediția, și ce e în neregulă — iar
 * un nod poate fi „urmează" ȘI stricat. Amestecate, exact nodul care cere
 * atenție își pierdea poziția pe linie.
 */
const stareaNodului = (r: Reper, urmatorulId: string | null): string => {
  if (r.trecut) return 'a trecut';
  if (r.id === urmatorulId) return 'urmează';
  return 'mai târziu';
};

export const LiniaDeTimp = ({ semnale, onTab, onEditieNoua, arhiva }: Props) => {
  const config = useEventConfig();
  const dates = useEditionDates();
  // Un minut: reperele se măsoară în ore și zile. Countdown-ul la secundă
  // există deja în antet, pentru momentul anunțului.
  const acum = useNow(60_000);

  const noduri = reperele(config, acum, NODURI_DESFASURARE);
  const faza = fazaSite(config, dates, acum);
  const atentie = semnaleDeAtentie(semnale, faza);
  const urmatorulId = noduri.find((r) => !r.trecut)?.id ?? null;

  return (
    <section className="admin-linie" aria-label="Desfășurarea ediției">
      <div className="admin-linie-antet">
        <span className="admin-linie-eticheta">Acum pe site</span>
        <span className={`admin-linie-faza faza-${faza}`}>
          <span className="admin-linie-punct-faza" aria-hidden="true" />
          {config.eventName}
        </span>
      </div>

      {noduri.length === 0 ? (
        // Un document cu formate stricate n-are ce desena, iar o ordine
        // calculată din NaN ar fi mai rea decât nimic: ar arăta încrezătoare.
        <p className="admin-linie-gol" role="status">
          Desfășurarea <strong>nu se poate desena</strong>: un moment din document e scris greșit.
          Deschide „Evenimentul" — validarea spune care câmp.
        </p>
      ) : (
        <ol className="admin-linie-noduri">
          {noduri.map((r) => {
            const actiune = ACTIUNI[r.cheie];
            const oferaActiune = actiune && !(arhiva && actiune.scrie);
            return (
              <li
                key={r.id}
                className={[
                  'admin-linie-nod',
                  r.trecut ? 'trecut' : '',
                  r.id === urmatorulId ? 'urmatorul' : '',
                  r.semnal ? 'problema' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="admin-linie-punct" aria-hidden="true" />
                <span className="admin-linie-nume">{r.eticheta}</span>
                <span className="admin-linie-cand">
                  {descrieMoment(r.moment, config.tz, acum) || r.cand}
                </span>
                <span className="admin-linie-stare">{stareaNodului(r, urmatorulId)}</span>
                {r.semnal && <span className="admin-linie-semnal">{r.semnal}</span>}
                {oferaActiune && (
                  <button
                    type="button"
                    className="admin-btn-ghost admin-linie-actiune"
                    onClick={() => onTab(actiune.tab)}
                  >
                    {actiune.eticheta}
                  </button>
                )}
              </li>
            );
          })}

          {/*
            Ultimul nod nu e un moment din document — e ce urmează după ce
            ediția s-a consumat. Calea scurtă de creare stă AICI, la capătul
            liniei, fiindcă acolo o caută organizatorul: după cursă.
          */}
          <li className="admin-linie-nod viitor">
            <span className="admin-linie-punct" aria-hidden="true" />
            <span className="admin-linie-nume">Ediția {config.number + 1}</span>
            <span className="admin-linie-cand">încă nu există</span>
            <span className="admin-linie-stare">mai târziu</span>
            {!arhiva && (
              <button
                type="button"
                className="admin-btn-ghost admin-linie-actiune"
                onClick={onEditieNoua}
              >
                Pornește ediția următoare
              </button>
            )}
          </li>
        </ol>
      )}

      {/* Semnalele apar și dispar pe măsură ce sosesc datele — un cititor de
          ecran trebuie să afle, dar nu întrerupt din ce citea. */}
      <div className="admin-linie-atentie" aria-live="polite">
        {atentie.length === 0 ? (
          // Un panou care tace când totul e bine se citește ca „n-a apucat să
          // încarce". Spunem explicit că am verificat.
          <span className="admin-linie-ok">Nimic care să ceară atenție.</span>
        ) : (
          atentie.map(({ cheie, text, tab, urgent }) =>
            tab ? (
              <button
                key={cheie}
                type="button"
                className={`admin-linie-atentie-semnal${urgent ? ' urgent' : ''}`}
                onClick={() => onTab(tab)}
              >
                {text}
                <span aria-hidden="true"> →</span>
              </button>
            ) : (
              <span
                key={cheie}
                className={`admin-linie-atentie-semnal static${urgent ? ' urgent' : ''}`}
              >
                {text}
              </span>
            )
          )
        )}
      </div>
    </section>
  );
};
