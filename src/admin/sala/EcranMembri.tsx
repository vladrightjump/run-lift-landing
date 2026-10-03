import { useMemo, useState } from 'react';
import {
  leagaCont,
  membruDinCont,
  salveazaMembru,
  scoateDinGrup,
  unesteMembri,
  type DateMembru,
  type SalaComanda,
  type SalaDate,
  type SalaMembru,
} from '../../lib/salaApi';
import { Dialog } from '../eventTab/Dialog';
import { StareComanda } from './StareComanda';
import { DialogScoatere, motivFaraScoatere } from './DialogScoatere';
import { prezentePeMembru } from './analiza';
import { ziSiData } from './sondaj';
import { useSala } from './useSala';

/**
 * Membrii grupului — lista ținută la zi (R8, R9, F2).
 *
 * Trei treburi, în ordinea în care apar: conturile de Telegram pe care botul nu
 * le-a recunoscut (au votat, dar voturile nu se numără nimănui), lista însăși
 * și scoaterea cuiva din grup. Ștergerea definitivă NU există (KTD7): ar șterge
 * și istoricul de prezențe; starea „ieșit", scoaterea și unirea duplicatelor
 * acoperă aceleași nevoi.
 */

type Filtru = 'active' | 'paused' | 'cancelled' | 'toti';

const FILTRE: [Filtru, string][] = [
  ['active', 'Activi'],
  ['paused', 'În pauză'],
  ['cancelled', 'Ieșiți'],
  ['toti', 'Toți'],
];

const ETICHETE_STARE: Record<SalaMembru['status'], string> = {
  active: 'activ',
  paused: 'în pauză',
  cancelled: 'ieșit',
};

