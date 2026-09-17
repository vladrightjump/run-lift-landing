import type { EventConfig } from '../../../content/eventConfig';
import type { Reper } from '../../reperele';
import { durataRo } from '../../reperele';
import { useContext, useMemo } from 'react';
import { Grup, Camp, LinieDeTimp, Blocat } from '../primitive';
import { laDatetimeLocal, dinDatetimeLocal, descrieMoment } from '../../eventConfigFields';
import { DURATE, AVANSURI_LEADERBOARD, oreCheckin, sambeteleUrmatoare, FUSURI } from '../ajutoare';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
  erori: Map<string, string>;
  areEroare: (campuri: string[]) => boolean;
  acum: number;
  repere: Reper[];
  mutareOferita: { delta: number; nume: string[] } | null;
  /** Mută toate reperele odată cu startul. */
  onMutaTot: () => void;
  /** Ancorează startul curent, ca să nu se mai ofere mutarea. */
  onAncoreaza: (start: string) => void;
};

/** „Când": data, ora, durata, check-inul și fusul — plus cronologia derivată. */
export const GrupCand = ({ ciorna, seteaza, erori, areEroare, acum, repere, mutareOferita, onMutaTot, onAncoreaza }: Props) => {
  // Derivat, nu primit: harta e doar un index peste `repere`, iar ca prop ar fi
  // fost încă o valoare de ținut în sincron cu lista din care vine.
  const ocupat = useContext(Blocat);
  const reperPe = useMemo(() => new Map(repere.map((r) => [r.cheie, r])), [repere]);
  return (
  <Grup
    titlu="Când"
    ajutor="Toate orele sunt locale, în fusul de mai jos. Sub fiecare dată scrie ce înseamnă — verifică mai ales ziua săptămânii."
    areEroare={areEroare([
      'start',
      'durationHours',
      'checkinFrom',
      'registrationDeadline',
      'launchAt',
      'nextEditionAt',
      'leaderboardLeadHours',
      'tz',
    ])}
    rezumat={descrieMoment(ciorna.start, ciorna.tz, acum) || ciorna.start}
  >
    <LinieDeTimp repere={repere} />

    <Camp
      eticheta="Startul cursei"
      eroare={erori.get('start')}
      ecou={
        <>
          {descrieMoment(ciorna.start, ciorna.tz, acum)}
          <span className="admin-presetari">
            {sambeteleUrmatoare(acum, ciorna.start).map((s) => (
              <button
                key={s.eticheta}
                type="button"
                className="admin-chip"
                disabled={ocupat || s.moment === ciorna.start}
                onClick={() => seteaza('start', s.moment)}
              >
                {s.eticheta}
              </button>
            ))}
          </span>
        </>
      }
    >
      {(p) => (
        <input
          {...p}
          type="datetime-local"
          value={laDatetimeLocal(ciorna.start)}
          onChange={(e) => seteaza('start', dinDatetimeLocal(e.target.value))}
        />
      )}
    </Camp>

    {/* Mutarea startului, propagată în bloc.
        Stă lângă câmpul care a produs-o, nu în teancul de bannere de
        sus: e o ofertă despre ce tocmai s-a tastat, iar la trei ecrane
        distanță ar fi un reproș fără obiect. */}
    {mutareOferita && (
      <div className="admin-config-mutare" role="status">
        <span>
          Startul s-a mutat cu{' '}
          <strong>
            {durataRo(mutareOferita.delta)}{' '}
            {mutareOferita.delta > 0 ? 'mai târziu' : 'mai devreme'}
          </strong>
          . Mut la fel și {mutareOferita.nume.join(', ')}?
        </span>
        <span className="admin-config-mutare-butoane">
          <button
            type="button"
            className="admin-btn-accent"
            disabled={ocupat}
            onClick={onMutaTot}
          >
            Mută-le și pe ele
          </button>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={ocupat}
            onClick={() => onAncoreaza(ciorna.start)}
          >
            Le las cum sunt
          </button>
        </span>
      </div>
    )}

    <Camp
      eticheta="Durata"
      ajutor="Ore. După start + durată, pagina trece pe countdown-ul următorului antrenament."
      eroare={erori.get('durationHours')}
    >
      {(p) => (
        <select
          {...p}
          value={String(ciorna.durationHours)}
          onChange={(e) => seteaza('durationHours', Number(e.target.value))}
        >
          {DURATE.map((h) => (
            <option key={h} value={h}>
              {h === 1 ? '1 oră' : `${String(h).replace('.', ',')} ore`}
            </option>
          ))}
        </select>
      )}
    </Camp>
    <Camp
      eticheta="Check-in de la"
      ajutor="Ora la care se deschide check-inul, în ziua cursei. Opțiunile se măsoară față de start."
      eroare={erori.get('checkinFrom')}
      atentie={reperPe.get('checkin')?.problema}
      ecou={reperPe.get('checkin')?.fataDeStart}
    >
      {(p) => {
        const optiuni = oreCheckin(ciorna.start);
        return (
          <select
            {...p}
            value={ciorna.checkinFrom}
            onChange={(e) => seteaza('checkinFrom', e.target.value)}
          >
            {/* O valoare scrisa de mana care nu e in lista ramane vizibila,
                altfel selectul ar arata alta ora decat cea din document. */}
            {!optiuni.some((o) => o.valoare === ciorna.checkinFrom) && (
              <option value={ciorna.checkinFrom}>{ciorna.checkinFrom}</option>
            )}
            {optiuni.map((o) => (
              <option key={o.valoare} value={o.valoare}>
                {o.eticheta}
              </option>
            ))}
          </select>
        );
      }}
    </Camp>
    <Camp
      eticheta="Se închid înscrierile"
      ajutor="Nu poate fi după start."
      eroare={erori.get('registrationDeadline')}
      ecou={descrieMoment(ciorna.registrationDeadline, ciorna.tz, acum)}
    >
      {(p) => (
        <input
          {...p}
          type="datetime-local"
          value={laDatetimeLocal(ciorna.registrationDeadline)}
          onChange={(e) =>
            seteaza('registrationDeadline', dinDatetimeLocal(e.target.value))
          }
        />
      )}
    </Camp>
    <Camp
      eticheta="Se anunță ediția"
      ajutor="Până atunci homepage-ul poate sta pe Coming Soon, cu numărătoarea inversă spre momentul ăsta."
      eroare={erori.get('launchAt')}
      // Ciorna ediției următoare moștenește anunțul ediției trecute —
      // un moment deja consumat. Nimic nu-l semnala până acum.
      atentie={reperPe.get('launchAt')?.problema}
      ecou={descrieMoment(ciorna.launchAt, ciorna.tz, acum)}
    >
      {(p) => (
        <input
          {...p}
          type="datetime-local"
          value={laDatetimeLocal(ciorna.launchAt)}
          onChange={(e) => seteaza('launchAt', dinDatetimeLocal(e.target.value))}
        />
      )}
    </Camp>
    <Camp
      eticheta="Următorul antrenament"
      ajutor="După ce se termină cursa, pagina numără invers spre data asta. Trebuie să fie după finalul cursei."
      eroare={erori.get('nextEditionAt')}
      atentie={reperPe.get('nextEditionAt')?.problema}
      ecou={descrieMoment(ciorna.nextEditionAt, ciorna.tz, acum)}
    >
      {(p) => (
        <input
          {...p}
          type="datetime-local"
          value={laDatetimeLocal(ciorna.nextEditionAt)}
          onChange={(e) => seteaza('nextEditionAt', dinDatetimeLocal(e.target.value))}
        />
      )}
    </Camp>
    <Camp
      eticheta={'„Cine vine” apare cu'}
      ajutor="Atunci pagina scoate formularul și urcă lista de participanți sub hero."
      eroare={erori.get('leaderboardLeadHours')}
    >
      {(p) => (
        // Listă, nu număr liber: valoarea e „cu cât înainte", iar un
        // câmp gol produce `Number('') === 0`, adică „exact la start" —
        // o setare validă pe care n-a cerut-o nimeni.
        <select
          {...p}
          value={String(ciorna.leaderboardLeadHours)}
          onChange={(e) => seteaza('leaderboardLeadHours', Number(e.target.value))}
        >
          {!AVANSURI_LEADERBOARD.some((h) => h === ciorna.leaderboardLeadHours) && (
            <option value={String(ciorna.leaderboardLeadHours)}>
              {ciorna.leaderboardLeadHours} ore înainte de start
            </option>
          )}
          {AVANSURI_LEADERBOARD.map((h) => (
            <option key={h} value={h}>
              {h === 0
                ? 'Exact la start'
                : `${durataRo(h * 3_600_000)} înainte de start`}
            </option>
          ))}
        </select>
      )}
    </Camp>
    <Camp
      eticheta="Fusul orar"
      ajutor="Decalajul față de UTC, scris ca „+03:00”. Moldova: +03:00 vara, +02:00 iarna."
      eroare={erori.get('tz')}
    >
      {(p) => (
        <select {...p} value={ciorna.tz} onChange={(e) => seteaza('tz', e.target.value)}>
          {!FUSURI.some(([v]) => v === ciorna.tz) && (
            <option value={ciorna.tz}>{ciorna.tz}</option>
          )}
          {FUSURI.map(([valoare, eticheta]) => (
            <option key={valoare} value={valoare}>
              {eticheta}
            </option>
          ))}
        </select>
      )}
    </Camp>
  </Grup>
  );
};
