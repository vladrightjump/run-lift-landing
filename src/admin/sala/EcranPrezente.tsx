import { useState } from 'react';
import {
  seteazaAntrenament,
  seteazaPrezenta,
  type SalaAntrenament,
  type SalaDate,
  type SalaMembru,
} from '../../lib/salaApi';
import { Dialog } from '../eventTab/Dialog';
import { antrenamentulUrmator, cineVine, raspunsul, zileAnulate } from './model';
import { dataLunga, frazaSondaj, urmatorulSondaj } from './sondaj';
import { useSala } from './useSala';

/**
 * Prezențe — „câți vin la antrenamentul următor?" (R5–R7, F1).
 *
 * Întrebarea săptămânală, deci prima pe ecran și cu răspunsul mare: cifra de
 * „vin" se citește de la distanță, în dimineața antrenamentului, de pe telefon.
 * Dedesubt, numele, ca să știi CINE — și, lângă fiecare, corectura de mână
 * pentru cine a venit fără să apese (R6).
 *
 * Ecranul nu repetă sondajul: n-are butoane „trimite", alea stau la bot. Aici
 * se vede și se corectează ce a ieșit din el.
 */

type Raspuns = 'yes' | 'no' | 'clear';

export const EcranPrezente = () => {
  const { date, eroare, ocupat, fa } = useSala();
  const [deAnulat, setDeAnulat] = useState<SalaAntrenament | null>(null);
  const [ziDeAnulat, setZiDeAnulat] = useState('');
  const [trecuteVizibile, setTrecuteVizibile] = useState(6);

  if (!date) {
    return (
      <p className="admin-config-hint" role="status">
        {eroare ? 'Nu s-au putut încărca prezențele. Reîncearcă peste câteva secunde.' : 'Se încarcă…'}
      </p>
    );
  }

  const urm = antrenamentulUrmator(date);
  const marcheaza = (sesiune: string, m: SalaMembru, r: Raspuns) =>
    void fa(
      (t) => seteazaPrezenta(t, sesiune, m.id, r),
      r === 'clear' ? `Răspunsul lui ${m.full_name} a fost șters.` : `${m.full_name}: ${r === 'yes' ? 'vine' : 'nu vine'}.`
    );

  const anulate = date.antrenamente
    .filter((a) => a.status === 'cancelled' && a.session_date >= date.azi)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
  const trecute = date.antrenamente.filter(
    (a) => a.session_date < date.azi && a.status !== 'cancelled'
  );

  return (
    <div className="admin-sala">
      {urm ? (
        <AntrenamentUrmator
          date={date}
          antrenament={urm}
          ocupat={ocupat}
          onMarcheaza={marcheaza}
          onAnuleaza={() => setDeAnulat(urm)}
        />
      ) : (
        <FaraAntrenament date={date} />
      )}

      <section className="admin-config-grup" aria-labelledby="sala-anulari">
        <h3 id="sala-anulari">Zile anulate</h3>
        <p className="admin-config-hint">
          Pentru o zi anulată botul nu trimite sondaj. Poți anula și o zi pentru care sondajul n-a
          plecat încă.
        </p>
        {anulate.length > 0 && (
          <ul className="admin-sala-lista">
            {anulate.map((a) => (
              <li key={a.id} className="admin-sala-rand">
                <span className="admin-sala-nume">{dataLunga(a.session_date)}</span>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={ocupat}
                  onClick={() =>
                    void fa(
                      (t) => seteazaAntrenament(t, a.session_date, false),
                      `${dataLunga(a.session_date)} e din nou programat.`
                    )
                  }
                >
                  Reactivează
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="admin-sala-anulare"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ziDeAnulat) return;
            void fa(
              (t) => seteazaAntrenament(t, ziDeAnulat, true),
              `${dataLunga(ziDeAnulat)} e anulat.`
            ).then((ok) => ok && setZiDeAnulat(''));
          }}
        >
          <label className="admin-config-eticheta" htmlFor="sala-zi-anulare">
            Anulează o zi
          </label>
          <input
            id="sala-zi-anulare"
            type="date"
            min={date.azi}
            value={ziDeAnulat}
            onChange={(e) => setZiDeAnulat(e.target.value)}
          />
          <button type="submit" className="admin-btn-ghost" disabled={ocupat || !ziDeAnulat}>
            Anulează ziua
          </button>
        </form>
      </section>

      <section className="admin-config-grup" aria-labelledby="sala-trecute">
        <h3 id="sala-trecute">Antrenamentele trecute</h3>
        {trecute.length === 0 ? (
          <p className="admin-config-hint">Încă niciun antrenament trecut.</p>
        ) : (
          <>
            {trecute.slice(0, trecuteVizibile).map((a) => (
              <AntrenamentTrecut key={a.id} date={date} antrenament={a} ocupat={ocupat} onMarcheaza={marcheaza} />
            ))}
            {trecute.length > trecuteVizibile && (
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => setTrecuteVizibile((n) => n + 10)}
              >
                Arată mai multe ({trecute.length - trecuteVizibile})
              </button>
            )}
          </>
        )}
      </section>

      {deAnulat && (
        <Dialog
          titlu={`Anulezi antrenamentul de ${dataLunga(deAnulat.session_date)}?`}
          rol="alertdialog"
          onInchide={() => setDeAnulat(null)}
        >
          <p>
            {deAnulat.poll_sent
              ? 'Sondajul a plecat deja, iar anularea nu anunță pe nimeni. Dacă vrei ca grupul să afle, trimite un mesaj din „Botul de Telegram".'
              : 'Botul nu va mai trimite sondajul pentru ziua asta.'}{' '}
            Se poate reactiva oricând.
          </p>
          <div className="admin-table-actions">
            <button type="button" className="admin-btn-ghost" onClick={() => setDeAnulat(null)}>
              Nu anula
            </button>
            <button
              type="button"
              className="admin-btn-accent"
              disabled={ocupat}
              onClick={() => {
                const zi = deAnulat.session_date;
                setDeAnulat(null);
                void fa((t) => seteazaAntrenament(t, zi, true), `${dataLunga(zi)} e anulat.`);
              }}
            >
              Anulează antrenamentul
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

type PropsUrmator = {
  date: SalaDate;
  antrenament: SalaAntrenament;
  ocupat: boolean;
  onMarcheaza: (sesiune: string, m: SalaMembru, r: Raspuns) => void;
  onAnuleaza: () => void;
};

const AntrenamentUrmator = ({ date, antrenament: a, ocupat, onMarcheaza, onAnuleaza }: PropsUrmator) => {
  const c = cineVine(date, a.id);
  const sondaj = a.poll_sent
    ? 'Sondajul a plecat în grup.'
    : (() => {
        const s = urmatorulSondaj(date.config?.poll_days, date.config?.poll_time, new Date(), zileAnulate(date));
        return s && s.antrenament === a.session_date ? frazaSondaj(s) : 'Sondajul n-a plecat încă.';
      })();

  return (
    <section className="admin-sala-urmator" aria-labelledby="sala-urmator">
      <p className="admin-saptamanal-eticheta">Antrenamentul următor</p>
      <h2 id="sala-urmator" className="admin-sala-zi">
        {dataLunga(a.session_date)}
      </h2>
      <p className="admin-sala-cand">
        {a.starts_at} · {a.location} · {sondaj}
      </p>

      <dl className="admin-sala-cifre">
        <div className="admin-sala-cifra admin-sala-cifra--vin">
          <dt>vin</dt>
          <dd>{c.vin.length}</dd>
        </div>
        <div className="admin-sala-cifra">
          <dt>nu vin</dt>
          <dd>{c.nuVin.length}</dd>
        </div>
        <div className="admin-sala-cifra">
          <dt>n-au răspuns</dt>
          <dd>{c.nuAuRaspuns.length}</dd>
        </div>
      </dl>

      <div className="admin-sala-coloane">
        <ListaRaspuns zi={dataLunga(a.session_date)} titlu="Vin" membri={c.vin} gol="Nimeni încă." sesiune={a.id} date={date} ocupat={ocupat} onMarcheaza={onMarcheaza} />
        <ListaRaspuns zi={dataLunga(a.session_date)} titlu="Nu vin" membri={c.nuVin} gol="Nimeni." sesiune={a.id} date={date} ocupat={ocupat} onMarcheaza={onMarcheaza} />
        <ListaRaspuns
          zi={dataLunga(a.session_date)}
          titlu="N-au răspuns"
          membri={c.nuAuRaspuns}
          gol="Au răspuns toți."
          sesiune={a.id}
          date={date}
          ocupat={ocupat}
          onMarcheaza={onMarcheaza}
        />
      </div>

      <div className="admin-table-actions">
        <button type="button" className="admin-btn-ghost" disabled={ocupat} onClick={onAnuleaza}>
          Anulează antrenamentul
        </button>
      </div>
    </section>
  );
};

type PropsLista = {
  titlu: string;
  /** Ziua antrenamentului, în etichetele accesibile: aceleași nume apar și la antrenamentele trecute. */
  zi: string;
  membri: SalaMembru[];
  gol: string;
  sesiune: string;
  date: SalaDate;
  ocupat: boolean;
  onMarcheaza: (sesiune: string, m: SalaMembru, r: Raspuns) => void;
};

/** O coloană de nume, fiecare cu corectura de mână lângă el (R6). */
const ListaRaspuns = ({ titlu, zi, membri, gol, sesiune, date, ocupat, onMarcheaza }: PropsLista) => (
  <div className="admin-sala-coloana">
    <h3 className="admin-sala-coloana-titlu">
      {titlu} <span className="admin-tab-contor">{membri.length}</span>
    </h3>
    {membri.length === 0 ? (
      <p className="admin-config-hint">{gol}</p>
    ) : (
      <ul className="admin-sala-lista">
        {membri.map((m) => (
          <RandMembru key={m.id} membru={m} zi={zi} sesiune={sesiune} date={date} ocupat={ocupat} onMarcheaza={onMarcheaza} />
        ))}
      </ul>
    )}
  </div>
);

type PropsRand = {
  membru: SalaMembru;
  zi: string;
  sesiune: string;
  date: SalaDate;
  ocupat: boolean;
  onMarcheaza: (sesiune: string, m: SalaMembru, r: Raspuns) => void;
};

const RandMembru = ({ membru: m, zi, sesiune, date, ocupat, onMarcheaza }: PropsRand) => {
  const r = raspunsul(date, sesiune, m.id);
  return (
    <li className="admin-sala-rand">
      <span className="admin-sala-nume">{m.full_name}</span>
      <span className="admin-sala-marcaj" role="group" aria-label={`Prezența lui ${m.full_name}, ${zi}`}>
        <button
          type="button"
          className={`admin-sala-buton${r === 'yes' ? ' activ' : ''}`}
          aria-pressed={r === 'yes'}
          disabled={ocupat || r === 'yes'}
          onClick={() => onMarcheaza(sesiune, m, 'yes')}
        >
          Vine
        </button>
        <button
          type="button"
          className={`admin-sala-buton${r === 'no' ? ' activ' : ''}`}
          aria-pressed={r === 'no'}
          disabled={ocupat || r === 'no'}
          onClick={() => onMarcheaza(sesiune, m, 'no')}
        >
          Nu
        </button>
        {r !== null && (
          <button
            type="button"
            className="admin-sala-buton"
            disabled={ocupat}
            aria-label={`Șterge răspunsul lui ${m.full_name}, ${zi}`}
            onClick={() => onMarcheaza(sesiune, m, 'clear')}
          >
            ×
          </button>
        )}
      </span>
    </li>
  );
};

/** Fără antrenament creat: botul îl creează când trimite sondajul. */
const FaraAntrenament = ({ date }: { date: SalaDate }) => {
  const s = urmatorulSondaj(date.config?.poll_days, date.config?.poll_time, new Date(), zileAnulate(date));
  return (
    <section className="admin-sala-urmator" aria-labelledby="sala-urmator">
      <p className="admin-saptamanal-eticheta">Antrenamentul următor</p>
      <h2 id="sala-urmator" className="admin-sala-zi">
        {s ? dataLunga(s.antrenament) : 'Niciun sondaj programat'}
      </h2>
      <p className="admin-sala-cand">
        {date.config?.enabled === false
          ? 'Botul e oprit, deci sondajele programate nu pleacă.'
          : s
            ? `${frazaSondaj(s)} Lista apare aici pe măsură ce votează lumea.`
            : 'Alege zilele sondajului în „Botul de Telegram".'}
      </p>
    </section>
  );
};

type PropsTrecut = {
  date: SalaDate;
  antrenament: SalaAntrenament;
  ocupat: boolean;
  onMarcheaza: (sesiune: string, m: SalaMembru, r: Raspuns) => void;
};

/** Un antrenament trecut, strâns; deschis, aceleași liste și aceleași corecturi (R7). */
const AntrenamentTrecut = ({ date, antrenament: a, ocupat, onMarcheaza }: PropsTrecut) => {
  const c = cineVine(date, a.id);
  return (
    <details className="admin-sala-trecut">
      <summary>
        <span className="admin-sala-nume">{dataLunga(a.session_date)}</span>
        <span className="admin-config-hint">
          {c.vin.length} au venit · {c.nuVin.length} nu
        </span>
      </summary>
      <div className="admin-sala-coloane">
        <ListaRaspuns zi={dataLunga(a.session_date)} titlu="Au venit" membri={c.vin} gol="Nimeni." sesiune={a.id} date={date} ocupat={ocupat} onMarcheaza={onMarcheaza} />
        <ListaRaspuns zi={dataLunga(a.session_date)} titlu="N-au venit" membri={c.nuVin} gol="Nimeni." sesiune={a.id} date={date} ocupat={ocupat} onMarcheaza={onMarcheaza} />
        <ListaRaspuns
          zi={dataLunga(a.session_date)}
          titlu="Fără răspuns"
          membri={c.nuAuRaspuns}
          gol="Au răspuns toți."
          sesiune={a.id}
          date={date}
          ocupat={ocupat}
          onMarcheaza={onMarcheaza}
        />
      </div>
    </details>
  );
};
