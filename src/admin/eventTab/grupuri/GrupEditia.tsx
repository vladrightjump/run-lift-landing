import type { EventConfig } from '../../../content/eventConfig';
import { Grup, Camp } from '../primitive';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
  erori: Map<string, string>;
  areEroare: (campuri: string[]) => boolean;
  /**
   * Numărul s-a mutat față de ciorna încărcată — salvarea va scrie o ciornă
   * SEPARATĂ. Nu e o eroare, deci nu blochează nimic; dar e singurul câmp din
   * formular care poate produce un al doilea document fără să spună.
   */
  atentieNumar?: string;
};

/** „Ediția": numărul, numele și textele care poartă ediția. */
export const GrupEditia = ({ ciorna, seteaza, erori, areEroare, atentieNumar }: Props) => (
  <Grup
    titlu="Ediția"
    ajutor="Cum se numește și a câta e."
    deschisImplicit
    areEroare={areEroare(['number', 'launchNumber', 'eventName', 'concept'])}
    rezumat={`Ediția ${ciorna.number} · ${ciorna.eventName}`}
  >
    <Camp
      eticheta="Numărul ediției"
      cheie="number"
      ajutor="Ediția la care se înscrie lumea acum."
      eroare={erori.get('number')}
      atentie={atentieNumar}
    >
      {(p) => (
        <input
          {...p}
          type="number"
          min={1}
          value={ciorna.number}
          onChange={(e) => seteaza('number', Number(e.target.value))}
        />
      )}
    </Camp>
    <Camp
      eticheta="Ediția de lansare"
      cheie="launchNumber"
      ajutor="Numărul din emailuri și din paginile /confirmare și /unsubscribe. De obicei același cu cel de sus — bumpează-l DUPĂ cursă."
      eroare={erori.get('launchNumber')}
    >
      {(p) => (
        <input
          {...p}
          type="number"
          min={1}
          value={ciorna.launchNumber}
          onChange={(e) => seteaza('launchNumber', Number(e.target.value))}
        />
      )}
    </Camp>
    <Camp
      eticheta="Numele evenimentului"
      cheie="eventName"
      ajutor="Apare în titlul paginii și în emailuri."
      eroare={erori.get('eventName')}
    >
      {(p) => (
        <input
          {...p}
          value={ciorna.eventName}
          onChange={(e) => seteaza('eventName', e.target.value)}
        />
      )}
    </Camp>
    <Camp
      eticheta="Concept"
      cheie="concept"
      ajutor="Linia scurtă de sub titlu — ex. „outdoor adaptive”."
      eroare={erori.get('concept')}
    >
      {(p) => (
        <input
          {...p}
          value={ciorna.concept}
          onChange={(e) => seteaza('concept', e.target.value)}
        />
      )}
    </Camp>
  </Grup>
);
