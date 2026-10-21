import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { incarcaAzi, incarcaCalendar, incarcaPrograme } from '../data/api';
import { useResursaProgramare } from '../data/queries';
import type { AntrenamentZi, Miscare, NavigareProgramare, ProfilSportiv } from '../data/tipuri';
import { aziProgramare, dataCompleta } from '../lib/date';
import { BandaDate } from '../components/BandaDate';
import { CardZi } from '../components/CardZi';
import { FoaieAntrenament } from '../components/FoaieAntrenament';
import { ModalVideo } from '../components/ModalVideo';
import foaieStyles from '../styles/Foaie.module.css';
import styles from '../styles/Azi.module.css';

const dataValida = (data: string | undefined): data is string => {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const moment = new Date(`${data}T12:00:00Z`);
  return Number.isFinite(moment.getTime()) && moment.toISOString().slice(0, 10) === data;
};

const interogareTelefon = () => typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 640px)') : null;

export const EcranAzi = ({ parametri, onNavigare }: { parametri: string[]; onNavigare: NavigareProgramare }) => {
  const azi = aziProgramare();
  const data = dataValida(parametri[0]) ? parametri[0] : azi;
  const [video, setVideo] = useState<Miscare | null>(null);
  const [telefon, setTelefon] = useState(() => interogareTelefon()?.matches ?? false);
  useEffect(() => {
    const lista = interogareTelefon();
    if (!lista) return;
    const actualizeaza = () => {
      // Dialogul își restabilește focusul și derularea înainte să mutăm foaia
      // între pagină și portalul mobil, care face fundalul inert.
      flushSync(() => setVideo(null));
      setTelefon(lista.matches);
    };
    lista.addEventListener?.('change', actualizeaza);
    return () => lista.removeEventListener?.('change', actualizeaza);
  }, []);
  const resursa = useResursaProgramare(['azi', data], (token, signal) => incarcaAzi(token, data, signal));
  const profil = resursa.date?.profil;
  const foaie = parametri.length > 1;
  const atribuireId = parametri[3];
  const propriu = resursa.date?.antrenamente.find(antrenament => atribuireId
    ? antrenament.atribuire.id === atribuireId
    : antrenament.zi.blocuri.some(bloc => bloc.id === parametri[1]));
  // Calendarul poate deschide atribuirea altui admin; admin_prog_azi întoarce numai sportivul sesiunii.
  const atribuireCeruta = useResursaProgramare(['antrenament', atribuireId, data, azi], async (token, signal): Promise<AntrenamentZi | null> => {
    const [calendar, programe] = await Promise.all([incarcaCalendar(token, atribuireId!, azi, signal), incarcaPrograme(token, signal)]);
    const program = programe.find(item => item.id === calendar.atribuire.program_id);
    const zi = calendar.zile.find(item => item.data === data);
    return program && zi ? { program, zi, atribuire: calendar.atribuire } : null;
  }, foaie && !!atribuireId && !propriu && (!!resursa.date || resursa.eroare));
  const antrenament = propriu ?? atribuireCeruta.date;
  const bloc = antrenament?.zi.blocuri.find(item => item.id === parametri[1] && !item.ascuns);
  const exercitiu = /^[1-9]\d*$/.test(parametri[2] ?? '1') ? Number(parametri[2] ?? '1') : 0;
  const selectat = bloc && (bloc.seturi.length ? bloc.seturi.some(set => set.exercitiu === exercitiu) : exercitiu === 1);
  const profilAntrenament: ProfilSportiv | null = antrenament
    ? antrenament.atribuire.sportiv_id === profil?.id ? profil : {
      id: antrenament.atribuire.sportiv_id, nume: antrenament.atribuire.sportiv_nume, gen: antrenament.atribuire.sportiv_gen,
      unitate_greutate: 'kg', unitate_distanta: 'm', telegram_id: null,
    } : null;
  const inchideFoaia = () => {
    const origine = window.history.state?.programareFoaie as { data?: string; atribuire?: string } | undefined;
    if (origine?.data === data && origine?.atribuire === antrenament?.atribuire.id) window.history.back();
    else onNavigare('prog-azi', [data]);
  };
  const alegeBloc = (blocId: string, numar: number) => {
    const hash = `#${['prog-azi', data, blocId, String(numar), antrenament!.atribuire.id].map(encodeURIComponent).join('/')}`;
    window.history.replaceState(window.history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const banda = useResursaProgramare(['date-antrenament', azi, profil?.id], async (token, signal) => {
    const programe = await incarcaPrograme(token, signal);
    const atribuiri = programe.flatMap(program => program.atribuiri).filter(atribuire => atribuire.sportiv_id === profil?.id);
    const calendare = await Promise.all(atribuiri.map(atribuire => incarcaCalendar(token, atribuire.id, azi, signal)));
    return calendare.flatMap(calendar => calendar.zile.map(zi => zi.data));
  }, !!profil);
  const dateAntrenament = new Set(banda.date ?? []);
  if (resursa.date?.antrenamente.length) dateAntrenament.add(data);
  return <><div className={`${styles.ecran}${foaie ? ` ${foaieStyles.fundalAzi}` : ''}`} hidden={foaie && !(dataValida(parametri[0]) && antrenament && bloc && selectat && profilAntrenament)}>
    <BandaDate data={data} dateAntrenament={dateAntrenament} onAlege={aleasa => onNavigare('prog-azi', [aleasa])} />
    <div className={styles.fir}>
      <header className={styles.antetEcran}>
        <h2>{data === azi ? 'Azi' : dataCompleta(data)}</h2>
        {data !== azi && <button type="button" className={styles.inapoi} onClick={() => onNavigare('prog-azi', [])}>Înapoi la azi</button>}
      </header>
      {resursa.eroare ? <p role="alert" className={styles.mesaj}>Nu am putut încărca antrenamentele. <button type="button" className={styles.inapoi} onClick={() => { void resursa.reincarca(); }}>Încearcă din nou</button></p>
        : !resursa.date ? <p className={styles.mesaj} role="status">Se încarcă antrenamentele…</p>
        : !profil ? <div className={styles.mesaj}><p>Creează-ți profilul de sportiv pentru a urma un program.</p><button type="button" className={styles.principal} onClick={() => onNavigare('prog-programe', [])}>Creează profilul</button></div>
        : resursa.date.antrenamente.length === 0 ? <p className={styles.mesaj}>Niciun antrenament programat pentru această zi.</p>
        : <>
          <aside className={styles.comunitate} aria-label="Firul zilei"><span className={styles.supraTitlu}>Firul zilei</span><span className={styles.asteptare}>În curând</span></aside>
          {resursa.date.antrenamente.map(item => <CardZi key={`${item.atribuire.id}-${item.zi.id}`} antrenament={item} profil={profil} onVideo={setVideo} onDeschide={(blocId, numar) => onNavigare('prog-azi', [data, blocId, String(numar), item.atribuire.id])} />)}
        </>}
      {banda.eroare && <p className={styles.mesaj} role="alert">Nu am putut încărca marcajele benzii de date.</p>}
    </div>
  </div>
    {foaie && (dataValida(parametri[0]) && antrenament && bloc && selectat && profilAntrenament
      ? <FoaieAntrenament antrenament={antrenament} data={data} bloc={bloc} exercitiu={exercitiu} profil={profilAntrenament}
        telefon={telefon} onAlege={alegeBloc} onInchide={inchideFoaia} onVideo={setVideo} />
      : dataValida(parametri[0]) && ((!resursa.date && !resursa.eroare) || (atribuireId && !propriu && atribuireCeruta.date === undefined && !atribuireCeruta.eroare))
        ? <p className={styles.mesaj} role="status">Se încarcă antrenamentul…</p>
        : <div className={styles.mesaj}><p role="alert">Antrenamentul cerut nu este disponibil pentru această zi.</p><button type="button" className={styles.inapoi} onClick={() => onNavigare('prog-azi', [data])}>Înapoi la zi</button></div>)}
    {video && <ModalVideo miscare={video} onInchide={() => setVideo(null)} />}
  </>;
};
