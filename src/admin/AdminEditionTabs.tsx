import { useId, useState } from 'react';
import type { AdminEdition } from '../lib/adminApi';

type Props = {
  editions: AdminEdition[] | null;
  /** Ediția deschisă acum în backoffice (nu neapărat cea „curentă"). */
  selected: number | null;
  onSelect: (editie: number) => void;
  onCreate: () => void;
  creating: boolean;
};

/**
 * Selectorul de ediție.
 *
 * A fost o bandă de butoane, câte unul per ediție. Mergea la trei; la a opta
 * ediție banda se rupe pe două rânduri și mănâncă un sfert din ecran înainte ca
 * organizatorul să fi văzut vreun participant. O listă are o înălțime fixă,
 * oricâte ediții s-ar aduna.
 *
 * Eticheta poartă tot ce purtau butoanele (numărul, câți s-au înscris, care e
 * cea curentă), ca alegerea să nu ceară deschiderea listei ca să compari.
 *
 * „+ Ediție nouă" mută ediția curentă din `app_config` pe următorul număr:
 * ediția nouă pornește goală.
 */
export const AdminEditionTabs = ({ editions, selected, onSelect, onCreate, creating }: Props) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const id = useId();

  const lista = editions ?? [];
  const curenta = lista.find((e) => e.este_curenta)?.editie ?? null;
  const urmatoarea = lista.length ? Math.max(...lista.map((e) => e.editie)) + 1 : null;
  const aleasa = lista.find((e) => e.editie === selected) ?? null;

  const eticheta = (e: AdminEdition): string => {
    const parti = [`Ediția ${e.editie}`, `${e.participanti} înscriși`];
    if (e.asteptare > 0) parti.push(`${e.asteptare} în așteptare`);
    parti.push(e.este_curenta ? 'curentă' : 'arhivă');
    return parti.join(' · ');
  };

  return (
    <>
      <div className="admin-editions">
        <label className="admin-editions-label" htmlFor={id}>
          Ediția
        </label>
        <div className="admin-editions-control">
          <select
            id={id}
            className="admin-editions-select"
            value={selected ?? ''}
            disabled={editions === null || lista.length === 0}
            onChange={(e) => onSelect(Number(e.target.value))}
          >
            {editions === null && <option value="">Se încarcă edițiile…</option>}
            {/* Lista a sosit, dar nicio ediție nu e aleasă — se întâmplă când
                backendul nu marchează niciuna drept curentă. Fără opțiunea
                asta, `value=""` n-ar avea corespondent, iar browserul ar afișa
                prima ediție ca și cum ar fi selectată: controlul ar minți, iar
                tabelele de dedesubt ar filtra pe nimic. Banda de butoane de
                dinainte era onestă aici — niciunul nu era aprins. */}
            {editions !== null && selected === null && (
              <option value="" disabled>
                Alege ediția…
              </option>
            )}
            {editions !== null && lista.length === 0 && (
              <option value="">Nicio ediție încă</option>
            )}
            {lista.map((e) => (
              <option key={e.editie} value={e.editie}>
                {eticheta(e)}
              </option>
            ))}
          </select>
          {/* Pastila apare DOAR pentru arhivă. „Curentă" e starea normală și e
              deja scrisă în eticheta din listă; repetată alături, ar fi zgomot
              permanent. Se semnalează excepția — cea care chiar schimbă
              comportamentul, pentru că blochează scrierile. */}
          {aleasa && !aleasa.este_curenta && (
            <span className="admin-edition-stare">Arhivă · doar citire</span>
          )}
        </div>
        <button
          type="button"
          className="admin-btn-outline admin-edition-new"
          onClick={() => setConfirmOpen(true)}
          disabled={creating || editions === null}
        >
          {creating ? 'Se deschide…' : '+ Ediție nouă'}
        </button>
      </div>

      {confirmOpen && (
        <div
          className="admin-confirm-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="admin-confirm" role="alertdialog" aria-modal="true">
            <h3>Deschizi ediția {urmatoarea ?? 'următoare'}?</h3>
            <p>
              Ediția {curenta} se închide și rămâne în arhivă — nimic nu se șterge. Înscrierile
              noi vor intra pe ediția {urmatoarea ?? 'următoare'}, iar ediția nouă pornește goală.
            </p>
            <p className="admin-confirm-note">
              Se șterg și reperele de timp ale ediției încheiate (deadline de înscriere + data
              startului), ca să nu blocheze înscrierile și să nu declanșeze reminderul vechi.
              Butonul ăsta mută doar unde intră înscrierile noi — datele ediției (dată, loc,
              locuri, secțiuni) le pui din <strong>Setup → Evenimentul</strong> și le publici de
              acolo. Fără editări în cod, fără deploy.
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn-accent"
                onClick={() => {
                  setConfirmOpen(false);
                  onCreate();
                }}
              >
                Da, deschide ediția {urmatoarea ?? ''}
              </button>
              <button
                type="button"
                className="admin-confirm-cancel"
                onClick={() => setConfirmOpen(false)}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
