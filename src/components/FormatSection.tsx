type FormatCard = {
  label: string;
  desc: string;
};

const CARDS: FormatCard[] = [
  {
    label: 'RUN',
    desc: 'Segmente de alergare prin parc între stații — același traseu pentru toți.',
  },
  {
    label: 'LIFT',
    desc: 'Stații de exerciții funcționale — forță, împins, tras, cărat.',
  },
  {
    label: 'REPEAT',
    desc: 'Alternezi alergarea cu stațiile până la finish — contra cronometru.',
  },
];

export const FormatSection = () => (
  <section className="section">
    <div className="container">
      <div className="section-head" data-reveal>
        <span className="section-num">01</span>
        <h2>Formatul</h2>
      </div>
      <p className="section-intro">
        Alergi. Ridici. Repeți. Segmente de alergare alternate cu stații de exerciții funcționale, în
        stil HYROX. Fără trucuri — doar tu, cronometrul și traseul. Stațiile și greutățile se adaptează
        nivelului tău de către antrenori la fața locului.
      </p>
      <div className="eq-grid">
        {CARDS.map((c) => (
          <div key={c.label} className="eq-card" data-reveal>
            <div
              className="eq-label"
              style={{ fontSize: 30, letterSpacing: 1, color: '#C9F24B', marginBottom: 14 }}
            >
              {c.label}
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#C9CCBE' }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
