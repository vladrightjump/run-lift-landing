import { useEditionStrings } from '../../hooks/useEventConfig';
import { SectionHead } from './SectionHead';

type Props = {
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/**
 * Secțiunea „Locația" ca orar de afiș: ora de start la scară mare, locul și
 * data dedesubt, harta alături. Tonul mai adânc (`bg-deep`) o desparte de
 * secțiunile vecine fără o culoare nouă.
 */
export const VenueSection = ({ num = '02' }: Props) => {
  const {
    EVENT_WHERE,
    EVENT_WHEN,
    EVENT_START_TIME,
    MAP_EMBED_SRC: MAP_SRC,
    MAP_DIRECTIONS_URL: DIRECTIONS_URL,
  } = useEditionStrings();

  return (
    <section className="e3-sec e3-venue">
      <div className="e3-wrap">
        <SectionHead num={num}>Locația</SectionHead>
        <div className="e3-venue-grid">
          <div className="e3-venue-info" data-reveal>
            <span className="e3-label">Start</span>
            <p className="e3-num e3-venue-time">{EVENT_START_TIME}</p>
            <dl className="e3-venue-list">
              <div className="e3-row e3-venue-row">
                <dt className="e3-label">Unde</dt>
                <dd>{EVENT_WHERE}</dd>
              </div>
              <div className="e3-row e3-venue-row">
                <dt className="e3-label">Când</dt>
                <dd>{EVENT_WHEN}</dd>
              </div>
            </dl>
            <p className="e3-venue-note">
              Vino cu 30 de minute înainte pentru check-in și încălzire. Hidratare la fața locului.
            </p>
          </div>
          <div className="e3-venue-map" data-reveal>
            <iframe
              title={`${EVENT_WHERE}: hartă`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              src={MAP_SRC}
            />
            <a className="e3-link e3-arrow-link" href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">↗</span> Deschide în Google Maps
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
