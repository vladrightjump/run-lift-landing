import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { esteIdYouTube } from '../../../shared/lib/youtube';
import { useCapcanaFocus } from '../../../shared/ui/useCapcanaFocus';
import type { AntrenamentZi, Bloc as DateBloc, Miscare, ProfilSportiv } from '../data/tipuri';
import { dataCompleta } from '../lib/date';
import { prescriptieBloc } from '../lib/prescriptie';
import { Bloc } from './Bloc';
import { ButoaneBlocuri } from './ButoaneBlocuri';
import styles from '../styles/Foaie.module.css';

/** Pragul paginii de antrenament este cel de 640 px din KTD13. */
const FoaieTelefon = ({ children, titlu, onInchide }: { children: ReactNode; titlu: string; onInchide: () => void }) => {
  const cutie = useRef<HTMLElement>(null);
  const radacina = document.querySelector('.admin-app') ?? document.body;
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const vecini = [...radacina.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== cutie.current);
    const stari = vecini.map(el => ({ el, inert: el.inert }));
    for (const { el } of stari) el.inert = true;
    return () => {
      document.body.style.overflow = overflow;
      for (const { el, inert } of stari) el.inert = inert;
    };
  }, [radacina]);
  const capcana = useCapcanaFocus(cutie, onInchide);
  return createPortal(<section ref={cutie} role="dialog" aria-modal="true" aria-label={titlu} className={styles.foaieTelefon}
    tabIndex={-1} onKeyDown={capcana}>{children}</section>, radacina);
};

const ContextBloc = ({ bloc, profil, exercitiu, onAlege, onVideo }: {
  bloc: DateBloc;
  profil: ProfilSportiv;
  exercitiu: number;
  onAlege: (exercitiu: number) => void;
  onVideo: (miscare: Miscare) => void;
}) => {
  const p = prescriptieBloc(bloc, { gen: profil.gen });
  const instructiuniBloc = new Set([p.instructiuniInainte, p.instructiuniDupa]);
  return <section className={styles.contextBloc} aria-label={`Bloc ${p.eticheta}`}>
    <h3><span className={styles.prefix}>{p.eticheta}.</span> {p.nume || p.antet}</h3>
    {p.instructiuniInainte && <p className={styles.instructiuni}>{p.instructiuniInainte}</p>}
    {p.nume && <p className={styles.antetPrescriptie}>{p.antet}</p>}
    {p.text && <p className={styles.instructiuni}>{p.text}</p>}
    <ul className={styles.randuri}>{p.complet.map((rand, index) => {
      const miscare = bloc.seturi.find(set => set.miscare.id === rand.miscareId)?.miscare;
      return <li key={`${rand.exercitiu}-${index}`} className={styles.rand} aria-current={rand.exercitiu === exercitiu ? 'true' : undefined}>
        {rand.instructiuniInainte && !instructiuniBloc.has(rand.instructiuniInainte) && <p className={styles.instructiuni}>{rand.instructiuniInainte}</p>}
        <div className={styles.linieExercitiu}>
          <button type="button" className={styles.alegeExercitiu} onClick={() => onAlege(rand.exercitiu)}><span className={styles.prefix}>{rand.eticheta}.</span> <span>{rand.seturi > 1 ? `${rand.seturi} × ` : ''}{rand.text}</span></button>
          {miscare?.youtube_id && esteIdYouTube(miscare.youtube_id) && <button type="button" className={styles.video} aria-label={`Video: ${miscare.nume}`} onClick={() => onVideo(miscare)}><span aria-hidden="true">ⓘ</span></button>}
        </div>
        {rand.pauza && <p className={styles.pauza}>{rand.pauza}</p>}
        {rand.note && <p className={styles.instructiuni}>{rand.note}</p>}
        {rand.instructiuniDupa && !instructiuniBloc.has(rand.instructiuniDupa) && <p className={styles.instructiuni}>{rand.instructiuniDupa}</p>}
      </li>;
    })}</ul>
    {p.noteSportiv && <p className={styles.instructiuni}>{p.noteSportiv}</p>}
    {p.instructiuniDupa && <p className={styles.instructiuni}>{p.instructiuniDupa}</p>}
    {p.criteriuScor && <p className={styles.pauza}>Scor: {p.criteriuScor}</p>}
  </section>;
};

