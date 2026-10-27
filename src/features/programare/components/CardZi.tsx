import { useId, useState } from 'react';
import type { AntrenamentZi, Miscare, ProfilSportiv } from '../data/tipuri';
import { Bloc } from './Bloc';
import styles from '../styles/Azi.module.css';

export const CardZi = ({ antrenament, profil, onVideo, onDeschide }: {
  antrenament: AntrenamentZi;
  profil: ProfilSportiv;
  onVideo: (miscare: Miscare) => void;
  onDeschide: (blocId: string, exercitiu: number) => void;
}) => {
  const [extins, setExtins] = useState(false);
  const titluId = useId();
  const continutId = useId();
  const { program, zi } = antrenament;
  const blocuri = zi.blocuri.filter(bloc => !bloc.ascuns).sort((a, b) => a.ordine - b.ordine);
  const primul = blocuri[0];
  const primExercitiu = primul?.seturi.slice().sort((a, b) => a.ordine - b.ordine)[0]?.exercitiu ?? 1;
  return <article className={styles.cardZi} aria-labelledby={titluId}>
    <header className={styles.antetCard}>
      <p className={styles.supraTitlu}>Săptămâna {zi.saptamana} · Ziua {zi.zi}</p>
      <h2 id={titluId}>{program.nume}</h2>
      {program.sursa && <p className={styles.sursa}>Referință externă: {program.sursa}</p>}
      {zi.titlu && <p className={styles.titluZi}>{zi.titlu}</p>}
      {primul && <button type="button" className={styles.principal} onClick={() => onDeschide(primul.id, primExercitiu)}>Deschide antrenamentul</button>}
    </header>
    <div id={continutId} className={styles.blocuri}>
      {blocuri.map(bloc => <Bloc key={bloc.id} bloc={bloc} profil={profil} extins={extins} onVideo={onVideo} onDeschide={exercitiu => onDeschide(bloc.id, exercitiu)} />)}
    </div>
    <footer className={styles.subsolCard}>
      <button type="button" className={styles.secundar} aria-expanded={extins} aria-controls={continutId} onClick={() => setExtins(!extins)}>{extins ? 'Restrânge antrenamentul' : 'Arată tot antrenamentul'}</button>
    </footer>
  </article>;
};
