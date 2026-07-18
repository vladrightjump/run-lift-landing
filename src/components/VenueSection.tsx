// Locația exactă din link-ul Google Maps al organizatorului (pinul „Новая
// спортплощадка" din Parcul Râșcani). Butonul de direcții folosește link-ul scurt.
const MAP_SRC =
  'https://maps.google.com/maps?q=%D0%9D%D0%BE%D0%B2%D0%B0%D1%8F%20%D1%81%D0%BF%D0%BE%D1%80%D1%82%D0%BF%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D0%BA%D0%B0%20Chi%C8%99in%C4%83u&z=16&hl=ro&output=embed';
const DIRECTIONS_URL = 'https://share.google/EO25izjX5nIyQgwsa';

export const VenueSection = () => (
  <section className="section">
    <div className="container venue-grid">
      <div>
        <div className="section-head" style={{ marginBottom: 32 }} data-reveal>
          <span className="section-num">02</span>
          <h2>Locația</h2>
        </div>
        <div className="venue-table">
          <div className="venue-row">
            <span className="venue-key">Unde</span>
            <span className="venue-val">Parcul Râșcani, Str. Braniștii, Chișinău</span>
          </div>
          <div className="venue-row">
            <span className="venue-key">Când</span>
            <span className="venue-val">Sâmbătă, 18 iulie 2026</span>
          </div>
          <div className="venue-row">
            <span className="venue-key">Start</span>
            <span className="venue-val">07:00</span>
          </div>
        </div>
        <p className="venue-note">
          Vino cu 30 de minute înainte pentru check-in și încălzire. Hidratare la fața locului.
        </p>
      </div>
      <div className="venue-map">
        <iframe
          title="Parcul Râșcani, Chișinău — hartă"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          src={MAP_SRC}
        />
        <div className="venue-map-caption">
          <span className="dot" aria-hidden="true"></span>
          <span className="txt">Parcul Râșcani · Str. Braniștii</span>
        </div>
        <a className="venue-map-link" href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
          Deschide în Google Maps
        </a>
      </div>
    </div>
  </section>
);
