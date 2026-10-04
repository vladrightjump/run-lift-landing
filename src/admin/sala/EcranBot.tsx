import { useEffect, useState } from 'react';
import {
  pornesteBot,
  salveazaConfigBot,
  trimiteComanda,
  type ComandaAcum,
  type SalaConfig,
  type SalaMembru,
} from '../../lib/salaApi';
import { ziLunaOra } from '../../lib/formatare';
import { Dialog } from '../eventTab/Dialog';
import {
  ETICHETE_COMENZI,
  ETICHETE_STARE_COMANDA,
  ZILE,
  configEgal,
  dinServer,
  problemeConfig,
} from './configBot';
import { buildCustomMessageHtml } from './mesaj';
import { PrevizualizareSondaj } from './PrevizualizareSondaj';
import { StareComanda } from './StareComanda';
import { dataLunga, numeZi, plusZile, urmatorulSondaj } from './sondaj';
import { zileAnulate } from './model';
import { stareBot } from './stareBot';
import { useSala } from './useSala';

const CLASA_STARE_BOT = {
  normal: 'admin-sala-stare-bot admin-sala-stare-bot--normal',
  oprit: 'admin-sala-stare-bot admin-sala-stare-bot--oprit',
  'nu-raspunde': 'admin-sala-stare-bot admin-sala-stare-bot--nu-raspunde',
} as const;

type Props = {
  inregistreazaGardaIesire: (garda: (() => boolean) | null) => void;
};

/**
 * Botul de Telegram — configurat din când în când, verificat dintr-o privire
 * (R11–R14, F3).
 *
 * Sus, răspunsul la „merge?": dacă botul e pornit, dacă răspunde și când pleacă
 * următorul sondaj. Apoi setările (orarul și textul sondajului, cu
 * previzualizarea mesajului din grup), comenzile „acum" și jurnalul lor.
 *
 * Setările se salvează explicit, cu gardă la ieșire: o schimbare de oră lăsată
 * nesalvată ar însemna un sondaj care pleacă la ora veche fără ca nimeni să știe
 * de ce. Pornit/oprit, în schimb, se aplică pe loc — e un comutator, ca în gym-app.
 */
