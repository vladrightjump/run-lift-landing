import type { EventConfig } from '../../../content/eventConfig';
import { useContext, useMemo } from 'react';
import { Grup, Blocat } from '../primitive';
import { adaugaReminder, stergeReminder, seteazaReminder } from '../../eventConfigForm';
import {
  MAX_REMINDERS,
  REMINDER_TEMPLATE_KEYS,
  type ReminderTemplateKey,
} from '../../../content/eventConfig';
import { remindereleProgramate, urmatorulReminder } from '../../remindere';
import { ETICHETE_SABLOANE, areEroareIndexata } from '../ajutoare';

type Props = {
  ciorna: EventConfig;
  seteazaRemindere: (reminders: EventConfig['reminders']) => void;
  erori: Map<string, string>;
  /** Momentul curent — orarul se citește față de el. */
  acum: number;
};

/** „Remindere": orarul emailurilor care pleacă singure înainte de cursă. */
export const GrupRemindere = ({ ciorna, seteazaRemindere, erori, acum }: Props) => {
  const ocupat = useContext(Blocat);
  // Derivate din ciornă, nu primite: grupul e singurul care le folosește, iar
  // ca prop-uri ar fi fost două valori în plus de ținut în sincron.
  const programate = useMemo(() => remindereleProgramate(ciorna, acum), [ciorna, acum]);
  const urmatorul = useMemo(() => urmatorulReminder(programate), [programate]);
  const active = useMemo(() => programate.filter((r) => r.intrare.enabled), [programate]);
  return (
  <Grup
    titlu="Remindere"
    ajutor="Emailurile automate dinaintea cursei. Pleacă singure, o singură dată fiecare."
    areEroare={areEroareIndexata(erori, 'reminders')}
    rezumat={
      urmatorul
        ? `${active.length} ${active.length === 1 ? 'activ' : 'active'} · următorul ${
            urmatorul.distanta
          }`
        : ciorna.reminders.length === 0
          ? 'Niciunul — nimeni nu primește nimic înainte de cursă'
          : `${ciorna.reminders.length} în orar · niciunul nu mai pleacă`
    }
  >
    <p className="admin-config-hint">
      Fiecare rând pleacă o singură dată, cu atâtea ore înainte de startul cursei. Textul
      se editează în „Șabloane"; pune <code>{'{link_renunt}'}</code> în el ca oamenii
      să-și poată elibera locul cu un click — locul trece automat la primul de pe lista de
      așteptare.
    </p>
    {erori.get('reminders') && (
      <div className="admin-banner warn" role="status">
        {erori.get('reminders')}
      </div>
    )}
    <ol className="admin-reels-list">
      {programate.map((r) => {
        const i = r.index;
        const eroareAvans = erori.get(`reminders.${i}.offsetHours`);
        return (
          <li key={i} className={eroareAvans ? 'invalid' : ''}>
            <div className="admin-reels-rand">
              <span className="admin-layout-nr">
                {r.stare === 'oprit' ? '—' : r.stare === 'ratat' ? '!' : '✓'}
              </span>
              <div className="admin-reels-campuri">
                <label className="admin-config-eticheta" htmlFor={`rem-ore-${i}`}>
                  Cu câte ore înainte de start
                </label>
                <input
                  id={`rem-ore-${i}`}
                  type="number"
                  min={1}
                  max={720}
                  autoComplete="off"
                  disabled={ocupat}
                  aria-invalid={eroareAvans ? true : undefined}
                  value={r.intrare.offsetHours}
                  onChange={(e) =>
                    seteazaRemindere(
                      seteazaReminder(
                        ciorna.reminders,
                        i,
                        'offsetHours',
                        Number(e.target.value)
                      )
                    )
                  }
                />
                {eroareAvans ? (
                  <span className="admin-config-eroare" role="alert">
                    {eroareAvans}
                  </span>
                ) : (
                  r.cand && <span className="admin-config-ecou">{`pleacă ${r.cand} · ${r.distanta}`}</span>
                )}
                {/*
                  Nota e sub ecou, nu în locul lui: „a trecut" fără ora la
                  care ar fi trebuit să plece nu spune ce e de reparat.
                */}
                {r.nota && (
                  <span
                    className={
                      r.stare === 'ratat' ? 'admin-config-eroare' : 'admin-config-ecou'
                    }
                    role={r.stare === 'ratat' ? 'status' : undefined}
                  >
                    {r.nota}
                  </span>
                )}

                <label className="admin-config-eticheta" htmlFor={`rem-sablon-${i}`}>
                  Textul
                </label>
                <select
                  id={`rem-sablon-${i}`}
                  disabled={ocupat}
                  value={r.intrare.template}
                  onChange={(e) =>
                    seteazaRemindere(
                      seteazaReminder(
                        ciorna.reminders,
                        i,
                        'template',
                        e.target.value as ReminderTemplateKey
                      )
                    )
                  }
                >
                  {REMINDER_TEMPLATE_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {ETICHETE_SABLOANE[k]}
                    </option>
                  ))}
                </select>

                <label className="admin-config-optiune" htmlFor={`rem-activ-${i}`}>
                  <input
                    id={`rem-activ-${i}`}
                    type="checkbox"
                    disabled={ocupat}
                    checked={r.intrare.enabled}
                    onChange={(e) =>
                      seteazaRemindere(
                        seteazaReminder(ciorna.reminders, i, 'enabled', e.target.checked)
                      )
                    }
                  />
                  Activ
                </label>
              </div>
              <div className="admin-reels-actiuni">
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={ocupat}
                  aria-label={`Șterge reminderul cu ${r.intrare.offsetHours} ore înainte`}
                  onClick={() => seteazaRemindere(stergeReminder(ciorna.reminders, i))}
                >
                  Șterge
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
    <button
      type="button"
      className="admin-btn-ghost"
      disabled={ocupat || ciorna.reminders.length >= MAX_REMINDERS}
      onClick={() => seteazaRemindere(adaugaReminder(ciorna.reminders))}
    >
      + Adaugă reminder
    </button>
  </Grup>
  );
};
