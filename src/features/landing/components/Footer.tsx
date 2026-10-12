const ORGANIZATORI = [
  { nume: 'Vladislav Filip', tel: '+373 69 509 949', ig: 'vladfillip' },
  { nume: 'Roma Morari', tel: '+373 69 819 404', ig: 'morarroma' },
];

/** Footerul ca bază de afiș: marca pe toată lățimea, apoi organizatorii și comunitatea. */
export const Footer = () => {
  return (
    <footer className="e3-foot">
      <div className="e3-wrap">
        <p className="e3-foot-mark" aria-hidden="true">
          Run + Lift
        </p>
        <div className="e3-foot-grid">
          <span className="e3-foot-year">Run + Lift · 2026</span>
          {ORGANIZATORI.map((o) => (
            <div key={o.ig} className="e3-foot-org">
              <span className="e3-label">Organizator</span>
              <span className="e3-foot-name">{o.nume}</span>
              <a href={`tel:${o.tel.replace(/\s/g, '')}`} className="e3-link">
                {o.tel}
              </a>
              <a
                href={`https://www.instagram.com/${o.ig}`}
                target="_blank"
                rel="noopener noreferrer"
                className="e3-link"
              >
                @{o.ig}
              </a>
            </div>
          ))}
          <div className="e3-foot-org">
            <span className="e3-label">Comunitatea</span>
            <a
              href="https://www.instagram.com/we_run_and_lift/"
              target="_blank"
              rel="noopener noreferrer"
              className="e3-link"
            >
              @we_run_and_lift
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
