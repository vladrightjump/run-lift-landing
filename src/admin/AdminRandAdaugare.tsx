type Ciorna = { nume: string; telefon: string; email: string };

type Props = {
  deschis: boolean;
  arhiva: boolean;
  ciorna: Ciorna;
  setCiorna: (fn: (p: Ciorna) => Ciorna) => void;
  /** Id-ul rândului editat; `null` = adăugare nouă. */
  editId: string | null;
  saving: boolean;
  onSalveaza: () => void;
  onRenunta: () => void;
};

/**
 * Rândul de adăugare/editare a unui participant.
 *
 * Aceleași trei câmpuri servesc ambele operații — diferența e doar `editId`,
 * care schimbă ce buton se apasă la final. Formular, nu tabel: de asta e propria
 * componentă, deși stă în mijlocul tabelului de participanți.
 */
export const AdminRandAdaugare = ({
  deschis,
  arhiva,
  ciorna,
  setCiorna,
  editId,
  saving,
  onSalveaza,
  onRenunta,
}: Props) => {
  if (!deschis || arhiva) return null;
  return (
      <div className="admin-add-row">
        <label className="admin-add-field grow">
          <span>Nume</span>
          <input
            type="text"
            placeholder="Ana Popescu"
            value={ciorna.nume}
            onChange={(e) => setCiorna((d) => ({ ...d, nume: e.target.value }))}
          />
        </label>
        <label className="admin-add-field">
          <span>Telefon</span>
          <input
            type="tel"
            placeholder="069 xxx xxx"
            value={ciorna.telefon}
            onChange={(e) => setCiorna((d) => ({ ...d, telefon: e.target.value }))}
          />
        </label>
        <label className="admin-add-field grow">
          <span>Email</span>
          <input
            type="email"
            placeholder="ana@email.md"
            value={ciorna.email}
            onChange={(e) => setCiorna((d) => ({ ...d, email: e.target.value }))}
          />
        </label>
        <button
          type="button"
          className="admin-btn-accent"
          onClick={onSalveaza}
          disabled={saving}
        >
          {saving ? 'Se salvează…' : editId ? 'Salvează modificările' : 'Salvează'}
        </button>
        <button
          type="button"
          className="admin-add-cancel"
          onClick={onRenunta}
        >
          Anulează
        </button>
      </div>
  );
};
