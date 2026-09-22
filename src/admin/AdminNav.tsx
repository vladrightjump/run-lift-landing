import type { EcranAdmin } from './stareCurenta';
import { GRUPURI } from './adminNavigatie';

type Props = {
  onEcran: (ecran: EcranAdmin) => void;
  contorEcran: Record<EcranAdmin, number | null>;
  /** Emailuri nelivrate — singurul contor care e o alertă, nu o informație. */
  nelivrate: number;
};

/**
 * Registrul de ecrane, pe ecranul de pornire.
 *
 * A fost o bară cu două niveluri: grupurile sus, frunzele grupului deschis
 * dedesubt. Nivelul al doilea avea rost cât timp bara stătea deasupra fiecărui
 * ecran și trebuia să rămână mică. De când registrul trăiește pe ecranul de
 * pornire, ascunderea a șapte ecrane după un grup închis nu mai cumpără spațiu
 * — cumpără doar un clic în plus și întrebarea „în care dintre ele stă?".
 *
 * Descrierile se VĂD. Erau scrise și înainte, în `adminNavigatie.ts`, dar
 * ajungeau doar în `title`: se citeau numai la hover, numai cu mouse, și
 * niciodată de un cititor de ecran care parcurge lista. Ele sînt răspunsul la
 * „ce e aici?" — exact întrebarea pentru care bara veche cerea să deschizi.
 *
 * Semantica e de NAVIGAȚIE, nu de tab widget. A fost o clipă `role="tab"`,
 * ceea ce era o promisiune neonorată: un tab trebuie să controleze un
 * `tabpanel` prin `aria-controls` și să răspundă la săgeți. Ecranele de aici
 * sînt ecrane întregi, nu panouri ale aceleiași pagini.
 */
export const AdminNav = ({ onEcran, contorEcran, nelivrate }: Props) => (
  <nav className="admin-registru" aria-label="Toate ecranele">
    {/* Registrul trăiește PE ecranul de pornire, deci nu se listează pe sine:
        un buton care te duce unde ești deja e zgomot. Grupul rămas gol dispare
        cu el — altfel ar fi un titlu fără nimic dedesubt. */}
    {GRUPURI.map((g) => ({ ...g, ecrane: g.ecrane.filter((e) => e.cheie !== 'desfasurare') }))
      .filter((g) => g.ecrane.length > 0)
      .map((g) => (
      <section key={g.cheie} className="admin-registru-grup">
        <h2 className="admin-registru-titlu">
          {g.eticheta}
          <span className="admin-registru-intrebare">{g.intrebare}</span>
        </h2>

        <ul className="admin-registru-lista">
          {g.ecrane.map(({ cheie, eticheta, descriere }) => {
            const contor = contorEcran[cheie];
            const alerta = cheie === 'livrare' && nelivrate > 0;
            return (
              <li key={cheie}>
                <button
                  type="button"
                  className="admin-registru-ecran"
                  onClick={() => onEcran(cheie)}
                >
                  <span className="admin-registru-nume">
                    {eticheta}
                    {alerta ? (
                      <span className="admin-tab-alert">{nelivrate}</span>
                    ) : (
                      contor !== null && <span className="admin-tab-contor">{contor}</span>
                    )}
                  </span>
                  <span className="admin-registru-descriere">{descriere}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      ))}
  </nav>
);
