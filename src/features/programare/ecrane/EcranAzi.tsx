import { useState } from 'react';
import { incarcaAzi, incarcaCalendar, incarcaPrograme } from '../data/api';
import { useResursaProgramare } from '../data/queries';
import type { Miscare, NavigareProgramare } from '../data/tipuri';
import { aziProgramare, dataCompleta } from '../lib/date';
import { BandaDate } from '../components/BandaDate';
import { CardZi } from '../components/CardZi';
import { ModalVideo } from '../components/ModalVideo';
import styles from '../styles/Azi.module.css';

const dataValida = (data: string | undefined): data is string => {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const moment = new Date(`${data}T12:00:00Z`);
  return Number.isFinite(moment.getTime()) && moment.toISOString().slice(0, 10) === data;
};

export const EcranAzi = ({ parametri, onNavigare }: { parametri: string[]; onNavigare: NavigareProgramare }) => {
  const azi = aziProgramare();
  const data = dataValida(parametri[0]) ? parametri[0] : azi;
  const [video, setVideo] = useState<Miscare | null>(null);
  const resursa = useResursaProgramare(['azi', data], (token, signal) => incarcaAzi(token, data, signal));
  const profil = resursa.date?.profil;
  const banda = useResursaProgramare(['date-antrenament', azi, profil?.id], async (token, signal) => {
    const programe = await incarcaPrograme(token, signal);
    const atribuiri = programe.flatMap(program => program.atribuiri).filter(atribuire => atribuire.sportiv_id === profil?.id);
    const calendare = await Promise.all(atribuiri.map(atribuire => incarcaCalendar(token, atribuire.id, azi, signal)));
    return calendare.flatMap(calendar => calendar.zile.map(zi => zi.data));
  }, !!profil);
  const dateAntrenament = new Set(banda.date ?? []);
  if (resursa.date?.antrenamente.length) dateAntrenament.add(data);
  return <div className={styles.ecran}>
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
          {resursa.date.antrenamente.map(antrenament => <CardZi key={`${antrenament.atribuire.id}-${antrenament.zi.id}`} antrenament={antrenament} profil={profil} onVideo={setVideo} onDeschide={(blocId, exercitiu) => onNavigare('prog-azi', [data, blocId, String(exercitiu), antrenament.atribuire.id])} />)}
        </>}
      {banda.eroare && <p className={styles.mesaj} role="alert">Nu am putut încărca marcajele benzii de date.</p>}
    </div>
    {video && <ModalVideo miscare={video} onInchide={() => setVideo(null)} />}
  </div>;
};
