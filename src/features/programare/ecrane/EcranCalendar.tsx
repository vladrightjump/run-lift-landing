import { HartaAn } from '../components/HartaAn';
import { incarcaCalendar, incarcaProfil, incarcaPrograme } from '../data/api';
import { useResursaProgramare } from '../data/queries';
import type { DateCalendar, NavigareProgramare } from '../data/tipuri';
import { aziProgramare, dataCompleta, decaleazaData, diferentaZile } from '../lib/date';
import styles from '../styles/Calendar.module.css';

const zileSaptamana = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const dataScurtaFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dataScurta = (data: string) => dataScurtaFmt.format(new Date(`${data}T12:00:00Z`));

const Saptamani = ({ calendar, onNavigare }: { calendar: DateCalendar; onNavigare: NavigareProgramare }) => {
  const { atribuire, zile } = calendar;
  const offset = (new Date(`${atribuire.data_start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const primaLuni = decaleazaData(atribuire.data_start, -offset);
  const numarSaptamani = Math.ceil((diferentaZile(primaLuni, atribuire.data_sfarsit) + 1) / 7);
  const dupaData = new Map(zile.map(zi => [zi.data, zi]));
  const ani = [...new Set([atribuire.data_start.slice(0, 4), atribuire.data_sfarsit.slice(0, 4)])].join('–');
  return <section className={styles.saptamani} aria-label="Toate săptămânile atribuirii">
    <div className={styles.antetSaptamani}><h2>Toate săptămânile</h2><p className={styles.muted}>Toată atribuirea · {ani}</p></div>
    {Array.from({ length: numarSaptamani }, (_saptamana, index) => {
      const inceput = decaleazaData(primaLuni, index * 7);
      const sfarsit = decaleazaData(inceput, 6);
      return <section className={styles.saptamana} key={inceput}>
        <h3>Săptămâna {index + 1}<span>{dataScurta(inceput)} – {dataScurta(sfarsit)}</span></h3>
        <div className={styles.zileSaptamana} aria-hidden="true">{zileSaptamana.map(zi => <span key={zi}>{zi}</span>)}</div>
        <div className={styles.grilaZile}>{Array.from({ length: 7 }, (_, ziIndex) => {
          const data = decaleazaData(inceput, ziIndex);
          if (data < atribuire.data_start || data > atribuire.data_sfarsit) return <span className={styles.inAfara} key={data} />;
          const zi = dupaData.get(data);
          if (!zi) return <span className={styles.pauza} key={data} aria-label={`Pauză, ${dataCompleta(data)}`}><span aria-hidden="true">{Number(data.slice(8))}</span></span>;
          const primulBloc = zi.blocuri.filter(bloc => !bloc.ascuns).sort((a, b) => a.ordine - b.ordine)[0];
          return <button key={data} type="button" className={`${styles.ziAntrenament} ${zi.stare === 'viitor' ? styles.ziViitoare : styles.ziNefacuta}`}
            aria-label={`${dataCompleta(data)}, ${zi.stare}`} aria-current={data === aziProgramare() ? 'date' : undefined}
            onClick={() => onNavigare('prog-azi', [data, primulBloc?.id ?? '', '1', atribuire.id])}>
            <span>{Number(data.slice(8))}</span><span className={styles.marcajZi} aria-hidden="true" />
          </button>;
        })}</div>
      </section>;
    })}
  </section>;
};

export const EcranCalendar = ({ parametri, onNavigare }: { parametri: string[]; onNavigare: NavigareProgramare }) => {
  const profil = useResursaProgramare(['profil'], incarcaProfil);
  const programe = useResursaProgramare(['programe'], incarcaPrograme);
  const atribuiri = programe.date?.flatMap(program => program.atribuiri.map(atribuire => ({ atribuire, program }))) ?? [];
  const azi = aziProgramare();
  const proprii = atribuiri.filter(a => a.atribuire.sportiv_id === profil.date?.id)
    .sort((a, b) => b.atribuire.data_start.localeCompare(a.atribuire.data_start));
  const aleasa = parametri[0] ? atribuiri.find(a => a.atribuire.id === parametri[0])
    : proprii.find(a => a.atribuire.data_start <= azi && a.atribuire.data_sfarsit >= azi) ?? proprii[0] ?? atribuiri[0];
  const anDinAdresa = /^\d{4}$/.test(parametri[1] ?? '') ? Number(parametri[1]) : 0;
  const an = anDinAdresa > 0 ? anDinAdresa : Number((aleasa?.atribuire.data_start ?? azi).slice(0, 4));
  const id = aleasa?.atribuire.id ?? '';
  const gata = !!programe.date && (profil.date !== undefined || profil.eroare);
  const calendar = useResursaProgramare(['calendar', id, azi], (token, signal) => incarcaCalendar(token, id, azi, signal), gata && !!id);
  const anAnterior = () => onNavigare('prog-calendar', [id, String(an - 1).padStart(4, '0')]);
  const anUrmator = () => onNavigare('prog-calendar', [id, String(an + 1).padStart(4, '0')]);
  return <div className={styles.ecran}>
    {profil.eroare && <p role="alert">Nu am putut încărca profilul. <button className={styles.buton} onClick={() => void profil.reincarca()}>Reîncearcă</button></p>}
    {programe.eroare && <p role="alert">Nu am putut încărca atribuirile. <button className={styles.buton} onClick={() => void programe.reincarca()}>Reîncearcă</button></p>}
    {!gata && !programe.eroare && !profil.eroare && <p role="status">Încărcăm calendarul…</p>}
    {gata && atribuiri.length === 0 && <p className={styles.muted}>Nicio atribuire încă. Alege un program din Programe.</p>}
    {gata && atribuiri.length > 0 && <>
      <label className={styles.selector}>Sportiv și program<select value={id} onChange={e => onNavigare('prog-calendar', [e.target.value, String(an).padStart(4, '0')])}>
        {!aleasa && <option value="">Alege o atribuire</option>}
        {atribuiri.map(({ atribuire, program }) => <option value={atribuire.id} key={atribuire.id}>{atribuire.sportiv_nume} · {program.nume} · {dataScurta(atribuire.data_start)} {atribuire.data_start.slice(0, 4)} – {dataScurta(atribuire.data_sfarsit)} {atribuire.data_sfarsit.slice(0, 4)}</option>)}
      </select></label>
      {!aleasa && <p role="alert">Atribuirea din adresă nu a fost găsită. Alege o atribuire din listă.</p>}
      {id && calendar.eroare && <p role="alert">Nu am putut încărca calendarul. <button className={styles.buton} onClick={() => void calendar.reincarca()}>Reîncearcă</button></p>}
      {id && !calendar.date && !calendar.eroare && <p role="status">Încărcăm calendarul…</p>}
      {calendar.date && aleasa && <>
        <header className={styles.antet}><h2>{calendar.date.atribuire.sportiv_nume} · Calendar</h2><p>{aleasa.program.nume}</p><p className={styles.muted}>{dataCompleta(calendar.date.atribuire.data_start)} — {dataCompleta(calendar.date.atribuire.data_sfarsit)}</p></header>
        <section className={styles.profil} aria-label="Totalurile atribuirii și harta anului">
          <div className={styles.antetProfil}>
            <div className={styles.ani} aria-label="Anul hărții"><button className={styles.buton} aria-label="Anul anterior" disabled={an <= 1} onClick={anAnterior}>‹</button><strong>{an}</strong><button className={styles.buton} aria-label="Anul următor" disabled={an >= 9999} onClick={anUrmator}>›</button></div>
            <p className={styles.muted}>Totaluri pe toată atribuirea</p>
          </div>
          <dl className={styles.totaluri}><div><dt>Zile de antrenament</dt><dd>{calendar.date.totaluri.zile_antrenament}</dd></div><div><dt>Rezultate</dt><dd>{calendar.date.totaluri.rezultate}</dd></div><div><dt>PR-uri</dt><dd>{calendar.date.totaluri.pr}</dd></div></dl>
          <HartaAn an={an} zile={calendar.date.zile} />
          <ul className={styles.legenda} aria-label="Legenda calendarului"><li><span className={`${styles.patratLegenda} ${styles.nefacut}`} aria-hidden="true" />Nefăcut</li><li><span className={`${styles.patratLegenda} ${styles.viitor}`} aria-hidden="true" />Viitor</li><li><span className={`${styles.patratLegenda} ${styles.faraAntrenament}`} aria-hidden="true" />Fără antrenament</li></ul>
        </section>
        <Saptamani calendar={calendar.date} onNavigare={onNavigare} />
      </>}
    </>}
  </div>;
};
