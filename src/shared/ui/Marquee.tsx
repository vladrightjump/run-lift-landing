import { useState } from 'react';

type Props = {
  /** Cuvintele de pe bandă, în ordine. Se repetă la nesfârșit. */
  items: string[];
};

/**
 * Banda rulantă lime dintre secțiuni — pasul cursei, scris ca pe o bandă de
 * start. Mișcarea, pauza și împinsul din scroll stau în `edition3.css`
 * (`.e3-marquee*`).
 *
 * Conținutul e randat de DOUĂ ori: animația se oprește la -50% din pistă, deci
 * a doua copie ajunge exact unde era prima când bucla repornește. Copia e
 * `aria-hidden`, altfel cititoarele de ecran ar citi lista de două ori.
 *
 * Butonul de pauză nu e decor: o mișcare care nu se oprește singură trebuie să
 * poată fi oprită (WCAG 2.2.2), iar pauza la hover nu se pune — nu există pe
 * touch și nu se ajunge la ea cu tastatura.
 */
export const Marquee = ({ items }: Props) => {
  const [oprita, setOprita] = useState(false);

  if (items.length === 0) return null;

  const group = (hidden: boolean) => (
    <div className="e3-marquee-group" aria-hidden={hidden || undefined}>
      {items.map((text, i) => (
        <span className="e3-marquee-item" key={`${text}-${i}`}>
          {text}
        </span>
      ))}
    </div>
  );

  return (
    <div className="e3-marquee" data-oprita={oprita}>
      <div className="e3-marquee-track">
        {group(false)}
        {group(true)}
      </div>
      <button
        type="button"
        className="e3-marquee-pauza"
        aria-pressed={oprita}
        aria-label={oprita ? 'Pornește banda' : 'Oprește banda'}
        onClick={() => setOprita((v) => !v)}
      >
        <span aria-hidden="true">{oprita ? '▶' : '❚❚'}</span>
      </button>
    </div>
  );
};
