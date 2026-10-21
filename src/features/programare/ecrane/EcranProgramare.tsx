import { FurnizorProgramare } from '../data/sesiune';
import type { SesiuneProgramare } from '../data/sesiune';
import type { EcranProgramare as CheieEcran, NavigareProgramare } from '../data/tipuri';
import { EcranPrograme } from './EcranPrograme';
import styles from '../styles/Programe.module.css';

export type PropsEcranProgramare = { ecran: CheieEcran; parametri: string[]; sesiune: SesiuneProgramare; onNavigare?: NavigareProgramare };
const navigareHash: NavigareProgramare = (cheie, parti = []) => { window.location.hash = [cheie, ...parti.map(encodeURIComponent)].join('/'); };

export const EcranProgramare = ({ ecran, parametri, sesiune, onNavigare = navigareHash }: PropsEcranProgramare) =>
  <FurnizorProgramare sesiune={sesiune}>
    {ecran === 'prog-programe' ? <EcranPrograme parametri={parametri} onNavigare={onNavigare} /> : <p className={styles.muted}>{ecran === 'prog-exercitii' ? 'Biblioteca de mișcări va fi disponibilă într-o etapă următoare.' : ecran === 'prog-rezultate' ? 'Logarea și rezultatele vor fi disponibile în etapa 2.' : 'Ecranul de antrenament se pregătește.'}</p>}
  </FurnizorProgramare>;
