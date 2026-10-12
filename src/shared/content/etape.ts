/**
 * Etapele din exploratorul „Formatul": ce face participantul la fiecare pas.
 *
 * Conținut fix în cod, nu editabil din admin (vezi planul redesignului).
 * Ciornă scrisă din ce spune deja pagina; o aprobă organizatorul înainte de
 * livrare. Fără cifre inventate (distanțe, număr de stații): până le fixează
 * organizatorul, textele rămân calitative.
 */
export type Etapa = {
  /** Eticheta tab-ului: RUN, LIFT, REPEAT. */
  nume: string;
  /** Fraza de deschidere a panoului. */
  intro: string;
  /** 3-4 detalii scurte despre ce se întâmplă în etapa asta. */
  detalii: string[];
};

export const ETAPE: Etapa[] = [
  {
    nume: 'RUN',
    intro: 'Alergarea leagă stațiile între ele. Același traseu pentru toți, prin parc.',
    detalii: [
      'Segmente de alergare între stații, nu o cursă lungă dintr-o bucată.',
      'Ritmul îl alegi tu: contează să ajungi, nu să sprintezi.',
      'Traseul e același pentru toți participanții.',
    ],
  },
  {
    nume: 'LIFT',
    intro: 'La fiecare stație, un exercițiu funcțional: forță, împins, tras, cărat.',
    detalii: [
      'Mișcări simple, pe care le recunoști din sală.',
      'Antrenorii adaptează greutățile nivelului tău, la fața locului.',
      'Nu ai nevoie de experiență în competiții ca să termini.',
    ],
  },
  {
    nume: 'REPEAT',
    intro: 'Alternezi alergarea cu stațiile până la finish, contra cronometru.',
    detalii: [
      'Contează timpul total, de la start până treci linia de sosire.',
      'Deschis oricui, indiferent de nivel.',
      'Adu apă pentru hidratare și bună dispoziție.',
    ],
  },
];
