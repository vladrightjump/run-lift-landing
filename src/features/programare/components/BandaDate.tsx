import { useEffect, useRef } from 'react';
import { dataCompleta, decaleazaData } from '../lib/date';
import styles from '../styles/Azi.module.css';

const ziScurta = new Intl.DateTimeFormat('ro-RO', { weekday: 'short', timeZone: 'UTC' });

export const BandaDate = ({ data, dateAntrenament, onAlege }: {
  data: string;
  dateAntrenament: ReadonlySet<string>;
  onAlege: (data: string) => void;
}) => {
  const selectata = useRef<HTMLButtonElement>(null);
  // O dată nouă mută selecția pe alt nod din banda derulabilă.
  // eslint-disable-next-line react/exhaustive-effect-dependencies
  useEffect(() => { selectata.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [data]);
  return (
    <nav className={styles.banda} aria-label="Alege data antrenamentului">
      {Array.from({ length: 15 }, (_, i) => decaleazaData(data, i - 7)).map(zi => {
        const moment = new Date(`${zi}T12:00:00Z`);
        const antrenament = dateAntrenament.has(zi);
        return <button key={zi} type="button" ref={zi === data ? selectata : undefined}
          className={[styles.data, antrenament ? styles.cuAntrenament : '', zi === data ? styles.selectata : ''].filter(Boolean).join(' ')}
          aria-current={zi === data ? 'date' : undefined}
          aria-label={`${dataCompleta(zi)}, ${antrenament ? 'are antrenament' : 'fără antrenament'}`}
          onClick={() => onAlege(zi)}>
          <span className={styles.cercData}>{moment.getUTCDate()}</span>
          <span className={styles.ziScurta}>{ziScurta.format(moment)}</span>
        </button>;
      })}
    </nav>
  );
};
