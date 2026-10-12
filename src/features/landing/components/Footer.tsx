import shared4 from '../../../shared/ui/PublicControls.module.css';
import shared3 from './LandingStyles.module.css';
import shared2 from '../../../shared/ui/PublicLayout.module.css';
import styles from './Footer.module.css';
const ORGANIZATORI = [
  { nume: 'Vladislav Filip', tel: '+373 69 509 949', ig: 'vladfillip' },
  { nume: 'Roma Morari', tel: '+373 69 819 404', ig: 'morarroma' },
];

/** Footerul ca bază de afiș: marca pe toată lățimea, apoi organizatorii și comunitatea. */
export const Footer = () => {
  return (
    <footer className={styles['e3-foot']} data-css={"e3-foot"}>
      <div className={shared2['e3-wrap']} data-css={"e3-wrap"}>
        <p className={styles['e3-foot-mark']} data-css={"e3-foot-mark"} aria-hidden="true">
          Run + Lift
        </p>
        <div className={styles['e3-foot-grid']} data-css={"e3-foot-grid"}>
          <span className={styles['e3-foot-year']} data-css={"e3-foot-year"}>Run + Lift · 2026</span>
          {ORGANIZATORI.map((o) => (
            <div key={o.ig} className={styles['e3-foot-org']} data-css={"e3-foot-org"}>
              <span className={shared3['e3-label']} data-css={"e3-label"}>Organizator</span>
              <span className={styles['e3-foot-name']} data-css={"e3-foot-name"}>{o.nume}</span>
              <a href={`tel:${o.tel.replace(/\s/g, '')}`} className={shared4['e3-link']} data-css={"e3-link"}>
                {o.tel}
              </a>
              <a
                href={`https://www.instagram.com/${o.ig}`}
                target="_blank"
                rel="noopener noreferrer"
                className={shared4['e3-link']} data-css={"e3-link"}
              >
                @{o.ig}
              </a>
            </div>
          ))}
          <div className={styles['e3-foot-org']} data-css={"e3-foot-org"}>
            <span className={shared3['e3-label']} data-css={"e3-label"}>Comunitatea</span>
            <a
              href="https://www.instagram.com/we_run_and_lift/"
              target="_blank"
              rel="noopener noreferrer"
              className={shared4['e3-link']} data-css={"e3-link"}
            >
              @we_run_and_lift
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
