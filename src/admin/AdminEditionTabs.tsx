import { useState } from 'react';
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
 * Taburile de ediție — fiecare ediție are propriul spațiu, iar edițiile
 * încheiate rămân accesibile ca arhivă. „+ Ediție nouă" mută ediția curentă
 * din `app_config` pe următorul număr: tabul nou pornește gol.
 *
 * Aici stătea un banner de desincronizare între ediția din backend și cea din
 * cod. A dispărut odată cu a doua copie: configul publicat E ediția, iar
 * publicarea scrie scalarele în aceeași tranzacție. Nu mai există stare în care
 * cele două să difere, deci nici ce raporta banner-ul.
 */
export const AdminEditionTabs = ({ editions, selected, onSelect, onCreate, creating }: Props) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lista = editions ?? [];
  const curenta = lista.find((e) => e.este_curenta)?.editie ?? null;
  const urmatoarea = lista.length ? Math.max(...lista.map((e) => e.editie)) + 1 : null;

  return (
    <>
      <nav className="admin-editions" aria-label="Ediții">
        <span className="admin-editions-label">Ediția</span>
        <div className="admin-editions-list">
          {lista.map((e) => (
            <button
              key={e.editie}
              type="button"
              className={`admin-edition${e.editie === selected ? ' active' : ''}${
                e.este_curenta ? ' curenta' : ''
              }`}
              onClick={() => onSelect(e.editie)}
              title={
                e.este_curenta
                  ? 'Ediția curentă — aici intră înscrierile noi'
                  : 'Ediție încheiată — arhivă, doar citire'
              }
            >
              <span className="admin-edition-nr">{e.editie}</span>
              <span className="admin-edition-meta">
                {e.participanti} înscriși
                {e.asteptare > 0 && ` · ${e.asteptare} în așteptare`}
              </span>
            </button>
          ))}
          {editions === null && <span className="admin-editions-loading">Se încarcă edițiile…</span>}
        </div>
        <button
          type="button"
          className="admin-btn-outline admin-edition-new"
          onClick={() => setConfirmOpen(true)}
          disabled={creating || editions === null}
        >
          {creating ? 'Se deschide…' : '+ Ediție nouă'}
        </button>
      </nav>

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
              noi vor intra pe ediția {urmatoarea ?? 'următoare'}, iar tabul ei pornește gol.
            </p>
            <p className="admin-confirm-note">
              Se șterg și reperele de timp ale ediției încheiate (deadline de înscriere + data
              startului), ca să nu blocheze înscrierile și să nu declanșeze reminderul vechi.
              După asta actualizează <code>src/content/edition.ts</code> cu datele noii ediții,
              rulează <code>npm run sync-edition</code> și redeployează.
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
