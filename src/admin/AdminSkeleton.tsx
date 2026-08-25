type Props = {
  /** Câte coloane are tabelul-gazdă (grila vine din `.admin-row`). */
  cols: number;
  /** Câte rânduri fantomă. Implicit 5 — cât să pară listă, nu o singură bară. */
  rows?: number;
};

/**
 * Rânduri fantomă pentru tabelele din backoffice, cât se încarcă datele.
 * Stau în `.admin-row`, deci preiau grila tabelului în care sunt puse și se
 * aliniază la coloanele lui fără să știe nimic despre ele.
 */
export const AdminFeedSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div role="status" aria-busy="true">
    <span className="admin-sr">Se încarcă…</span>
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="admin-activity-item" aria-hidden="true">
        <span className="admin-activity-dot" style={{ opacity: 0.3 }} />
        <span className="admin-skel" style={{ flex: 1, maxWidth: `${46 + r * 12}%` }} />
      </div>
    ))}
  </div>
);

export const AdminSkeleton = ({ cols, rows = 5 }: Props) => (
  <div role="status" aria-busy="true">
    <span className="admin-sr">Se încarcă…</span>
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="admin-row" aria-hidden="true">
        {Array.from({ length: cols }, (_, c) => (
          // Lățimi inegale, altfel șirul de bare arată a grilă, nu a date.
          <span key={c} className="admin-skel" style={{ width: `${52 + ((r + c) % 4) * 14}%` }} />
        ))}
      </div>
    ))}
  </div>
);
