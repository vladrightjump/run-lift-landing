import { rpc } from '../../../../shared/lib/rpc';

/**
 * Cererile zonei Site: manetele cu efect imediat pe site (Coming Soon, ordinea
 * ecranului dintre ediții) și banda de clipuri. Ca restul backoffice-ului, trec
 * prin RPC-uri care validează tokenul de sesiune.
 */

/**
 * Comută ecranul de dinainte de lansare și mută țintele numărătorilor, cu efect
 * IMEDIAT pe site — fără ciornă și fără „Publică".
 *
 * De ce ocolește fluxul ciornă → publică: comutarea e o operație de un singur
 * gest, făcută de regulă sub presiune („anunțul iese acum"). Ciorna e potrivită
 * pentru o ediție întreagă, unde verificarea înainte merită pașii; aici e o
 * manetă. Serverul petice exact trei chei pe documentul publicat și îl
 * revalidează prin aceeași poartă ca publicarea, deci scurtătura e de pași, nu
 * de verificări.
 *
 * Rezultatul rămâne reversibil: peticul scrie un rând nou, deci apare în
 * „Versiuni anterioare".
 *
 * Refuzuri așteptate: `no_published`, `config_invalid: …`.
 */
export const setComingSoon = (
  token: string,
  show: boolean,
  launchAt: string,
  nextEditionAt: string
): Promise<string> =>
  rpc<string>('admin_set_coming_soon', {
    p_token: token,
    p_show: show,
    p_launch_at: launchAt,
    p_next_edition_at: nextEditionAt,
  });

/**
 * Ordinea de pe ecranul dintre ediții: `true` = „Primul tău antrenament cu noi"
 * deasupra cardului „Până atunci". Efect imediat, ca `setComingSoon`; site-ul o
 * citește prin `public_homepage()`.
 */
export const setHomepageOrder = (token: string, trialFirst: boolean): Promise<void> =>
  rpc<void>('admin_set_homepage_order', { p_token: token, p_trial_first: trialFirst });

/**
 * Un clip din bandă, așa cum îl vede backoffice-ul.
 *
 * Fără versionare, spre deosebire de program: nu există ciornă și nici „revino
 * la versiunea trecută" pentru o legendă. Un istoric aici ar fi fost ceremonie.
 */
export type AdminReelRow = {
  id: string;
  /** Poziția în bandă, 1…N. Poziție, nu identificator: mutarea renumerotează. */
  numar: number;
  /** Identificatorul clipului pe YouTube, nu un link și nu o cale. */
  youtube: string;
  caption: string;
  /** Postarea de pe Instagram, unde duce cardul. */
  url: string;
  vizibil: boolean;
};

/** Clipurile, în ordinea din bandă, inclusiv cele ascunse. */
export const listTrainingReels = (token: string, signal?: AbortSignal): Promise<AdminReelRow[]> =>
  rpc<AdminReelRow[]>('admin_list_training_reels', { p_token: token }, signal);

/**
 * Salvează un clip. Efect imediat pe site — nu trece prin ciornă.
 *
 * `id` null înseamnă „clip nou": serverul îi pune numărul următor, deci
 * organizatorul nu tastează și nu alege niciun număr.
 */
export const saveTrainingReel = (
  token: string,
  id: string | null,
  youtube: string,
  caption: string,
  url: string,
  vizibil: boolean
): Promise<string> =>
  rpc<string>('admin_save_training_reel', {
    p_token: token,
    p_id: id,
    p_youtube: youtube,
    p_caption: caption,
    p_url: url,
    p_vizibil: vizibil,
  });

/**
 * Mută un clip cu o poziție. Întoarce numărul lui de după mutare — la capăt de
 * bandă e același, fiindcă nu există vecin și asta nu e o eroare.
 */
export const moveTrainingReel = (token: string, id: string, directie: -1 | 1): Promise<number> =>
  rpc<number>('admin_move_training_reel', { p_token: token, p_id: id, p_directie: directie });

/**
 * Scoate un clip din bandă și compactează numerele. Clipul de pe YouTube nu se
 * atinge: scoaterea din bandă nu e o ștergere de pe gazdă.
 */
export const deleteTrainingReel = (token: string, id: string): Promise<number> =>
  rpc<number>('admin_delete_training_reel', { p_token: token, p_id: id });

/**
 * Refuzul serverului pentru clipuri, în cuvintele organizatorului.
 *
 * Constrângerile din DB sînt ultima linie, nu prima: formularul verifică deja
 * aceleași forme. Ce ajunge aici e ori o cale lipită greșit, ori un ecran rămas
 * în urmă — iar diferența contează pentru ce-i spui omului să facă.
 */
export const mesajRefuzClip = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('training_reels_youtube_ok')) {
    return 'Nu am recunoscut un clip YouTube în ce ai lipit. Apasă „Distribuie" pe clip și lipește linkul de acolo.';
  }
  if (text.includes('training_reels_url_ok')) {
    return 'Linkul trebuie să fie o adresă Instagram curată, fără „?" la coadă — ex. https://www.instagram.com/reel/ABC12345/';
  }
  if (text.includes('training_reels_caption_ok')) {
    return 'Legenda nu poate fi goală: ea e ce citește cineva care folosește un cititor de ecran.';
  }
  if (text.includes('training_reels_un_youtube')) {
    return 'Clipul ăsta e deja în bandă. Două carduri cu același clip sînt o greșeală de lipit.';
  }
  if (text.includes('not_found')) {
    return 'Clipul acela nu mai există. Reîncarcă pagina.';
  }
  if (text.includes('directie_invalida')) {
    return 'Nu am putut muta clipul. Reîncarcă pagina.';
  }
  return 'Nu a mers. Încearcă din nou.';
};
