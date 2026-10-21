import { FurnizorProgramare } from '../data/sesiune';
import type { ReactNode } from 'react';
import type { SesiuneProgramare } from '../data/sesiune';
import type { EcranProgramare as CheieEcran, NavigareProgramare } from '../data/tipuri';
import { EcranPrograme } from './EcranPrograme';
import { EcranAzi } from './EcranAzi';
import { EcranCalendar } from './EcranCalendar';
import styles from '../styles/Programe.module.css';

export type PropsEcranProgramare = { ecran: CheieEcran; parametri: string[]; sesiune: SesiuneProgramare; onNavigare?: NavigareProgramare };
const navigareHash: NavigareProgramare = (cheie, parti = []) => { window.location.hash = [cheie, ...parti.map(encodeURIComponent)].join('/'); };

export const EcranProgramare = ({ ecran, parametri, sesiune, onNavigare = navigareHash }: PropsEcranProgramare) => {
  let continut: ReactNode;
  switch (ecran) {
    case 'prog-programe': continut = <EcranPrograme parametri={parametri} onNavigare={onNavigare} />; break;
    case 'prog-azi': continut = <EcranAzi parametri={parametri} onNavigare={onNavigare} />; break;
    case 'prog-calendar': continut = <EcranCalendar parametri={parametri} onNavigare={onNavigare} />; break;
    case 'prog-exercitii': continut = <p className={styles.muted}>Biblioteca de mișcări nu este încă disponibilă.</p>; break;
    case 'prog-rezultate': continut = <p className={styles.muted}>Rezultatele nu sunt încă disponibile.</p>; break;
  }
  return <FurnizorProgramare sesiune={sesiune}>{continut}</FurnizorProgramare>;
};
