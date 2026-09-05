type Props = {
  /** Câți sunt înscriși în ediția deschisă. */
  inscrisi: number;
  /** Câți așteaptă un loc. */
  peAsteptare: number;
  TOTAL_SLOTS: number;
  WAITLIST_SLOTS: number;
  /** Emailuri a căror ultimă încercare a eșuat. */
  nelivrate: number;
  /** Ediție de arhivă — cifrele se citesc, dar nu mai descriu ediția curentă. */
  arhiva: boolean;
};

/**
 * Cifrele de sus: înscriși, listă de așteptare, emailuri nelivrate, plus bara
 * de ocupare a ediției.
 *
 * Sunt derivate pure din numere deja calculate în dashboard — nicio cerere,
 * nicio stare. Stăteau primele în fișier și împingeau restul cu cincizeci de
 * linii mai jos.
 */
export const AdminCifre = ({
  inscrisi,
  peAsteptare,
  TOTAL_SLOTS,
  WAITLIST_SLOTS,
  nelivrate,
  arhiva,
}: Props) => {
  const remaining = Math.max(0, TOTAL_SLOTS - inscrisi);
  const percent = TOTAL_SLOTS > 0 ? Math.round((inscrisi / TOTAL_SLOTS) * 100) : 0;
  return (
    <>
    <section className="admin-stats">
      <div className="admin-stat">
        <span className="admin-stat-label">Înscriși</span>
        <span className="admin-stat-value" key={inscrisi}>
          {inscrisi}
          {!arhiva && <span className="admin-stat-total"> / {TOTAL_SLOTS}</span>}
        </span>
      </div>
      {!arhiva && (
        <>
          <div className="admin-stat">
            <span className="admin-stat-label">Locuri rămase</span>
            <span className={`admin-stat-value${remaining <= 3 ? ' low' : ''}`} key={remaining}>
              {remaining}
            </span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Grad de ocupare</span>
            <span className="admin-stat-value accent" key={percent}>
              {percent}%
            </span>
          </div>
        </>
      )}
      <div className="admin-stat">
        <span className="admin-stat-label">În așteptare</span>
        <span className="admin-stat-value" key={peAsteptare}>
          {peAsteptare}
          {!arhiva && <span className="admin-stat-total"> / {WAITLIST_SLOTS}</span>}
        </span>
      </div>
      <div className="admin-stat">
        <span className="admin-stat-label">Emailuri nelivrate</span>
        <span className={`admin-stat-value${nelivrate > 0 ? ' low' : ''}`} key={nelivrate}>
          {nelivrate}
        </span>
      </div>
    </section>

    {!arhiva && (
      <section className="admin-occupancy">
        <div className="slots-head">
          <span className="slots-label">Ocupare locuri</span>
          <span className="admin-occupancy-count">
            {inscrisi} din {TOTAL_SLOTS} locuri ocupate
          </span>
        </div>
        <div className="slots-grid">
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
            <div key={i} className={`slot admin-slot${i < inscrisi ? ' filled' : ''}`} />
          ))}
        </div>
      </section>
    )}
    </>
  );
};
