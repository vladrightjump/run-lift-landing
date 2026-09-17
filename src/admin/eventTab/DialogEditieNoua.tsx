import { useMemo, useState } from 'react';
import type { EventConfig } from '../../content/eventConfig';
import {
  cioarnaEditieNoua,
  rezumatCiornaNoua,
  validateEventConfig,
  type CampInvalid,
} from '../eventConfigForm';
import { timeOf } from '../../content/format';
import { Camp } from './primitive';

/**
 * Ediția următoare, din trei câmpuri.
 *
 * De ce dialogul e calea PRINCIPALĂ și nu o scurtătură: cel mai prost bug
 * cunoscut din configurarea unei ediții e un bug de copiere — ciorna pornită
 * din ediția publicată moștenea `launchAt`, un moment deja consumat, iar
 * consecința se descoperea abia pe site. Funcția care îl repară (`mutaReperele`)
 * era deja scrisă și deja folosită, dar numai dacă organizatorul edita startul
 * ÎN formular și accepta oferta de mutare. Cine pornea ciorna și publica fără
 * să atingă startul trecea pe lângă ea.
 *
 * Trecând crearea prin trei câmpuri care produc întotdeauna un start nou,
 * mutarea nu mai e o ofertă pe care o poți rata: e singura cale. Bug-ul devine
 * structural inaccesibil, nu documentat într-un comentariu.
 *
 * Formularul complet rămâne — ca „editează tot", nu ca ușă de intrare.
 *
 * Rezumatul nu e decor. Fără el, dialogul rapid ar muta doar capcana de la
 * `launchAt` la locație sau la capacitate: ai publica greșit cu MAI multă
 * încredere decât azi, fiindcă ai avut senzația că ai verificat.
 */
export const DialogEditieNoua = ({
  publicat,
  onCreeaza,
  onAnuleaza,
}: {
  publicat: EventConfig;
  /** Ciorna gata construită — dialogul nu scrie nimic el însuși. */
  onCreeaza: (ciorna: EventConfig) => void;
  onAnuleaza: () => void;
}) => {
  const [data, setData] = useState('');
  // Ora și locurile pornesc de la ediția publicată: sunt lucrurile care de
  // obicei NU se schimbă, iar un câmp gol ar cere retastarea unei decizii deja
  // luate. Data pornește goală — e chiar decizia pentru care s-a deschis
  // dialogul, și singura pe care moștenirea ar strica-o.
  const [ora, setOra] = useState(() => timeOf(publicat.start) || '07:00');
  const [locuri, setLocuri] = useState(String(publicat.slots.total));

  const startNou = data === '' ? '' : `${data}T${ora}:00`;
  const locuriNumar = Number(locuri);

  const ciorna = useMemo(
    () => cioarnaEditieNoua(publicat, startNou, Number.isFinite(locuriNumar) ? locuriNumar : 0),
    [publicat, startNou, locuriNumar]
  );

  /**
   * Aceleași reguli ca la publicare — dialogul nu-și inventează validarea.
   * Cât timp data e goală n-avem ce reproșa: n-a răspuns încă la întrebare.
   */
  const probleme: CampInvalid[] = data === '' ? [] : validateEventConfig(ciorna);
  const eroareStart = probleme.find((p) => p.camp === 'start' || p.camp === 'checkinFrom')?.mesaj;
  const eroareLocuri = probleme.find((p) => p.camp.startsWith('slots'))?.mesaj;
  /**
   * Ce nu ține de cele trei câmpuri, dar oprește publicarea — un document
   * publicat cu o problemă rămasă în el se transmite mai departe. Se arată ca
   * atare, în loc să lase butonul mort fără explicație.
   */
  const altele = probleme.filter(
    (p) => !['start', 'checkinFrom'].includes(p.camp) && !p.camp.startsWith('slots')
  );

  const gata = data !== '' && probleme.length === 0;
  const rezumat = gata ? rezumatCiornaNoua(publicat, ciorna) : [];

  return (
    <div
      className="admin-confirm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onAnuleaza();
      }}
    >
      <div className="admin-confirm admin-confirm--neutru" role="dialog" aria-modal="true">
        <h3>Ediția {publicat.number + 1}</h3>
        <p>
          Data, ora și locurile se aleg acum. Restul se moștenește din ediția {publicat.number}, iar
          reperele care atârnă de start — check-inul, închiderea înscrierilor, anunțul — se{' '}
          <strong>recalculează</strong> față de noul start, nu se copiază.
        </p>

        <div className="admin-config-grup-campuri">
          <Camp eticheta="Data cursei" eroare={eroareStart}>
            {(control) => (
              <input
                {...control}
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            )}
          </Camp>
          <Camp eticheta="Ora startului">
            {(control) => (
              <input {...control} type="time" value={ora} onChange={(e) => setOra(e.target.value)} />
            )}
          </Camp>
          <Camp eticheta="Locuri" eroare={eroareLocuri}>
            {(control) => (
              <input
                {...control}
                type="number"
                min={1}
                value={locuri}
                onChange={(e) => setLocuri(e.target.value)}
              />
            )}
          </Camp>
        </div>

        {altele.length > 0 && (
          <div className="admin-banner warn" role="status">
            Ediția {publicat.number} are probleme pe care ciorna le-ar moșteni:{' '}
            {altele.map((p) => p.mesaj).join(' ')} Deschide „Editează ediția {publicat.number}" și
            repară-le mai întâi.
          </div>
        )}

        {rezumat.length > 0 && (
          <>
            <p className="admin-confirm-note">Ciorna va porni așa:</p>
            <dl className="admin-mostenire">
              {rezumat.map((c) => (
                <div key={c.eticheta} className={c.recalculat ? 'recalculat' : undefined}>
                  <dt>{c.eticheta}</dt>
                  <dd>
                    {c.valoare}
                    {c.recalculat && <span className="admin-mostenire-marca">recalculat</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="admin-confirm-actions">
          <button
            type="button"
            className="admin-btn-accent"
            disabled={!gata}
            onClick={() => onCreeaza(ciorna)}
          >
            Creează ciorna
          </button>
          <button type="button" className="admin-confirm-cancel" onClick={onAnuleaza}>
            Anulează
          </button>
        </div>
      </div>
    </div>
  );
};
