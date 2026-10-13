import styles from './PrevizualizareSondaj.module.css';
import type { ReactNode } from 'react';
import { antetSondaj, corpSondaj, textEfectiv, type TextSondaj } from './sondaj';

type Props = {
  text: TextSondaj;
  ora: string;
  loc: string;
  /** Data antrenamentului din exemplu, `YYYY-MM-DD`. */
  data: string;
};

/** Numele din exemplu — destul cât să se vadă amândouă listele. */
const EXEMPLU_VIN = ['Ana', 'Ion', 'Maria'];
const EXEMPLU_NU = ['Victor'];

const descapa = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Un rând din mesajul botului, cu `<b>` transformat în îngroșare.
 *
 * Mesajul e HTML-ul Telegram, deja escapat de `sondaj.ts`: singurele etichete
 * reale sînt `<b>` și `</b>`. Nu se injectează ca HTML — se taie pe etichete și
 * se randează ca text, deci un titlu cu „<script>" rămâne text.
 */
const randFormatat = (rand: string): ReactNode[] =>
  rand.split(/(<b>.*?<\/b>)/g).map((bucata, i) =>
    bucata.startsWith('<b>') ? <strong key={i}>{descapa(bucata.slice(3, -4))}</strong> : descapa(bucata)
  );

/**
 * Mesajul sondajului, așa cum apare în grupul de Telegram (R12).
 *
 * Textul vine din aceleași funcții pe care le oglindește botul, deci ce vezi aici
 * e ce pleacă. Nesalvat: previzualizarea urmează câmpurile pe măsură ce scrii.
 */
export const PrevizualizareSondaj = ({ text, ora, loc, data }: Props) => {
  const t = textEfectiv(text);
  const mesaj = corpSondaj(antetSondaj(data, ora, loc, t.titlu), EXEMPLU_VIN, EXEMPLU_NU);
  return (
    <figure className={styles['admin-sala-telegram']} data-css="admin-sala-telegram" aria-label="Așa arată sondajul în grup">
      <div className={styles['admin-sala-telegram-mesaj']} data-css="admin-sala-telegram-mesaj">
        {mesaj.split('\n').map((rand, i) => (
          <p key={i}>{rand === '' ? ' ' : randFormatat(rand)}</p>
        ))}
      </div>
      <div className={styles['admin-sala-telegram-butoane']} data-css="admin-sala-telegram-butoane">
        <span>{t.da}</span>
        <span>{t.nu}</span>
      </div>
      <figcaption className="admin-config-hint">
        Exemplu cu nume inventate. Ziua, data, ora și locul se pun singure.
      </figcaption>
    </figure>
  );
};