const numeCont = (c: { first_name: string | null; last_name: string | null; username: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ') || (c.username ? `@${c.username}` : 'Fără nume');

/** Ultima comandă de scoatere pentru fiecare membru — rezultatul ei se vede pe rând. */
const ultimeleScoateri = (comenzi: SalaComanda[]): Map<string, SalaComanda> => {
  const m = new Map<string, SalaComanda>();
  for (const c of comenzi) {
    if (c.action === 'kick_member' && c.member_id && !m.has(c.member_id)) m.set(c.member_id, c);
  }
  return m;
};

const textScoatere = (c: SalaComanda): string =>
  c.status === 'pending'
    ? 'scoatere în așteptare'
    : c.status === 'done'
      ? 'scos din grup'
      : `scoaterea a eșuat${c.result ? `: ${c.result}` : ''}`;

export const EcranMembri = () => {
  const { date, eroare, ocupat, fa } = useSala();
  const [cauta, setCauta] = useState('');
  const [filtru, setFiltru] = useState<Filtru>('active');
  const [deEditat, setDeEditat] = useState<SalaMembru | null>(null);
  const [deScos, setDeScos] = useState<SalaMembru | null>(null);
  const [unire, setUnire] = useState(false);

  const ultimaPrezenta = useMemo(
    () => (date ? prezentePeMembru(date).ultima : new Map<string, string>()),
    [date]
  );

  if (!date) {
    return (
      <p className="admin-config-hint" role="status">
        {eroare ? 'Nu s-au putut încărca membrii. Reîncearcă peste câteva secunde.' : 'Se încarcă…'}
      </p>
    );
  }

  const scoateri = ultimeleScoateri(date.comenzi);
  const termen = cauta.trim().toLowerCase().replace(/^@/, '');
  const vizibili = date.membri.filter(
    (m) =>
      (filtru === 'toti' || m.status === filtru) &&
      (termen === '' ||
        m.full_name.toLowerCase().includes(termen) ||
        (m.telegram_username ?? '').toLowerCase().includes(termen))
  );

  return (
    <div className="admin-sala">
      {date.necunoscuti.length > 0 && (
        <section className="admin-config-grup admin-sala-necunoscuti" aria-labelledby="sala-necunoscuti">
          <h3 id="sala-necunoscuti">
            Conturi de Telegram nelegate <span className="admin-tab-alert">{date.necunoscuti.length}</span>
          </h3>
          <p className="admin-config-hint">
            Au votat în grup, dar botul nu știe cine sunt, deci voturile lor nu se numără. Leagă
            fiecare cont de un membru — sau fă din el un membru nou.
          </p>
          <ul className="admin-sala-lista">
            {date.necunoscuti.map((c) => (
              <ContNelegat
                key={c.telegram_user_id}
                nume={numeCont(c)}
                utilizator={c.username}
                membri={date.membri.filter((m) => m.telegram_user_id == null)}
                ocupat={ocupat}
                onLeaga={(membru) =>
                  void fa((t) => leagaCont(t, c.telegram_user_id, membru.id), `Contul e legat de ${membru.full_name}.`)
                }
                onMembruNou={() =>
                  void fa((t) => membruDinCont(t, c.telegram_user_id, numeCont(c)), `${numeCont(c)} e membru nou.`)
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="admin-config-grup" aria-labelledby="sala-membri">
        <h3 id="sala-membri">Membrii</h3>
        <div className="admin-sala-filtre">
          <input
            type="search"
            className="admin-sala-cauta"
            placeholder="Caută după nume sau @utilizator"
            aria-label="Caută un membru"
            value={cauta}
            onChange={(e) => setCauta(e.target.value)}
          />
          <div className="admin-cs-comutator" role="group" aria-label="Filtrează după stare">
            {FILTRE.map(([cheie, eticheta]) => (
              <button
                key={cheie}
                type="button"
                className={`admin-sala-filtru${filtru === cheie ? ' activ' : ''}`}
                aria-pressed={filtru === cheie}
                onClick={() => setFiltru(cheie)}
              >
                {eticheta}
              </button>
            ))}
          </div>
        </div>

        {vizibili.length === 0 ? (
          <p className="admin-config-hint">Niciun membru nu se potrivește.</p>
        ) : (
          <ul className="admin-sala-lista">
            {vizibili.map((m) => {
              const k = scoateri.get(m.id);
              const ultima = ultimaPrezenta.get(m.id);
              const motiv = motivFaraScoatere(m);
              return (
                <li key={m.id} className="admin-sala-rand admin-sala-membru">
                  <span className="admin-sala-nume">
                    {m.full_name}
                    {m.is_admin && <span className="admin-sala-eticheta-mica">admin</span>}
                  </span>
                  <span className="admin-sala-detaliu">
                    {m.telegram_username ? `@${m.telegram_username}` : m.telegram_user_id ? 'Telegram legat' : 'fără Telegram'}
                    {' · '}
                    {ETICHETE_STARE[m.status]}
                    {' · '}
                    {ultima ? `ultima dată ${ziSiData(ultima)?.split(', ')[1] ?? ultima}` : 'n-a venit încă'}
                    {k && (
                      <StareComanda comanda={k}> · {textScoatere(k)}</StareComanda>
                    )}
                  </span>
                  <span className="admin-sala-actiuni">
                    <button type="button" className="admin-btn-ghost" onClick={() => setDeEditat(m)}>
                      Editează
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={ocupat || motiv !== null}
                      title={motiv ?? undefined}
                      aria-label={motiv ? `Scoate din grup: ${motiv}` : `Scoate-l pe ${m.full_name} din grup`}
                      onClick={() => setDeScos(m)}
                    >
                      Scoate din grup
                    </button>
                  </span>
                  {motiv && m.status !== 'cancelled' && (
                    <span className="admin-sala-motiv">{motiv}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={date.membri.length < 2}
            onClick={() => setUnire(true)}
          >
            Unește doi membri (duplicat)
          </button>
        </div>
      </section>

      {deEditat && (
        <DialogMembru
          membru={deEditat}
          ocupat={ocupat}
          onInchide={() => setDeEditat(null)}
          onSalveaza={(d) =>
            void fa((t) => salveazaMembru(t, deEditat.id, d), `${d.nume} e salvat.`).then(
              (ok) => ok && setDeEditat(null)
            )
          }
        />
      )}

      {deScos && (
        <DialogScoatere
          membru={deScos}
          ocupat={ocupat}
          onInchide={() => setDeScos(null)}
          onConfirma={() => {
            const m = deScos;
            setDeScos(null);
            void fa((t) => scoateDinGrup(t, m.id), `${m.full_name} iese din grup în cel mult un minut.`);
          }}
        />
      )}

      {unire && (
        <DialogUnire
          date={date}
          ocupat={ocupat}
          onInchide={() => setUnire(false)}
          onUneste={(pastrat, eliminat) =>
            void fa(
              (t) => unesteMembri(t, pastrat.id, eliminat.id),
              `${eliminat.full_name} a fost unit în ${pastrat.full_name}.`
            ).then((ok) => ok && setUnire(false))
          }
        />
      )}
    </div>
  );
};

type PropsCont = {
  nume: string;
  utilizator: string | null;
  /** Membrii care încă n-au cont legat — singurii de care se poate lega. */
  membri: SalaMembru[];
  ocupat: boolean;
  onLeaga: (m: SalaMembru) => void;
  onMembruNou: () => void;
};

const ContNelegat = ({ nume, utilizator, membri, ocupat, onLeaga, onMembruNou }: PropsCont) => {
  const [ales, setAles] = useState('');
  const membru = membri.find((m) => m.id === ales);
  return (
    <li className="admin-sala-rand admin-sala-cont">
      <span className="admin-sala-nume">
        {nume}
        {utilizator && <span className="admin-sala-detaliu"> @{utilizator}</span>}
      </span>
      <span className="admin-sala-actiuni">
        <select
          aria-label={`Membrul de care se leagă contul lui ${nume}`}
          value={ales}
          onChange={(e) => setAles(e.target.value)}
        >
          <option value="">Alege membrul…</option>
          {membri.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={ocupat || !membru}
          onClick={() => membru && onLeaga(membru)}
        >
          Leagă
        </button>
        <button type="button" className="admin-btn-ghost" disabled={ocupat} onClick={onMembruNou}>
          Membru nou
        </button>
      </span>
    </li>
  );
};

type PropsMembru = {
  membru: SalaMembru;
  ocupat: boolean;
  onInchide: () => void;
  onSalveaza: (d: DateMembru) => void;
};

/** Editarea unui membru: numele, contul de Telegram, starea și statutul de admin. */
const DialogMembru = ({ membru: m, ocupat, onInchide, onSalveaza }: PropsMembru) => {
  const [nume, setNume] = useState(m.full_name);
  const [tgId, setTgId] = useState(m.telegram_user_id == null ? '' : String(m.telegram_user_id));
  const [tgUser, setTgUser] = useState(m.telegram_username ?? '');
  const [stare, setStare] = useState<SalaMembru['status']>(m.status);
  const [admin, setAdmin] = useState(m.is_admin);

  const idValid = tgId.trim() === '' || /^\d{3,15}$/.test(tgId.trim());
  const userValid = /^@?[A-Za-z0-9_]{0,40}$/.test(tgUser.trim());
  const numeValid = nume.replace(/\s+/g, ' ').trim().length >= 2;

  return (
    <Dialog titlu={`Editează: ${m.full_name}`} onInchide={onInchide}>
      <form
        className="admin-sala-formular"
        onSubmit={(e) => {
          e.preventDefault();
          if (!idValid || !userValid || !numeValid) return;
          onSalveaza({
            nume,
            telegramId: tgId.trim() === '' ? null : Number(tgId.trim()),
            telegramUser: tgUser.trim() === '' ? null : tgUser.trim(),
            status: stare,
            admin,
          });
        }}
      >
        <label className="admin-config-eticheta" htmlFor="sala-m-nume">
          Nume
        </label>
        <input id="sala-m-nume" type="text" value={nume} onChange={(e) => setNume(e.target.value)} />
        {!numeValid && <span className="admin-sala-motiv">Cel puțin două litere.</span>}

        <label className="admin-config-eticheta" htmlFor="sala-m-tgid">
          Id Telegram
        </label>
        <input
          id="sala-m-tgid"
          type="text"
          inputMode="numeric"
          value={tgId}
          onChange={(e) => setTgId(e.target.value)}
        />
        {!idValid && <span className="admin-sala-motiv">Doar cifre (3–15).</span>}

        <label className="admin-config-eticheta" htmlFor="sala-m-tguser">
          Utilizator Telegram
        </label>
        <input id="sala-m-tguser" type="text" value={tgUser} onChange={(e) => setTgUser(e.target.value)} />
        {!userValid && <span className="admin-sala-motiv">Doar litere, cifre și „_”.</span>}

        <label className="admin-config-eticheta" htmlFor="sala-m-stare">
          Stare
        </label>
        <select
          id="sala-m-stare"
          value={stare}
          onChange={(e) => setStare(e.target.value as SalaMembru['status'])}
        >
          <option value="active">Activ</option>
          <option value="paused">În pauză</option>
          <option value="cancelled">Ieșit</option>
        </select>

        <label className="admin-sala-bifa">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Admin în grup
          (nu poate fi scos)
        </label>

        <div className="admin-table-actions">
          <button type="button" className="admin-btn-ghost" onClick={onInchide}>
            Renunță
          </button>
          <button
            type="submit"
            className="admin-btn-accent"
            disabled={ocupat || !idValid || !userValid || !numeValid}
          >
            Salvează
          </button>
        </div>
      </form>
    </Dialog>
  );
};

type PropsUnire = {
  date: SalaDate;
  ocupat: boolean;
  onInchide: () => void;
  onUneste: (pastrat: SalaMembru, eliminat: SalaMembru) => void;
};

/** Unirea a doi membri: răspunsurile trec pe cel păstrat, duplicatul dispare. */
const DialogUnire = ({ date, ocupat, onInchide, onUneste }: PropsUnire) => {
  const [pastratId, setPastratId] = useState('');
  const [eliminatId, setEliminatId] = useState('');
  const pastrat = date.membri.find((m) => m.id === pastratId);
  const eliminat = date.membri.find((m) => m.id === eliminatId);
  const acelasi = pastratId !== '' && pastratId === eliminatId;

  return (
    <Dialog titlu="Unește doi membri" onInchide={onInchide}>
      <p className="admin-config-hint">
        Pentru aceeași persoană înregistrată de două ori. Răspunsurile duplicatului trec pe membrul
        păstrat, contul de Telegram la fel dacă păstratul n-are, iar duplicatul dispare.
      </p>
      <div className="admin-sala-formular">
        <label className="admin-config-eticheta" htmlFor="sala-u-pastrat">
          Păstrează
        </label>
        <select id="sala-u-pastrat" value={pastratId} onChange={(e) => setPastratId(e.target.value)}>
          <option value="">Alege…</option>
          {date.membri.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <label className="admin-config-eticheta" htmlFor="sala-u-eliminat">
          Duplicatul (dispare)
        </label>
        <select id="sala-u-eliminat" value={eliminatId} onChange={(e) => setEliminatId(e.target.value)}>
          <option value="">Alege…</option>
          {date.membri.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        {acelasi && <span className="admin-sala-motiv">Alege doi membri diferiți.</span>}
        {pastrat && eliminat && !acelasi && (
          <p>
            Rămâne <strong>{pastrat.full_name}</strong>; <strong>{eliminat.full_name}</strong> dispare,
            cu răspunsurile mutate pe {pastrat.full_name}.
          </p>
        )}
      </div>
      <div className="admin-table-actions">
        <button type="button" className="admin-btn-ghost" onClick={onInchide}>
          Renunță
        </button>
        <button
          type="button"
          className="admin-btn-accent"
          disabled={ocupat || !pastrat || !eliminat || acelasi}
          onClick={() => pastrat && eliminat && onUneste(pastrat, eliminat)}
        >
          Unește
        </button>
      </div>
    </Dialog>
  );
};
