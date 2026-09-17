import type { EventConfig } from '../../../content/eventConfig';
import { useContext } from 'react';
import { Grup, Camp, Blocat } from '../primitive';
import { linkHarta } from '../../eventConfigFields';
import { LOCURI_SALVATE } from '../ajutoare';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
  erori: Map<string, string>;
  areEroare: (campuri: string[]) => boolean;
};

/** „Unde": locul cursei, harta și adresa. */
export const GrupUnde = ({ ciorna, seteaza, erori, areEroare }: Props) => {
  // Aceeași sursă ca restul formularului: cât ține o publicare, totul e inert.
  const ocupat = useContext(Blocat);
  const hartaUrl = linkHarta(ciorna.venue.mapQuery);
  return (
  <Grup
    titlu="Unde"
    ajutor="Ce scrie în secțiunea „Locația” și ce se vede pe hartă."
    areEroare={areEroare(['venue.name', 'venue.city', 'venue.mapQuery', 'venue.zoom'])}
    rezumat={`${ciorna.venue.name}, ${ciorna.venue.city}`}
  >
    {/* Locurile în care s-a mai alergat, dintr-un click.
        Coordonatele nu se pot verifica citindu-le, iar cursele se
        întorc în aceleași două-trei parcuri: cel mai des, „alegerea
        locului" e de fapt o recunoaștere, nu o introducere. */}
    <div className="admin-config-locuri">
      <span className="admin-config-eticheta">Locuri folosite până acum</span>
      <span className="admin-presetari">
        {LOCURI_SALVATE.map((l) => (
          <button
            key={l.mapQuery}
            type="button"
            className="admin-chip"
            disabled={ocupat || l.mapQuery === ciorna.venue.mapQuery}
            onClick={() => seteaza('venue', { ...ciorna.venue, ...l })}
          >
            {l.name} · {l.city}
          </button>
        ))}
      </span>
    </div>

    <Camp
      eticheta="Numele locului"
      ajutor="Ex. „Scările de Granit”."
      eroare={erori.get('venue.name')}
    >
      {(p) => (
        <input
          {...p}
          value={ciorna.venue.name}
          onChange={(e) => seteaza('venue', { ...ciorna.venue, name: e.target.value })}
        />
      )}
    </Camp>
    <Camp
      eticheta="Orașul sau zona"
      ajutor="Ex. „Valea Morilor, Chișinău”."
      eroare={erori.get('venue.city')}
    >
      {(p) => (
        <input
          {...p}
          value={ciorna.venue.city}
          onChange={(e) => seteaza('venue', { ...ciorna.venue, city: e.target.value })}
        />
      )}
    </Camp>
    <Camp
      eticheta="Coordonatele"
      ajutor="Punct exact, „lat,lng” — nu text căutat pe hartă. Le iei din Google Maps: click dreapta pe punct → prima linie din meniu le copiază."
      eroare={erori.get('venue.mapQuery')}
      ecou={
        // Verificarea cu un click: harta e singurul câmp în care o
        // greșeală nu se vede în admin, ci abia pe pagina publică.
        hartaUrl ? (
          <a href={hartaUrl} target="_blank" rel="noopener noreferrer">
            Verifică punctul pe Google Maps ↗
          </a>
        ) : undefined
      }
    >
      {(p) => (
        <input
          {...p}
          value={ciorna.venue.mapQuery}
          placeholder="47.0182357,28.8213041"
          onChange={(e) =>
            seteaza('venue', {
              ...ciorna.venue,
              mapQuery: e.target.value,
            })
          }
        />
      )}
    </Camp>
  </Grup>
  );
};
