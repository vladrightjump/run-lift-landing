import type { DateCalendar } from '../data/tipuri';
import { dataCompleta, decaleazaData, diferentaZile } from '../lib/date';
import styles from '../styles/Calendar.module.css';

const lunaFmt = new Intl.DateTimeFormat('ro-RO', { month: 'short', timeZone: 'UTC' });
const luniDuminica = (data: string) => (new Date(`${data}T12:00:00Z`).getUTCDay() + 6) % 7;

export const HartaAn = ({ an, zile }: { an: number; zile: DateCalendar['zile'] }) => {
  const inceput = `${String(an).padStart(4, '0')}-01-01`;
  const sfarsit = `${String(an).padStart(4, '0')}-12-31`;
  const decalaj = luniDuminica(inceput);
  const numarZile = diferentaZile(inceput, sfarsit) + 1;
  const coloane = Math.floor((decalaj + numarZile - 1) / 7) + 1;
  const dupaData = new Map(zile.map(zi => [zi.data, zi]));
  return <svg className={styles.harta} viewBox={`0 0 ${coloane * 12} 106`} role="img" aria-label={`Harta antrenamentelor în ${an}`}>
    {Array.from({ length: 12 }, (_, luna) => {
      const data = `${String(an).padStart(4, '0')}-${String(luna + 1).padStart(2, '0')}-01`;
      const x = Math.floor((decalaj + diferentaZile(inceput, data)) / 7) * 12;
      return <text key={luna} className={styles.lunaHarta} x={x} y={10}>{lunaFmt.format(new Date(`${data}T12:00:00Z`))}</text>;
    })}
    {Array.from({ length: numarZile }, (_, index) => {
      const data = decaleazaData(inceput, index);
      const zi = dupaData.get(data);
      const clasa = zi?.stare === 'viitor' ? styles.viitor : zi ? styles.nefacut : styles.faraAntrenament;
      return <rect key={data} className={clasa} x={Math.floor((decalaj + index) / 7) * 12 + 1} y={22 + (decalaj + index) % 7 * 12} width={9} height={9} rx={1}>
        <title>{dataCompleta(data)}, {zi?.stare ?? 'fără antrenament'}</title>
      </rect>;
    })}
  </svg>;
};
