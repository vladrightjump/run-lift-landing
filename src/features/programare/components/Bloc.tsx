import { esteIdYouTube } from '../../../shared/lib/youtube';
import type { Bloc as DateBloc, Miscare, ProfilSportiv } from '../data/tipuri';
import { prescriptieBloc } from '../lib/prescriptie';
import styles from '../styles/Azi.module.css';

export const Bloc = ({ bloc, profil, extins = false, onVideo, onDeschide }: {
  bloc: DateBloc;
  profil: ProfilSportiv;
  extins?: boolean;
  onVideo: (miscare: Miscare) => void;
  onDeschide?: (exercitiu: number) => void;
}) => {
  if (bloc.ascuns) return null;
  const prescriptie = prescriptieBloc(bloc, { gen: profil.gen });
  const randuri = extins ? prescriptie.complet : prescriptie.compact;
  const instructiuniBloc = new Set([prescriptie.instructiuniInainte, prescriptie.instructiuniDupa]);
  return <section className={styles.bloc} aria-label={`Bloc ${prescriptie.eticheta}`}>
    <h3 className={styles.titluBloc}><span className={styles.prefix}>{prescriptie.eticheta}.</span> {prescriptie.nume || prescriptie.antet}</h3>
    {extins && <>
      {prescriptie.instructiuniInainte && <p className={styles.instructiuni}>{prescriptie.instructiuniInainte}</p>}
      {prescriptie.nume && <p className={styles.antetPrescriptie}>{prescriptie.antet}</p>}
      {prescriptie.text && <p className={styles.instructiuni}>{prescriptie.text}</p>}
    </>}
    <ul className={styles.randuri}>
      {randuri.map((rand, i) => {
        const miscare = bloc.seturi.find(set => set.miscare.id === rand.miscareId)?.miscare;
        const text = `${extins && rand.seturi > 1 ? `${rand.seturi} × ` : ''}${rand.text}`;
        const continut = <><span className={styles.prefix}>{rand.eticheta}.</span> <span>{text}</span></>;
        return <li key={`${rand.exercitiu}-${i}`} className={styles.rand}>
          {extins && rand.instructiuniInainte && !instructiuniBloc.has(rand.instructiuniInainte) && <p className={styles.instructiuni}>{rand.instructiuniInainte}</p>}
          <div className={styles.linieExercitiu}>
            {onDeschide ? <button type="button" className={styles.exercitiu} onClick={() => onDeschide(rand.exercitiu)}>{continut}</button> : <div className={styles.exercitiuStatic}>{continut}</div>}
            {miscare?.youtube_id && esteIdYouTube(miscare.youtube_id) && <button type="button" className={styles.video} aria-label={`Video: ${miscare.nume}`} onClick={() => onVideo(miscare)}><span aria-hidden="true">ⓘ</span></button>}
          </div>
          {extins && <>
            {rand.pauza && <p className={styles.pauza}>{rand.pauza}</p>}
            {rand.note && <p className={styles.nota}>{rand.note}</p>}
            {rand.instructiuniDupa && !instructiuniBloc.has(rand.instructiuniDupa) && <p className={styles.instructiuni}>{rand.instructiuniDupa}</p>}
          </>}
        </li>;
      })}
    </ul>
    {extins && <>
      {prescriptie.noteSportiv && <p className={styles.nota}>{prescriptie.noteSportiv}</p>}
      {prescriptie.instructiuniDupa && <p className={styles.instructiuni}>{prescriptie.instructiuniDupa}</p>}
      {prescriptie.criteriuScor && <p className={styles.pauza}>Scor: {prescriptie.criteriuScor}</p>}
    </>}
  </section>;
};
