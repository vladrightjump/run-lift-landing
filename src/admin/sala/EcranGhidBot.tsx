import type { EcranAdmin } from '../stareCurenta';

const GRUPE = [
  {
    titlu: 'Începe aici',
    comenzi: [
      { exemplu: '/start', titlu: 'Deschide conversația', text: 'Scrie-i botului în privat. Pentru organizatorii autorizați, apare meniul de administrare. Membrii obișnuiți primesc pașii de înregistrare.' },
      { exemplu: '/ajutor', titlu: 'Vezi comenzile în Telegram', text: 'Botul îți trimite lista scurtă de comenzi și exemplele lor, direct în conversație.' },
      { exemplu: '/antrenament joi', titlu: 'Vezi antrenamentul', text: 'Afișează ziua, ora, locul, starea sondajului și butoanele de administrare. Fără o zi, /antrenament deschide următorul antrenament disponibil.' },
      { exemplu: '/maine joi', titlu: 'Află cine vine', text: 'Arată cine a răspuns „vin”, cine nu vine și cine n-a răspuns. Poți scrie și /maine fără zi pentru antrenamentul ales implicit de bot.' },
    ],
  },
  {
    titlu: 'Organizează antrenamentele',
    comenzi: [
      { exemplu: '/anuleaza joi ploaie', titlu: 'Anulează o zi', text: 'Previzualizează anularea și motivul. Dacă sondajul a plecat deja, botul anunță anularea în grup. Istoricul se păstrează.' },
      { exemplu: '/reactiveaza joi', titlu: 'Reactivează o zi anulată', text: 'Repune antrenamentul în program după confirmare. Botul îți arată ce se va schimba înainte de a executa.' },
      { exemplu: '/muta joi 07:30 Parcul Valea Morilor', titlu: 'Schimbă ora sau locul', text: 'Modifică antrenamentul ales, fără să schimbe programul săptămânal. Verifică data, ora și locul în previzualizare.' },
      { exemplu: '/extra sâmbătă 08:00 Parcul Valea Morilor', titlu: 'Adaugă un antrenament extra', text: 'Programează o sesiune suplimentară. Pentru o dată exactă poți folosi, de exemplu, /extra 15.10 07:00 Parcul Valea Morilor.' },
      { exemplu: '/sondaj joi', titlu: 'Trimite sondajul', text: 'Cere sondajul pentru antrenamentul ales. Botul verifică dacă acțiunea este posibilă și cere confirmare înainte de trimitere.' },
      { exemplu: '/reaminteste joi', titlu: 'Trimite un reminder', text: 'Cere o reamintire în grup pentru cei care încă n-au răspuns. Citește previzualizarea, apoi confirmă trimiterea.' },
    ],
  },
  {
    titlu: 'Administrează membrii',
    comenzi: [
      { exemplu: '/scoate Ion', titlu: 'Scoate o persoană din grup', text: 'Poți căuta și cu /scoate @utilizator. Alegi persoana din rezultate, verifici contul și grupul, apoi confirmi. Numele identice nu sunt alese automat. Botul trimite rezultatul în privat; istoricul persoanei rămâne.' },
    ],
  },
];

