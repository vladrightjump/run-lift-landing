import { useEventConfig, useEditionDates } from '../hooks/useEventConfig';
import { useNow } from '../hooks/useNow';
import { stareCurenta, type SemnaleAdmin, type TabAdmin } from './stareCurenta';
import { descrieMoment } from './eventConfigFields';

type Props = {
  semnale: SemnaleAdmin;
  /** Sarí la tabul unde se rezolvă un semnal. */
  onTab: (tab: TabAdmin) => void;
};

/**
 * Panoul de orientare din capul dashboardului: ce vede acum un vizitator, ce
 * urmează și ce cere atenție.
 *
 * Rostul lui e să răspundă înainte de orice tabel la întrebarea cu care
 * organizatorul deschide pagina — „unde suntem?". Până acum răspunsul cerea un
 * alt tab de browser (ca să vezi site-ul) plus o comparație în cap între patru
 * date scrise ca „2026-08-22T07:00:00".
 *
 * Regulile stau în `stareCurenta.ts`, ca modul pur — aici e doar randarea.
 */
export const AdminAcum = ({ semnale, onTab }: Props) => {
  const config = useEventConfig();
  const dates = useEditionDates();
  // Un minut: reperele se măsoară în ore și zile, nu în secunde. Countdown-ul
  // la secundă există deja în antet, pentru momentul anunțului.
  const acum = useNow(60_000);
  const stare = stareCurenta(config, dates, acum, semnale);

  return (
    <section className="admin-acum" aria-label="Starea curentă">
      <div className="admin-acum-principal">
        <div className="admin-acum-bloc">
          <span className="admin-acum-eticheta">Acum pe site</span>
          <span className={`admin-acum-valoare faza-${stare.faza}`}>
            <span className="admin-acum-punct" aria-hidden="true" />
            {stare.ceVede}
          </span>
        </div>
        <div className="admin-acum-bloc">
          <span className="admin-acum-eticheta">Urmează</span>
          {stare.urmatorul ? (
            <span className="admin-acum-valoare">
              {stare.urmatorul.eticheta}
              <span className="admin-acum-cand">
                {descrieMoment(oraDePerete(stare.urmatorul.moment, config.tz), config.tz, acum)}
              </span>
            </span>
          ) : (
            <span className="admin-acum-valoare muted">
              Toate reperele ediției au trecut — deschide ediția următoare din tabul „Eveniment”.
            </span>
          )}
        </div>
      </div>

      {/* Semnalele apar și dispar pe măsură ce sosesc datele — un cititor de
          ecran trebuie să afle, dar nu întrerupt din ce citea. */}
      <div className="admin-acum-atentie" aria-live="polite">
        {stare.atentie.length === 0 ? (
          // Un panou care tace când totul e bine se citește ca „n-a apucat să
          // încarce". Spunem explicit că am verificat și nu e nimic.
          <span className="admin-acum-ok">Nimic care să ceară atenție.</span>
        ) : (
          stare.atentie.map(({ cheie, text, tab, urgent }) =>
            tab ? (
              <button
                key={cheie}
                type="button"
                className={`admin-acum-semnal${urgent ? ' urgent' : ''}`}
                onClick={() => onTab(tab)}
              >
                {text}
                <span aria-hidden="true"> →</span>
              </button>
            ) : (
              <span key={cheie} className={`admin-acum-semnal static${urgent ? ' urgent' : ''}`}>
                {text}
              </span>
            )
          )
        )}
      </div>
    </section>
  );
};

/**
 * `Date` → stringul local pe care îl așteaptă `descrieMoment`.
 *
 * Reperele sunt momente absolute (derivate deja cu fusul ediției), iar ecoul în
 * limbaj natural lucrează pe ora de perete. Refacem ora de perete din offsetul
 * ediției, nu din cel al calculatorului: un organizator care deschide adminul
 * din altă țară trebuie să vadă ora cursei, nu ora lui.
 */
const oraDePerete = (d: Date, tz: string): string => {
  const semn = tz.startsWith('-') ? -1 : 1;
  const [ore, minute] = tz.slice(1).split(':').map(Number);
  const offsetMs = semn * ((ore || 0) * 60 + (minute || 0)) * 60_000;
  return new Date(d.getTime() + offsetMs).toISOString().slice(0, 19);
};
