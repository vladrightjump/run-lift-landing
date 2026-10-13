import { rpc } from '../shared/lib/rpc';

export type AdminWorkoutRow = {
  id: string;
  /** Poziția în program, 1…N. Poziție, nu identificator: mutarea renumerotează. */
  numar: number;
  status: 'published' | 'superseded';
  titlu: string;
  corp: string;
  vizibil: boolean;
  creat_la: string;
};

/**
 * Salvează o săptămână. Efect imediat pe site — nu trece prin ciornă.
 *
 * `id` null înseamnă „săptămână nouă": serverul îi pune numărul următor, deci
 * organizatorul nu tastează și nu alege niciun număr. `id` dat înseamnă „editez
 * săptămâna asta" și e id-ul rândului ei PUBLICAT — nu numărul ei, fiindcă un
 * număr trimis dintr-un ecran rămas în urmă după o renumerotare ar lovi altă
 * săptămână decât cea apăsată.
 *
 * Serverul decide dacă scrie o versiune nouă sau peticește rândul publicat:
 * titlul sau corpul schimbat scriu, vizibilitatea singură peticește. Clientul nu
 * trebuie să știe regula, doar să nu o contrazică trimițând altceva.
 */
export const saveWeeklyWorkout = (
  token: string,
  id: string | null,
  titlu: string,
  corp: string,
  vizibil: boolean
): Promise<string> =>
  rpc<string>('admin_save_weekly_workout', {
    p_token: token,
    p_id: id,
    p_titlu: titlu,
    p_corp: corp,
    p_vizibil: vizibil,
  });

/**
 * Programul, cu tot cu versiuni.
 *
 * Verifică forma rândurilor, spre deosebire de celelalte wrappere, fiindcă e
 * singurul RPC din migrarea programului care și-a păstrat SEMNĂTURA schimbându-și
 * forma răspunsului (`activ` → `vizibil`, plus `numar`). Toate celelalte s-au
 * redenumit sau au primit un parametru, deci o bază nemigrată le respinge din
 * PostgREST. Ăsta ar rezolva liniștit împotriva funcției vechi și ar întoarce
 * rânduri fără `numar`, iar ecranul ar randa un program greșit în loc să se
 * oprească — exact felul de eșec tăcut pe care fereastra dintre deploy și
 * migrarea manuală îl face posibil (vezi `MIGRATIONS.md`).
 */
export const listWeeklyWorkout = async (
  token: string,
  signal?: AbortSignal
): Promise<AdminWorkoutRow[]> => {
  const randuri = await rpc<AdminWorkoutRow[]>(
    'admin_list_weekly_workout',
    { p_token: token },
    signal
  );
  if (!Array.isArray(randuri)) throw new Error('weekly_workout_forma_veche');
  for (const r of randuri) {
    if (typeof r?.numar !== 'number' || typeof r?.vizibil !== 'boolean') {
      throw new Error('weekly_workout_forma_veche');
    }
  }
  return randuri;
};

/**
 * Mută o săptămână cu o poziție. Întoarce numărul ei de după mutare — la capăt
 * de program e același, fiindcă nu există vecin și asta nu e o eroare.
 *
 * Operație, nu listă întreagă: clipurile Instagram trimit lista fiindcă fac
 * parte dintr-un document-ciornă, dar aici nu există ciornă, iar o listă
 * întreagă ar fi transformat orice reîmprospătare ratată într-o rescriere a
 * programului.
 */
export const moveWeeklyWorkout = (
  token: string,
  id: string,
  directie: -1 | 1
): Promise<number> =>
  rpc<number>('admin_move_weekly_workout', { p_token: token, p_id: id, p_directie: directie });

/** Șterge o săptămână cu tot cu versiunile ei și compactează numerele. Definitiv. */
export const deleteWeeklyWorkout = (token: string, id: string): Promise<number> =>
  rpc<number>('admin_delete_weekly_workout', { p_token: token, p_id: id });

export const restoreWeeklyWorkout = (token: string, id: string): Promise<string> =>
  rpc<string>('admin_restore_weekly_workout', { p_token: token, p_id: id });

/**
 * Refuzul serverului, în cuvintele operatorului.
 *
 * Stă lângă wrapper, nu în componentă: codul `workout_empty` e o proprietate a
 * RPC-ului, iar oricine îl mai cheamă cândva are nevoie de aceeași traducere.
 */
export const mesajRefuzAntrenament = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('weekly_workout_forma_veche')) {
    return 'Baza de date n-are încă migrarea programului. Aplic-o înainte să folosești ecranul.';
  }
  if (text.includes('workout_empty')) {
    return 'Nu poți face vizibilă o săptămână fără text scris. Scrie antrenamentul, sau las-o ascunsă.';
  }
  if (text.includes('not_found')) {
    return 'Săptămâna aceea nu mai există. Reîncarcă pagina.';
  }
  if (text.includes('directie_invalida')) {
    return 'Nu am putut muta săptămâna. Reîncarcă pagina.';
  }
  // Neutru ca verb: aceeași traducere servește și mutarea, și ștergerea, nu doar
  // salvarea. „Nu am putut salva" pe o ștergere eșuată ar fi trimis omul să caute
  // problema în formular.
  return 'Nu a mers. Încearcă din nou.';
};