export const EcranGhidBot = ({ onEcran }: { onEcran: (ecran: EcranAdmin) => void }) => (
  <article className="admin-ghid-bot" aria-labelledby="ghid-bot-titlu">
    <header className="admin-config-grup">
      <h2 id="ghid-bot-titlu">Instrucțiuni bot</h2>
      <p>Botul vă ajută să organizați antrenamentele din conversația privată de Telegram.
        Dashboard-ul arată aceleași prezențe, comenzi și rezultate.</p>
      <ol>
        <li><strong>Deschide chatul privat cu botul</strong> și trimite <code>/start</code>.</li>
        <li><strong>Alege o comandă</strong> din meniu sau scrie unul dintre exemplele de mai jos, cu datele tale.</li>
        <li><strong>Verifică previzualizarea.</strong> Acțiunile care schimbă date sau trimit mesaje cer confirmare. Citirea programului și a prezențelor nu modifică nimic.</li>
      </ol>
      <p className="admin-config-hint">Comenzile de administrare funcționează pentru organizatorii autorizați,
        în privat. Faptul că ești administrator în grup nu îți dă automat acces la comenzile botului.
        Dacă meniul lipsește, cere responsabilului botului să îți activeze accesul, apoi repetă <code>/start</code>.</p>
    </header>

    {GRUPE.map((grup) => (
      <section key={grup.titlu} aria-label={grup.titlu}>
        <h3>{grup.titlu}</h3>
        <div className="admin-ghid-comenzi">
          {grup.comenzi.map((comanda) => (
            <section className="admin-config-grup" key={comanda.exemplu}>
              <h4>{comanda.titlu}</h4>
              <code className="admin-ghid-exemplu">{comanda.exemplu}</code>
              <p>{comanda.text}</p>
            </section>
          ))}
        </div>
      </section>
    ))}

    <section className="admin-config-grup" aria-labelledby="ghid-automat">
      <h3 id="ghid-automat">Ce face automat</h3>
      <ul>
        <li><strong>Sondajul:</strong> pleacă în zilele și la ora salvate în „Setări bot”, pentru antrenamentul de a doua zi.</li>
        <li><strong>Rezumatul:</strong> ajunge organizatorilor în privat, dimineața, conform programului.</li>
        <li><strong>Reminderul:</strong> dacă este activat și confirmările sunt sub pragul ales, pleacă cu două ore înaintea antrenamentului.</li>
        <li><strong>Lista de inactivi:</strong> organizatorii primesc lunea un rezumat cu persoanele de verificat.</li>
        <li><strong>Apartenența:</strong> intrările și ieșirile din grup actualizează lista; botul reverifică periodic conturile cunoscute.</li>
      </ul>
      <p>Orele sunt cele din Chișinău. Oprirea din „Setări bot” oprește sarcinile programate de antrenament;
        comenzile deja puse în coadă și verificarea apartenenței continuă.</p>
      <button type="button" className="admin-btn-ghost" onClick={() => onEcran('grup-bot')}>Deschide Setări bot</button>
    </section>

    <section className="admin-config-grup" aria-labelledby="ghid-membri">
      <h3 id="ghid-membri">Cum citești lista de membri</h3>
      <ul>
        <li><strong>În grup:</strong> ultima verificare confirmă apartenența la Telegram.</li>
        <li><strong>Arhivă:</strong> persoana a ieșit sau a fost scoasă/blocată. Istoricul rămâne disponibil.</li>
        <li><strong>Neverificați:</strong> botul nu a confirmat încă apartenența. Nu înseamnă că persoana a ieșit.</li>
        <li><strong>Conturi nelegate:</strong> asociază contul cu persoana existentă sau creează un membru nou, ca să eviți duplicatele.</li>
      </ul>
      <p>„Activ” și „În pauză” descriu starea la antrenamente, separat de apartenența la Telegram.
        „Verifică apartenența” programează verificarea a până la 10 conturi pe minut.
        Botul nu poate importa automat întreaga listă de membri vechi pe care nu îi cunoaște.</p>
      <button type="button" className="admin-btn-ghost" onClick={() => onEcran('grup-membri')}>Deschide Membri</button>
    </section>

    <section className="admin-config-grup" aria-labelledby="ghid-rezolvare">
      <h3 id="ghid-rezolvare">Dacă ceva nu merge</h3>
      <dl>
        <dt>Comanda este în așteptare</dt>
        <dd>Botul preia coada periodic, de obicei în următorul minut. Verifică „Ultimele comenzi” din Setări bot înainte să repeți acțiunea.</dd>
        <dt>Confirmarea a expirat</dt>
        <dd>Confirmările private expiră după 15 minute și se pierd dacă botul repornește. Trimite din nou comanda și verifică noua previzualizare.</dd>
        <dt>O scoatere a eșuat</dt>
        <dd>Citește motivul. Botul are nevoie de drepturi de administrator pentru a scoate persoane; administratorii și organizatorii sunt protejați. O eroare nu dovedește că persoana a rămas în grup.</dd>
        <dt>Verificarea membrilor a eșuat</dt>
        <dd>Dashboard-ul păstrează ultima stare cunoscută. Verifică data observației și cere o reverificare; persoana nu este marcată automat ca ieșită.</dd>
      </dl>
      <p className="admin-config-hint">Pentru un mesaj personalizat către grup, folosește editorul din Setări bot.
        Exemplele din acest ghid sunt instrucțiuni de introdus în Telegram; afișarea lor aici nu execută comenzi.</p>
    </section>
  </article>
);
