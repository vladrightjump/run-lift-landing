import { useCallback, useState } from 'react';
import { Dialog } from '../../../../shared/ui/Dialog';
import adminStyles from '../../components/AdminStyles.module.css';
import adminRoot from '../../components/RadacinaAdmin.module.css';
import { useAdminResource } from '../../data/useAdminResource';
import { incarcaAniversare, type PreferinteAniversare } from './api';
import sharedSala from './SalaStyles.module.css';
import styles from './EcranMembri.module.css';

type ActiuniAniversare = {
  ocupat: boolean;
  onInchide: () => void;
  onSalveaza: (zi: number | null, luna: number | null) => void;
};

const SURSE = {
  telegram: 'Dată din profilul Telegram.',
  manual: 'Dată introdusă de un organizator.',
  legacy: 'Dată din profilul completat anterior.',
};

const FormularAniversare = ({
  date, ocupat, onInchide, onSalveaza,
}: ActiuniAniversare & { date: PreferinteAniversare }) => {
  const [zi, setZi] = useState(date.day?.toString() ?? '');
  const [luna, setLuna] = useState(date.month?.toString() ?? '');
  const ziNumerica = Number(zi);
  const lunaNumerica = Number(luna);
  const valida = /^\d{1,2}$/.test(zi) && /^\d{1,2}$/.test(luna) &&
    lunaNumerica >= 1 && lunaNumerica <= 12 &&
    ziNumerica >= 1 && ziNumerica <= new Date(Date.UTC(2000, lunaNumerica, 0)).getUTCDate();
  const modificata = ziNumerica !== date.day || lunaNumerica !== date.month;

  return (
    <form
      className={styles['admin-sala-formular']} data-css="admin-sala-formular"
      onSubmit={(e) => {
        e.preventDefault();
        if (valida && modificata && !ocupat) onSalveaza(ziNumerica, lunaNumerica);
      }}
    >
      <p className={adminStyles['admin-config-hint']} data-css="admin-config-hint">
        {date.enabled ? 'Membrul a activat urările în grup.' : 'Urările în grup sunt oprite.'}
        {date.source && ' ' + SURSE[date.source]}
      </p>
      <label className={adminStyles['admin-config-eticheta']} data-css="admin-config-eticheta" htmlFor="sala-aniversare-zi">
        Zi
      </label>
      <input
        id="sala-aniversare-zi"
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder="1–31"
        value={zi}
        disabled={ocupat}
        onChange={(e) => setZi(e.target.value)}
      />
      <label className={adminStyles['admin-config-eticheta']} data-css="admin-config-eticheta" htmlFor="sala-aniversare-luna">
        Lună
      </label>
      <input
        id="sala-aniversare-luna"
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder="1–12"
        value={luna}
        disabled={ocupat}
        onChange={(e) => setLuna(e.target.value)}
      />
      {zi !== '' && luna !== '' && !valida && (
        <span className={sharedSala['admin-sala-motiv']} data-css="admin-sala-motiv">Alege o combinație validă de zi și lună.</span>
      )}
      <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
        <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" disabled={ocupat} onClick={onInchide}>
          Renunță
        </button>
        {date.day !== null && (
          <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" disabled={ocupat}
            onClick={() => onSalveaza(null, null)}>
            Elimină data
          </button>
        )}
        <button type="submit" className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent" disabled={ocupat || !valida || !modificata}>
          Salvează
        </button>
      </div>
    </form>
  );
};

export const DialogZiNastere = ({
  membru, ...actiuni
}: ActiuniAniversare & { membru: { id: string; nume: string } }) => {
  const incarca = useCallback((token: string, signal: AbortSignal) => incarcaAniversare(token, membru.id, signal), [membru.id]);
  const { date, eroare, reincarca } = useAdminResource(incarca, null, {
    queryKey: ['antrenamente', 'aniversare', membru.id],
  });
  return (
    <Dialog titlu={'Zi de naștere: ' + membru.nume} onInchide={actiuni.onInchide}
      clasa={styles['admin-sala-aniversare']}>
      {date && date !== 'migrare_lipsa' ? <FormularAniversare date={date} {...actiuni} /> : (
        <>
          <p role="status">
            {date === 'migrare_lipsa'
              ? 'Datele de naștere vor fi disponibile după aplicarea migrării pentru aniversări.'
              : eroare ? 'Data de naștere nu s-a putut încărca.' : 'Se încarcă data de naștere…'}
          </p>
          <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
            <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" onClick={actiuni.onInchide}>
              Închide
            </button>
            {eroare && (
              <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" onClick={() => void reincarca()}>
                Încearcă din nou
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
};
