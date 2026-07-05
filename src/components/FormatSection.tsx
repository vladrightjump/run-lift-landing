type EquipmentCard = {
  label: string;
  moves: string[];
  weight: string;
};

const EQUIPMENT: EquipmentCard[] = [
  {
    label: 'HALTERĂ (BARĂ)',
    moves: ['clean', 'front squat', 'jerk / push press', 'back squat'],
    weight: 'Bare de 100 / 80 / 60 / 40 kg',
  },
  {
    label: 'KETTLEBELL',
    moves: ['deadlift', 'swing', 'high pull', 'goblet squat'],
    weight: 'Kettlebell-uri de 32 / 24 / 16 kg',
  },
  {
    label: 'GANTERE',
    moves: ['deadlift', 'hang clean', 'push press', 'squat'],
    weight: 'Perechi de gantere de 15 / 12 / 10 kg',
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
        Bear Complex + alergare — 5 runde contra cronometru. Antrenorul îți alege echipamentul și greutatea în
        funcție de pregătirea fizică — halteră, kettlebell sau gantere — și faci în fiecare rundă complexul
        respectiv, câte 12 repetări la fiecare mișcare.
      </p>
      <div className="eq-grid">
        {EQUIPMENT.map((eq) => (
          <div key={eq.label} className="eq-card" data-reveal>
            <div className="eq-label">{eq.label}</div>
            <ul className="eq-list">
              {eq.moves.map((move) => (
                <li key={move}>
                  <span className="rep">12</span>
                  {move}
                </li>
              ))}
            </ul>
            <p className="eq-foot">{eq.weight}</p>
          </div>
        ))}
      </div>
      <div className="rounds-banner">
        <span className="label">5 runde</span>
        <span className="desc">Fiecare rundă: alergare un cerc de 400 m + o rundă de Bear Complex</span>
      </div>
    </div>
  </section>
);