export const EcranBot = ({ inregistreazaGardaIesire }: Props) => {
  const { date, eroare, ocupat, fa } = useSala();
  const salvat = date ? dinServer(date.config) : null;
  const [ciorna, setCiorna] = useState<SalaConfig | null>(null);
  const [deConfirmat, setDeConfirmat] = useState<ComandaAcum | null>(null);

  // Formularul pornește din setările salvate și nu le mai urmează după ce l-ai
  // atins: reîmprospătarea de la 15 secunde n-are voie să-ți șteargă ce scrii.
  // Excepție: pornit/oprit. Îl schimbă doar comutatorul, pe loc, deci ciorna nu
  // are voie să poarte o valoare veche (și nici s-o salveze înapoi).
  const forma = ciorna && salvat ? { ...ciorna, enabled: salvat.enabled } : salvat;
  const nesalvat = forma !== null && salvat !== null && ciorna !== null && !configEgal(forma, salvat);

  const potPleca = (): boolean =>
    !nesalvat || window.confirm('Setările botului nu sunt salvate. Dacă pleci acum, se pierd. Continui?');

  useEffect(() => {
    inregistreazaGardaIesire(potPleca);
    return () => inregistreazaGardaIesire(null);
  });

  useEffect(() => {
    if (!nesalvat) return;
    const avertizeaza = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avertizeaza);
    return () => window.removeEventListener('beforeunload', avertizeaza);
  }, [nesalvat]);

  if (!date || !forma || !salvat) {
    return (
      <p className="admin-config-hint" role="status">
        {eroare ? 'Nu s-au putut încărca setările botului. Reîncearcă peste câteva secunde.' : 'Se încarcă…'}
      </p>
    );
  }

  const schimba = <K extends keyof SalaConfig>(cheie: K, valoare: SalaConfig[K]) =>
    setCiorna({ ...forma, [cheie]: valoare });
  const comutaZi = (cheie: 'poll_days' | 'summary_days', zi: number) =>
    schimba(cheie, forma[cheie].includes(zi) ? forma[cheie].filter((z) => z !== zi) : [...forma[cheie], zi].sort((a, b) => a - b));

  const probleme = problemeConfig(forma);
  const stare = stareBot(date.config?.enabled ?? null, date.comenzi, new Date());
  const anulate = zileAnulate(date);
  const sondaj = urmatorulSondaj(salvat.poll_days, salvat.poll_time, new Date(), anulate);
  const exempluData = urmatorulSondaj(forma.poll_days, forma.poll_time, new Date())?.antrenament ?? date.azi;
  // O comandă la fel, încă în așteptare: a doua apăsare n-ar trimite nimic în plus.
  const inAsteptare = new Set(date.comenzi.filter((c) => c.status === 'pending').map((c) => c.action));
  // „Trimite acum" e mereu despre antrenamentul de mâine (ziua de la Chișinău).
  const maine = date.antrenamente.find((a) => a.session_date === plusZile(date.azi, 1));
  const sondajMainePlecat = maine?.poll_sent === true && maine.status !== 'cancelled';

  return (
    <div className="admin-sala">
      <section
        className={CLASA_STARE_BOT[stare.tip]}
        aria-label="Starea botului"
        role="status"
      >
        <p className="admin-sala-zi">
          {stare.tip === 'nu-raspunde'
            ? 'Botul nu răspunde'
            : stare.tip === 'oprit'
              ? 'Botul e oprit'
              : 'Botul e pornit'}
        </p>
        <p className="admin-sala-cand">
          {stare.tip === 'nu-raspunde'
            ? `O comandă („${ETICHETE_COMENZI[stare.comanda.action]}") așteaptă de ${stare.minute} minute; botul le golește la fiecare minut. Verifică serviciul pe Railway.`
            : stare.tip === 'oprit'
              ? 'Sondajele programate nu pleacă. Comenzile „acum" merg în continuare.'
              : sondaj
                ? `Următorul sondaj: ${dataLunga(sondaj.data)} la ${sondaj.ora}, pentru antrenamentul de ${numeZi(sondaj.antrenament)}.`
                : 'Niciun sondaj programat: alege zilele mai jos.'}
        </p>
        {stare.tip === 'normal' && (
          <p className="admin-config-hint">
            {stare.ultimaExecutata
              ? `Nicio comandă blocată. Ultima executată de bot: ${ziLunaOra(stare.ultimaExecutata)}.`
              : 'Nicio comandă blocată.'}{' '}
            Dacă ai nevoie de o dovadă că botul rulează acum, trimite rezumatul: pleacă doar la admini.
          </p>
        )}
        <button
          type="button"
          className={salvat.enabled ? 'admin-btn-ghost' : 'admin-btn-accent'}
          disabled={ocupat}
          onClick={() =>
            void fa((t) => pornesteBot(t, !salvat.enabled), salvat.enabled ? 'Botul e oprit.' : 'Botul e pornit.')
          }
        >
          {salvat.enabled ? 'Oprește botul' : 'Pornește botul'}
        </button>
      </section>

      <form
        className="admin-config-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (probleme.length > 0 || !nesalvat) return;
          // Ce scrii cât se salvează nu se pierde: ciorna se golește doar dacă n-a
          // mai fost atinsă de la apăsare (fiecare schimbare face o ciornă nouă).
          const trimisa = ciorna;
          void fa((t) => salveazaConfigBot(t, { ...forma, enabled: salvat.enabled }), 'Setările botului sunt salvate.').then(
            (ok) => ok && setCiorna((c) => (c === trimisa ? null : c))
          );
        }}
      >
        <fieldset className="admin-config-grup">
          <legend>Sondajul</legend>
          <p className="admin-config-hint">
            Botul întreabă „vii mâine?", deci sondajul pleacă în ziua dinaintea antrenamentului.
          </p>
          <ZileSaptamana
            eticheta="Zilele sondajului"
            zile={forma.poll_days}
            onComuta={(z) => comutaZi('poll_days', z)}
          />
          <Camp eticheta="Ora sondajului" id="bot-ora-sondaj" valoare={forma.poll_time} tip="time" onSchimba={(v) => schimba('poll_time', v)} />
          <Camp eticheta="Ora antrenamentului" id="bot-ora-antrenament" valoare={forma.training_time} tip="time" onSchimba={(v) => schimba('training_time', v)} />
          <Camp eticheta="Locul" id="bot-loc" valoare={forma.location} onSchimba={(v) => schimba('location', v)} />
        </fieldset>

        <fieldset className="admin-config-grup">
          <legend>Textul sondajului</legend>
          <p className="admin-config-hint">
            Gol înseamnă textul de acum. Botul de azi trimite încă textul fix: cel de aici intră în
            sondaj abia după actualizarea botului, anunțată separat. De atunci, o schimbare ajunge
            la sondajul următor, iar unul deja în grup își păstrează textul.
          </p>
          <div className="admin-sala-text-sondaj">
            <div>
              <Camp
                eticheta="Titlu"
                id="bot-titlu"
                valoare={forma.poll_title ?? ''}
                indiciu="Antrenament mâine"
                onSchimba={(v) => schimba('poll_title', v)}
              />
              <Camp
                eticheta={'Butonul „vin”'}
                id="bot-da"
                valoare={forma.poll_yes_label ?? ''}
                indiciu="✅ Vin!"
                onSchimba={(v) => schimba('poll_yes_label', v)}
              />
              <Camp
                eticheta={'Butonul „nu pot”'}
                id="bot-nu"
                valoare={forma.poll_no_label ?? ''}
                indiciu="❌ Nu pot"
                onSchimba={(v) => schimba('poll_no_label', v)}
              />
            </div>
            <PrevizualizareSondaj
              text={{ titlu: forma.poll_title, da: forma.poll_yes_label, nu: forma.poll_no_label }}
              ora={forma.training_time}
              loc={forma.location}
              data={exempluData}
            />
          </div>
        </fieldset>

        <fieldset className="admin-config-grup">
          <legend>Rezumatul de dimineață și reminderul</legend>
          <p className="admin-config-hint">
            Rezumatul pleacă în privat, la admini. Reminderul pleacă în grup cu două ore înainte de
            antrenament, doar dacă au confirmat mai puțini decât pragul.
          </p>
          <ZileSaptamana
            eticheta="Zilele rezumatului"
            zile={forma.summary_days}
            onComuta={(z) => comutaZi('summary_days', z)}
          />
          <Camp eticheta="Ora rezumatului" id="bot-ora-rezumat" valoare={forma.summary_time} tip="time" onSchimba={(v) => schimba('summary_time', v)} />
          <label className="admin-sala-bifa">
            <input
              type="checkbox"
              checked={forma.auto_reminder_enabled}
              onChange={(e) => schimba('auto_reminder_enabled', e.target.checked)}
            />{' '}
            Reminder automat
          </label>
          <Camp
            eticheta="Pragul reminderului (confirmări)"
            id="bot-prag"
            tip="number"
            valoare={String(forma.reminder_threshold)}
            onSchimba={(v) => schimba('reminder_threshold', v === '' ? Number.NaN : Number(v))}
          />
        </fieldset>

        {probleme.length > 0 && (
          <ul className="admin-sala-probleme" role="alert">
            {probleme.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className="admin-table-actions">
          {nesalvat && <span className="admin-sala-nesalvat">Nesalvat</span>}
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={!nesalvat || ocupat}
            onClick={() => setCiorna(null)}
          >
            Renunță la modificări
          </button>
          <button type="submit" className="admin-btn-accent" disabled={!nesalvat || probleme.length > 0 || ocupat}>
            Salvează setările
          </button>
        </div>
      </form>

      <section className="admin-config-grup" aria-labelledby="bot-acum">
        <h3 id="bot-acum">Acum</h3>
        <p className="admin-config-hint">
          Botul execută comanda în cel mult un minut. Cât una așteaptă, butonul ei stă blocat.
        </p>
        <div className="admin-table-actions admin-sala-comenzi">
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={ocupat || inAsteptare.has('send_poll')}
            onClick={() => setDeConfirmat('send_poll')}
          >
            {inAsteptare.has('send_poll') ? 'Sondajul e în așteptare…' : 'Trimite sondajul acum'}
          </button>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={ocupat || inAsteptare.has('send_reminder')}
            onClick={() => setDeConfirmat('send_reminder')}
          >
            {inAsteptare.has('send_reminder') ? 'Reminderul e în așteptare…' : 'Trimite reminderul acum'}
          </button>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={ocupat || inAsteptare.has('send_summary')}
            onClick={() => void fa((t) => trimiteComanda(t, 'send_summary'), 'Rezumatul pleacă la admini în cel mult un minut.')}
          >
            {inAsteptare.has('send_summary') ? 'Rezumatul e în așteptare…' : 'Trimite rezumatul acum'}
          </button>
        </div>
      </section>

      <MesajGrup membri={date.membri} ocupat={ocupat} onTrimite={(html) => fa((t) => trimiteComanda(t, 'send_message', html), 'Mesajul pleacă în grup în cel mult un minut.')} />

      <section className="admin-config-grup" aria-labelledby="bot-jurnal">
        <h3 id="bot-jurnal">Ultimele comenzi</h3>
        {date.comenzi.length === 0 ? (
          <p className="admin-config-hint">Nicio comandă încă.</p>
        ) : (
          <ul className="admin-sala-lista">
            {date.comenzi.map((c) => (
              <li key={c.id} className="admin-sala-rand">
                <span className="admin-sala-nume">{ETICHETE_COMENZI[c.action]}</span>
                <span className="admin-sala-detaliu">
                  {ziLunaOra(c.created_at)}
                </span>
                <StareComanda comanda={c}>
                  {ETICHETE_STARE_COMANDA[c.status]}
                  {c.status === 'failed' && c.result ? `: ${c.result}` : ''}
                </StareComanda>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deConfirmat && (
        <Dialog
          titlu={deConfirmat === 'send_poll' ? 'Trimiți sondajul acum?' : 'Trimiți reminderul acum?'}
          rol="alertdialog"
          onInchide={() => setDeConfirmat(null)}
        >
          <p>
            {deConfirmat === 'send_poll'
              ? sondajMainePlecat
                ? 'Sondajul pentru mâine e deja în grup. Botul postează unul NOU, iar cel vechi rămâne: membrii vor vedea două. Trimite doar dacă primul s-a pierdut.'
                : 'Botul postează în grup sondajul pentru antrenamentul de mâine.'
              : 'Botul scrie în grup și îi pomenește pe membrii activi care n-au răspuns încă la sondajul de mâine.'}
          </p>
          <div className="admin-table-actions">
            <button type="button" className="admin-btn-ghost" onClick={() => setDeConfirmat(null)}>
              Nu trimite
            </button>
            <button
              type="button"
              className="admin-btn-accent"
              onClick={() => {
                const c = deConfirmat;
                setDeConfirmat(null);
                void fa(
                  (t) => trimiteComanda(t, c),
                  c === 'send_poll' ? 'Sondajul apare în grup în cel mult un minut.' : 'Reminderul pleacă în cel mult un minut.'
                );
              }}
            >
              Trimite
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

type PropsCamp = {
  eticheta: string;
  id: string;
  valoare: string;
  tip?: 'text' | 'time' | 'number';
  indiciu?: string;
  onSchimba: (v: string) => void;
};

const Camp = ({ eticheta, id, valoare, tip = 'text', indiciu, onSchimba }: PropsCamp) => (
  <div className="admin-config-camp">
    <label className="admin-config-eticheta" htmlFor={id}>
      {eticheta}
    </label>
    <input
      id={id}
      type={tip}
      min={tip === 'number' ? 0 : undefined}
      autoComplete="off"
      placeholder={indiciu}
      value={valoare}
      onChange={(e) => onSchimba(e.target.value)}
    />
  </div>
);

type PropsZile = {
  eticheta: string;
  zile: number[];
  onComuta: (zi: number) => void;
};

const ZileSaptamana = ({ eticheta, zile, onComuta }: PropsZile) => (
  <div className="admin-config-camp">
    <span className="admin-config-eticheta">{eticheta}</span>
    <div className="admin-cs-comutator" role="group" aria-label={eticheta}>
      {ZILE.map(([zi, scurt]) => (
        <button
          key={zi}
          type="button"
          className={`admin-sala-filtru${zile.includes(zi) ? ' activ' : ''}`}
          aria-pressed={zile.includes(zi)}
          onClick={() => onComuta(zi)}
        >
          {scurt}
        </button>
      ))}
    </div>
  </div>
);

type PropsMesaj = {
  membri: SalaMembru[];
  ocupat: boolean;
  onTrimite: (html: string) => Promise<boolean>;
};

/** Un mesaj liber în grup, cu mențiuni (R13). Limita Telegram se verifică înainte. */
const MesajGrup = ({ membri, ocupat, onTrimite }: PropsMesaj) => {
  const [text, setText] = useState('');
  const [mentiuni, setMentiuni] = useState<SalaMembru[]>([]);
  const [confirmare, setConfirmare] = useState(false);
  const deMentionat = membri.filter((m) => m.status === 'active' && (m.telegram_user_id != null || m.telegram_username));

  const html = buildCustomMessageHtml(
    text,
    mentiuni.map((m) => ({ fullName: m.full_name, telegramUserId: m.telegram_user_id, telegramUsername: m.telegram_username }))
  );
  const preaLung = html.length > 4096;

  return (
    <section className="admin-config-grup" aria-labelledby="bot-mesaj">
      <h3 id="bot-mesaj">Mesaj în grup</h3>
      <p className="admin-config-hint">
        Alege un membru din listă ca să-l pomenești: în text apare „@Nume", iar în Telegram devine o
        mențiune care îl anunță.
      </p>
      {/* Blocate cât pleacă o scriere: după trimitere, textul se golește, deci ce
          s-ar scrie între timp s-ar pierde. */}
      <textarea
        aria-label="Textul mesajului"
        rows={4}
        value={text}
        disabled={ocupat}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="admin-sala-filtre">
        <select
          aria-label="Pomenește un membru"
          value=""
          disabled={ocupat}
          onChange={(e) => {
            const m = deMentionat.find((x) => x.id === e.target.value);
            if (!m) return;
            setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${m.full_name} `);
            setMentiuni((v) => (v.some((x) => x.id === m.id) ? v : [...v, m]));
          }}
        >
          <option value="">Pomenește pe cineva…</option>
          {deMentionat.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn-accent"
          disabled={ocupat || text.trim() === '' || preaLung}
          onClick={() => setConfirmare(true)}
        >
          Trimite în grup
        </button>
      </div>
      {preaLung && <p className="admin-sala-motiv">Mesajul trece de limita Telegram. Scurtează-l sau scoate câteva mențiuni.</p>}

      {confirmare && (
        <Dialog titlu="Trimiți mesajul în grup?" rol="alertdialog" onInchide={() => setConfirmare(false)}>
          <p className="admin-sala-citat">{text.trim()}</p>
          <div className="admin-table-actions">
            <button type="button" className="admin-btn-ghost" onClick={() => setConfirmare(false)}>
              Nu trimite
            </button>
            <button
              type="button"
              className="admin-btn-accent"
              onClick={() => {
                setConfirmare(false);
                void onTrimite(html).then((ok) => {
                  if (ok) {
                    setText('');
                    setMentiuni([]);
                  }
                });
              }}
            >
              Trimite
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
};

