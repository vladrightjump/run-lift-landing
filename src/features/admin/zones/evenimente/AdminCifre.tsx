import styles from './AdminCifre.module.css';
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
    <section className="admin-stats" data-css="admin-stats">
      <div className="admin-stat" data-css="admin-stat">
        <span className="admin-stat-label" data-css="admin-stat-label">Înscriși</span>
        <span className="admin-stat-value" data-css="admin-stat-value" key={inscrisi}>
          {inscrisi}
          {!arhiva && <span className={styles['admin-stat-total']} data-css="admin-stat-total"> / {TOTAL_SLOTS}</span>}
        </span>
      </div>
      {!arhiva && (
        <>
          <div className="admin-stat" data-css="admin-stat">
            <span className="admin-stat-label" data-css="admin-stat-label">Locuri rămase</span>
            <span className={`admin-stat-value${remaining <= 3 ? ' low' : ''}`} data-css={`admin-stat-value${remaining <= 3 ? ' low' : ''}`} key={remaining}>
              {remaining}
            </span>
          </div>
          <div className="admin-stat" data-css="admin-stat">
            <span className="admin-stat-label" data-css="admin-stat-label">Grad de ocupare</span>
            <span className="admin-stat-value accent" data-css="admin-stat-value accent" key={percent}>
              {percent}%
            </span>
          </div>
        </>
      )}
      <div className="admin-stat" data-css="admin-stat">
        <span className="admin-stat-label" data-css="admin-stat-label">În așteptare</span>
        <span className="admin-stat-value" data-css="admin-stat-value" key={peAsteptare}>
          {peAsteptare}
          {!arhiva && <span className={styles['admin-stat-total']} data-css="admin-stat-total"> / {WAITLIST_SLOTS}</span>}
        </span>
      </div>
      <div className="admin-stat" data-css="admin-stat">
        <span className="admin-stat-label" data-css="admin-stat-label">Emailuri nelivrate</span>
        <span className={`admin-stat-value${nelivrate > 0 ? ' low' : ''}`} data-css={`admin-stat-value${nelivrate > 0 ? ' low' : ''}`} key={nelivrate}>
          {nelivrate}
        </span>
      </div>
    </section>

    {!arhiva && (
      <section className={styles['admin-occupancy']} data-css="admin-occupancy">
        <div className="slots-head">
          <span className="slots-label">Ocupare locuri</span>
          <span className={styles['admin-occupancy-count']} data-css="admin-occupancy-count">
            {inscrisi} din {TOTAL_SLOTS} locuri ocupate
          </span>
        </div>
        <div className="slots-grid">
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
            <div key={i} className={`slot ${styles['admin-slot']}${i < inscrisi ? ' filled' : ''}`} data-css={`slot admin-slot${i < inscrisi ? ' filled' : ''}`} />
          ))}
        </div>
      </section>
    )}
    </>
  );
};
