import { useCallback } from 'react';
import { incarcaRezumatSala, type SalaRezumat } from '../../lib/salaApi';
import { useAdminResource } from '../useAdminResource';
import { textCard } from './textCard';

type Props = {
  /** Deschide ecranul „Prezențe". */
  onDeschide: () => void;
};

/**
 * Grupul din parc, pe ecranul de pornire (R4).
 *
 * Stă lângă blocul „În fiecare săptămână", din același motiv: antrenamentul din
 * parc nu ține de nicio ediție, deci nu are ce căuta pe linia de timp. Arată
 * antrenamentul următor și câți vin fără să intri în ecran — privirea de
 * săptămână cu săptămână e chiar asta.
 *
 * Tace dacă cererea pică: pornirea e despre ediție, iar un card stricat
 * deasupra liniei de timp ar fi zgomot exact acolo unde contează mai puțin.
 */
export const CardGrup = ({ onDeschide }: Props) => {
  const incarca = useCallback(
    (token: string, signal: AbortSignal) => incarcaRezumatSala(token, signal),
    []
  );
  const { date: rezumat } = useAdminResource<SalaRezumat>(incarca);
  if (!rezumat) return null;

  const t = textCard(rezumat, new Date());
  const viu = t.stare === 'cu-raspunsuri' || t.stare === 'asteapta-sondajul';

  return (
    <section className="admin-saptamanal admin-sala-card" aria-label="Grupul din parc">
      <div className="admin-saptamanal-cap">
        <span className="admin-saptamanal-eticheta">Grupul din parc</span>
      </div>
      <div className="admin-saptamanal-rand">
        <span className={`admin-saptamanal-stare${viu ? ' pornit' : ''}`}>
          <span className="admin-saptamanal-punct" aria-hidden="true" />
          {t.titlu}
        </span>
        <span className="admin-saptamanal-titlu">{t.detaliu}</span>
        <button type="button" className="admin-btn-ghost" onClick={onDeschide}>
          Prezențe
        </button>
      </div>
    </section>
  );
};
