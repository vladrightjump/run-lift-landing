import { useMemo, useState } from 'react';
import { scoateDinGrup, type SalaMembru } from '../../lib/salaApi';
import {
  filterByPeriod,
  filterPrevPeriod,
  sessionBreakdown,
  summarize,
  type Period,
} from './statistici';
import { istoricMembru, peZileleSaptamanii, randuriFrecventa, type StareFrecventa } from './analiza';
import { sesiuniPentruStatistici } from './model';
import { DialogScoatere, motivFaraScoatere } from './DialogScoatere';
import { ziSiData } from './sondaj';
import { useSala } from './useSala';

/**
 * Analiza prezențelor (R10) — tot ce arăta „Analiză" din gym-app.
 *
 * Inventarul de paritate (din `components/AnalizaView.tsx` și
 * `components/MemberAnalytics.tsx`): perioada (lună, 3 luni, an); prezența
 * medie cu tendința față de perioada dinainte; numărul de antrenamente;
 * recordul; media celor fără răspuns; fiecare antrenament ca bară vin / nu /
 * tăcere, cu detaliul celui ales; curba procentului „vin"; zilele săptămânii;
 * totalul vin / nu / tăcere; tabelul membrilor cu frecvența, starea (activ,
 * inactiv 2+ săpt., n-a venit), ultima prezență, filtru, sortare, istoricul pe
 * membru (ultimele 20, procent, tendință) și scoaterea din grup.
 *
 * Calculele nu se rescriu: vin din `statistici.ts` și `analiza.ts`, portate
 * din gym-app cu testele lor.
 */

const PERIOADE: [Period, string][] = [
  ['month', 'Luna'],
  ['quarter', '3 luni'],
  ['year', 'An'],
];

type Filtru = 'toti' | StareFrecventa;

const FILTRE: [Filtru, string][] = [
  ['toti', 'Toți'],
  ['activ', 'Activi'],
  ['inactiv', 'Inactivi 2+ săpt.'],
  ['niciodata', 'N-au venit'],
];

const ETICHETE_STARE: Record<StareFrecventa, string> = {
  activ: 'activ',
  inactiv: 'inactiv 2+ săpt.',
  niciodata: 'n-a venit',
};

const CLASA_STARE: Record<StareFrecventa, string> = {
  activ: 'admin-sala-stare admin-sala-stare--activ',
  inactiv: 'admin-sala-stare admin-sala-stare--inactiv',
  niciodata: 'admin-sala-stare admin-sala-stare--niciodata',
};

const CLASA_PUNCT = {
  yes: 'admin-sala-punct admin-sala-punct--yes',
  no: 'admin-sala-punct admin-sala-punct--no',
  tacere: 'admin-sala-punct',
} as const;

const scurt = (iso: string) => ziSiData(iso)?.split(', ')[1] ?? iso;