export const FoaieAntrenament = ({ antrenament, data, bloc, exercitiu, profil, telefon, onAlege, onInchide, onVideo }: {
  antrenament: AntrenamentZi;
  data: string;
  bloc: DateBloc;
  exercitiu: number;
  profil: ProfilSportiv;
  telefon: boolean;
  onAlege: (blocId: string, exercitiu: number) => void;
  onInchide: () => void;
  onVideo: (miscare: Miscare) => void;
}) => {
  const [fila, setFila] = useState<'exercitiu' | 'istoric'>('exercitiu');
  const id = useId();
  const p = prescriptieBloc(bloc, { gen: profil.gen });
  const miscare = bloc.seturi.find(set => set.exercitiu === exercitiu)?.miscare;
  const randuri = p.complet.filter(rand => rand.exercitiu === exercitiu);
  const blocuri = antrenament.zi.blocuri.filter(item => !item.ascuns).sort((a, b) => a.ordine - b.ordine);
  const alege = (blocId: string, numar: number) => { setFila('exercitiu'); onAlege(blocId, numar); };
  const titlu = `Antrenament: ${antrenament.program.nume}`;
  const continut = <>
    <header className={styles.antet}>
      <div className={styles.titluri}>
        <p className={styles.data}>{dataCompleta(data)} · Săptămâna {antrenament.zi.saptamana} · Ziua {antrenament.zi.zi}</p>
        <h2>{antrenament.program.nume}</h2>
        {antrenament.zi.titlu && <p className={styles.titluZi}>{antrenament.zi.titlu}</p>}
      </div>
      <button type="button" className={styles.inchide} aria-label="Închide antrenamentul" onClick={onInchide}><span aria-hidden="true">×</span></button>
    </header>
    <ButoaneBlocuri blocuri={blocuri} blocId={bloc.id} exercitiu={exercitiu} profil={profil} onAlege={alege} />
    {telefon && <div role="tablist" aria-label="Detaliile antrenamentului" className={styles.file}>
      {(['exercitiu', 'istoric'] as const).map((cheie, index) => <button key={cheie} type="button" role="tab" id={`${id}-${cheie}-fila`} aria-controls={`${id}-${cheie}`} aria-selected={fila === cheie} tabIndex={fila === cheie ? 0 : -1}
        onClick={() => setFila(cheie)} onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const urmatoare = e.key === 'Home' ? 'exercitiu' : e.key === 'End' ? 'istoric' : index === 0 ? 'istoric' : 'exercitiu';
          setFila(urmatoare);
          document.getElementById(`${id}-${urmatoare}-fila`)?.focus();
        }}>{cheie === 'exercitiu' ? 'Exercițiu' : 'Istoric'}</button>)}
    </div>}
    <div className={styles.coloane}>
      <div id={`${id}-exercitiu`} role={telefon ? 'tabpanel' : undefined} aria-labelledby={telefon ? `${id}-exercitiu-fila` : undefined} hidden={telefon && fila !== 'exercitiu'} className={styles.exercitiu}>
        <div className={styles.blocurileZilei} role="region" aria-label="Blocurile zilei">
          {(telefon ? [bloc] : blocuri).map(item => item.id === bloc.id
            ? <ContextBloc key={item.id} bloc={item} profil={profil} exercitiu={exercitiu} onAlege={numar => alege(item.id, numar)} onVideo={onVideo} />
            : <div key={item.id} className={styles.altBloc}><Bloc bloc={item} profil={profil} extins onVideo={onVideo} onDeschide={numar => alege(item.id, numar)} />
              {!item.seturi.length && <button type="button" className={styles.deschideBloc} onClick={() => alege(item.id, 1)}>Deschide blocul {prescriptieBloc(item, { gen: profil.gen }).eticheta}</button>}
            </div>)}
        </div>
        <section className={styles.curent} aria-label="Exercițiul curent">
          <header className={styles.antetCurent}><h3>{miscare?.nume || p.nume || p.antet}</h3>
            {miscare?.youtube_id && esteIdYouTube(miscare.youtube_id) && <button type="button" className={styles.video} aria-label={`Video: ${miscare.nume}`} onClick={() => onVideo(miscare)}><span aria-hidden="true">ⓘ</span></button>}
          </header>
          {randuri.map((rand, index) => <p key={index} className={styles.tinta}>{rand.seturi > 1 ? `${rand.seturi} × ` : ''}{rand.text}</p>)}
        </section>
      </div>
      <section id={`${id}-istoric`} role={telefon ? 'tabpanel' : 'region'} aria-labelledby={telefon ? `${id}-istoric-fila` : undefined} aria-label={telefon ? undefined : 'Istoricul exercițiului'}
        hidden={telefon && fila !== 'istoric'} className={styles.istoric}>
        <h3>Istoric</h3>
        <p>Nu există rezultate înregistrate pentru acest exercițiu.</p>
      </section>
    </div>
  </>;
  return telefon ? <FoaieTelefon titlu={titlu} onInchide={onInchide}>{continut}</FoaieTelefon>
    : <section className={styles.pagina} aria-label={titlu}>{continut}</section>;
};
