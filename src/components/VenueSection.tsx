const MAP_SRC =
  'https://maps.google.com/maps?q=Stadionul+Dinamo,+Strada+Alexei+%C8%98ciusev+106A,+Chi%C8%99in%C4%83u&t=h&z=17&hl=ro&output=embed';
const DIRECTIONS_URL = 'https://www.google.com/maps/dir/?api=1&destination=47.0265979,28.8192078';

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
            <span className="venue-val">Stadionul Dinamo, Chișinău</span>
          </div>
          <div className="venue-row">
            <span className="venue-key">Când</span>
            <span className="venue-val">Sâmbătă, 11 iulie 2026</span>
          </div>
          <div className="venue-row">
            <span className="venue-key">Ora</span>
            <span className="venue-val">6:30</span>
          </div>
        </div>
        <p className="venue-note">
          Zona de start și stațiile de forță sunt amplasate pe stadion. Hidratare la fața locului.
        </p>
      </div>
      <div className="venue-map">
        <iframe
          title="Stadionul Dinamo, Chișinău — hartă"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          src={MAP_SRC}
        />
        <div className="venue-map-caption">
          <span className="dot" aria-hidden="true"></span>
          <span className="txt">Stadionul Dinamo · Str. Șciusev 106A</span>
        </div>
        <a className="venue-map-link" href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
          Deschide în Google Maps
        </a>
      </div>
    </div>
  </section>
);