export const EcranAnaliza = () => {
  const { date, eroare, ocupat, fa } = useSala();
  const [perioada, setPerioada] = useState<Period>('month');
  const [ales, setAles] = useState<number | null>(null);
  const [filtru, setFiltru] = useState<Filtru>('toti');
  const [sortare, setSortare] = useState<'prezente' | 'nume'>('prezente');
  const [deschis, setDeschis] = useState<string | null>(null);
  const [deScos, setDeScos] = useState<SalaMembru | null>(null);

  const calc = useMemo(() => {
    if (!date) return null;
    const toate = sesiuniPentruStatistici(date);
    // Ancorat în „azi" de la Chișinău, nu în ceasul browserului.
    const acum = new Date(`${date.azi}T12:00:00Z`);
    const activi = date.membri.filter((m) => m.status === 'active').length;
    const felie = filterByPeriod(toate, perioada, acum)
      .slice()
      .sort((a, b) => a.session_date.localeCompare(b.session_date));
    const defalcari = felie.map((s) => sessionBreakdown(s, activi));
    return {
      felie,
      defalcari,
      rezumat: summarize(felie, filterPrevPeriod(toate, perioada, acum), activi),
      zile: peZileleSaptamanii(felie, defalcari),
      totalVin: defalcari.reduce((a, b) => a + b.yes, 0),
      totalNu: defalcari.reduce((a, b) => a + b.no, 0),
      totalTacere: defalcari.reduce((a, b) => a + b.none, 0),
      maxBara: Math.max(1, ...defalcari.map((b) => b.total)),
      randuri: randuriFrecventa(date),
    };
  }, [date, perioada]);

  if (!date || !calc) {
    return (
      <p className="admin-config-hint" role="status">
        {eroare ? 'Nu s-a putut încărca analiza. Reîncearcă peste câteva secunde.' : 'Se încarcă…'}
      </p>
    );
  }

  const { felie, defalcari, rezumat } = calc;
  const indexAles = felie.length ? Math.min(ales ?? felie.length - 1, felie.length - 1) : -1;
  const sesiuneAleasa = indexAles >= 0 ? felie[indexAles] : null;
  const defAleasa = indexAles >= 0 ? defalcari[indexAles] : null;
  const totalMix = calc.totalVin + calc.totalNu + calc.totalTacere || 1;

  const randuri = calc.randuri
    .filter((r) => filtru === 'toti' || r.stare === filtru)
    .sort((a, b) =>
      sortare === 'nume'
        ? a.membru.full_name.localeCompare(b.membru.full_name, 'ro')
        : b.prezente - a.prezente || a.membru.full_name.localeCompare(b.membru.full_name, 'ro')
    );

  // Curba procentului „vin", pe o grilă 100 × 44.
  const puncte = defalcari.map((b, i) => {
    const x = defalcari.length > 1 ? (i / (defalcari.length - 1)) * 100 : 50;
    return `${x.toFixed(2)},${(42 - (b.yesPct / 100) * 38).toFixed(2)}`;
  });

  return (
    <div className="admin-sala">
      <div className="admin-cs-comutator" role="group" aria-label="Perioada">
        {PERIOADE.map(([p, eticheta]) => (
          <button
            key={p}
            type="button"
            className={`admin-sala-filtru${perioada === p ? ' activ' : ''}`}
            aria-pressed={perioada === p}
            onClick={() => {
              setPerioada(p);
              setAles(null);
            }}
          >
            {eticheta}
          </button>
        ))}
      </div>

      <dl className="admin-sala-cifre admin-sala-cifre--patru">
        <div className="admin-sala-cifra admin-sala-cifra--vin">
          <dt>prezență medie</dt>
          <dd>{rezumat.avgPct}%</dd>
          <span className="admin-sala-sub">
            {rezumat.hasPrevious
              ? `${rezumat.trendPct >= 0 ? '▲' : '▼'} ${Math.abs(rezumat.trendPct)} p.p. față de perioada dinainte`
              : 'nimic de comparat încă'}
          </span>
        </div>
        <div className="admin-sala-cifra">
          <dt>antrenamente</dt>
          <dd>{rezumat.sessionCount}</dd>
          <span className="admin-sala-sub">în perioadă</span>
        </div>
        <div className="admin-sala-cifra">
          <dt>record</dt>
          <dd>{rezumat.record?.count ?? 0}</dd>
          <span className="admin-sala-sub">{rezumat.record ? scurt(rezumat.record.date) : '—'}</span>
        </div>
        <div className="admin-sala-cifra">
          <dt>fără răspuns</dt>
          <dd>{rezumat.avgNoResponse}</dd>
          <span className="admin-sala-sub">în medie, pe antrenament</span>
        </div>
      </dl>

      {felie.length === 0 ? (
        <p className="admin-config-hint">Niciun antrenament în perioada asta.</p>
      ) : (
        <>
          <section className="admin-config-grup" aria-labelledby="sala-bare">
            <h3 id="sala-bare">Fiecare antrenament</h3>
            <div className="admin-sala-bare" role="list">
              {felie.map((s, i) => {
                const b = defalcari[i];
                const h = (n: number) => `${(n / calc.maxBara) * 100}%`;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="listitem"
                    className={`admin-sala-bara${i === indexAles ? ' activ' : ''}`}
                    aria-label={`${ziSiData(s.session_date)}: ${b.yes} vin, ${b.no} nu, ${b.none} tăcere`}
                    aria-pressed={i === indexAles}
                    onClick={() => setAles(i)}
                  >
                    <span className="admin-sala-bara-tacere" style={{ height: h(b.none) }} />
                    <span className="admin-sala-bara-nu" style={{ height: h(b.no) }} />
                    <span className="admin-sala-bara-vin" style={{ height: h(b.yes) }} />
                  </button>
                );
              })}
            </div>
            {sesiuneAleasa && defAleasa && (
              <p className="admin-sala-cand" aria-live="polite">
                <strong>{ziSiData(sesiuneAleasa.session_date)}</strong>: {defAleasa.yes} vin ({defAleasa.yesPct}%) ·{' '}
                {defAleasa.no} nu ({defAleasa.noPct}%) · {defAleasa.none} tăcere ({defAleasa.nonePct}%)
              </p>
            )}
            <svg className="admin-sala-curba" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={puncte.join(' ')} />
            </svg>
            <p className="admin-config-hint">Curba: procentul celor care vin, de la primul antrenament din perioadă la ultimul.</p>
          </section>

          <div className="admin-sala-coloane admin-sala-coloane--doua">
            <section className="admin-config-grup" aria-labelledby="sala-zile">
              <h3 id="sala-zile">Pe zile</h3>
              <ul className="admin-sala-lista">
                {calc.zile.map((z) => (
                  <li key={z.zi} className="admin-sala-rand">
                    <span className="admin-sala-nume">{z.zi}</span>
                    <span className="admin-sala-progres" aria-hidden="true">
                      <span style={{ width: `${z.procent}%` }} />
                    </span>
                    <span className="admin-sala-detaliu">{z.procent}%</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="admin-config-grup" aria-labelledby="sala-mix">
              <h3 id="sala-mix">Toate răspunsurile</h3>
              <div className="admin-sala-mix" aria-hidden="true">
                <span className="admin-sala-bara-vin" style={{ width: `${(calc.totalVin / totalMix) * 100}%` }} />
                <span className="admin-sala-bara-nu" style={{ width: `${(calc.totalNu / totalMix) * 100}%` }} />
                <span className="admin-sala-bara-tacere" style={{ width: `${(calc.totalTacere / totalMix) * 100}%` }} />
              </div>
              <p className="admin-sala-cand">
                {calc.totalVin} vin · {calc.totalNu} nu · {calc.totalTacere} tăcere
              </p>
            </section>
          </div>
        </>
      )}

      <section className="admin-config-grup" aria-labelledby="sala-frecventa">
        <h3 id="sala-frecventa">Membrii</h3>
        <div className="admin-sala-filtre">
          <div className="admin-cs-comutator" role="group" aria-label="Filtrează membrii">
            {FILTRE.map(([f, eticheta]) => (
              <button
                key={f}
                type="button"
                className={`admin-sala-filtru${filtru === f ? ' activ' : ''}`}
                aria-pressed={filtru === f}
                onClick={() => setFiltru(f)}
              >
                {eticheta}
              </button>
            ))}
          </div>
          <select
            aria-label="Sortare"
            value={sortare}
            onChange={(e) => setSortare(e.target.value as 'prezente' | 'nume')}
          >
            <option value="prezente">După prezențe</option>
            <option value="nume">Alfabetic</option>
          </select>
        </div>

        {randuri.length === 0 ? (
          <p className="admin-config-hint">Niciun membru în categoria asta.</p>
        ) : (
          <ul className="admin-sala-lista">
            {randuri.map((r) => {
              const motiv = motivFaraScoatere(r.membru);
              const ist = deschis === r.membru.id ? istoricMembru(date, r.membru.id) : null;
              return (
                <li key={r.membru.id} className="admin-sala-rand admin-sala-membru">
                  <span className="admin-sala-nume">{r.membru.full_name}</span>
                  <span className="admin-sala-progres" aria-hidden="true">
                    <span style={{ width: `${r.total ? (r.prezente / r.total) * 100 : 0}%` }} />
                  </span>
                  <span className="admin-sala-detaliu">
                    {r.prezente}/{r.total} ·{' '}
                    <span className={CLASA_STARE[r.stare]}>{ETICHETE_STARE[r.stare]}</span>
                    {r.ultima && ` · ultima ${scurt(r.ultima)}`}
                  </span>
                  <span className="admin-sala-actiuni">
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      aria-expanded={deschis === r.membru.id}
                      onClick={() => setDeschis(deschis === r.membru.id ? null : r.membru.id)}
                    >
                      Istoric
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={ocupat || motiv !== null}
                      title={motiv ?? undefined}
                      onClick={() => setDeScos(r.membru)}
                    >
                      Scoate din grup
                    </button>
                  </span>
                  {ist && (
                    <div className="admin-sala-istoric">
                      <p className="admin-sala-cand">
                        {ist.prezente} din ultimele {ist.total} ({ist.procent}%) · tendință{' '}
                        {ist.tendinta === 'sus' ? 'în creștere' : ist.tendinta === 'jos' ? 'în scădere' : 'constantă'}
                      </p>
                      <ol className="admin-sala-puncte">
                        {ist.istoric.map((h) => (
                          <li
                            key={h.data}
                            className={CLASA_PUNCT[h.raspuns ?? 'tacere']}
                            title={`${ziSiData(h.data)}: ${h.raspuns === 'yes' ? 'a venit' : h.raspuns === 'no' ? 'nu' : 'fără răspuns'}`}
                          />
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
    </div>
  );
};
