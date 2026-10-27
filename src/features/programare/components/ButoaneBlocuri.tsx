import type { Bloc, ProfilSportiv } from '../data/tipuri';
import { prescriptieBloc } from '../lib/prescriptie';
import styles from '../styles/Foaie.module.css';

export const ButoaneBlocuri = ({ blocuri, blocId, exercitiu, profil, onAlege }: {
  blocuri: Bloc[];
  blocId: string;
  exercitiu: number;
  profil: ProfilSportiv;
  onAlege: (blocId: string, exercitiu: number) => void;
}) => <nav className={styles.butoaneBlocuri} aria-label="Blocurile antrenamentului">
  {blocuri.flatMap(bloc => {
    const prescriptie = prescriptieBloc(bloc, { gen: profil.gen });
    const exercitii = prescriptie.compact.length
      ? prescriptie.compact
      : [{ eticheta: prescriptie.eticheta, exercitiu: 1 }];
    return exercitii.map(rand => <button key={`${bloc.id}-${rand.exercitiu}`} type="button"
      className={styles.butonBloc} aria-pressed={bloc.id === blocId && rand.exercitiu === exercitiu}
      onClick={() => onAlege(bloc.id, rand.exercitiu)}>{rand.eticheta}</button>);
  })}
</nav>;
