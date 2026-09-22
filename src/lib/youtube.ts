/**
 * Linkul lipit din YouTube → identificatorul clipului.
 *
 * De ce există: „Copiază linkul" dă forme diferite după unde apeși — aplicația
 * de telefon dă `youtu.be/<id>`, pagina de Shorts dă `youtube.com/shorts/<id>`,
 * iar butonul de partajare de pe desktop dă `watch?v=<id>`. Toate cu coadă de
 * parametri. Organizatorul n-are de ce să știe care bucată contează.
 *
 * Funcție pură, ca `curataUrl` din ecranul de clipuri: primește text lipit,
 * întoarce identificatorul sau șirul gol. Nu aruncă — un lipit greșit e o stare
 * normală a unui formular, nu o eroare.
 */

/**
 * Forma identificatorului YouTube: exact 11 caractere din alfabetul base64url.
 * Aceeași formă ca `training_reels_youtube_ok` din baza de date, care rămâne
 * autoritatea.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Căile care poartă identificatorul în segmentul de după ele.
 *
 * `live` și `embed` sunt aici fiindcă un link copiat dintr-o pagină deschisă
 * poate veni așa, iar identificatorul din ele e același lucru.
 */
const CAI = /\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;

/** `youtu.be/<id>` — linkul scurt, cel mai des lipit de pe telefon. */
const SCURT = /^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/i;

/** Gazdele de la care acceptăm un link. Altceva nu e o scăpare de formatare. */
const GAZDE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;

/**
 * Identificatorul din orice formă publicată de YouTube, sau `''`.
 *
 * Un identificator lipit singur trece ca atare: e ce tipărește funcția asta,
 * deci trebuie să se accepte pe sine.
 */
export const idYouTube = (brut: string): string => {
  const text = brut.trim();
  if (text === '') return '';

  if (ID.test(text)) return text;

  const scurt = SCURT.exec(text);
  if (scurt) return scurt[1];

  let adresa: URL;
  try {
    adresa = new URL(text);
  } catch {
    return '';
  }

  if (!GAZDE.test(adresa.hostname)) return '';

  // `watch?v=<id>` — forma de pe desktop.
  const v = adresa.searchParams.get('v');
  if (v && ID.test(v)) return v;

  const cale = CAI.exec(adresa.pathname);
  return cale ? cale[1] : '';
};

/** Are textul forma unui identificator? Pentru gărzile care nu normalizează. */
export const esteIdYouTube = (text: string): boolean => ID.test(text);

/** Linkul public al unui clip, pentru legătura „deschide pe YouTube". */
export const linkYouTube = (id: string): string => `https://www.youtube.com/shorts/${id}`;

/**
 * Sursa `iframe`-ului pentru un card care redă.
 *
 * `youtube-nocookie.com` în loc de `youtube.com`: aceeași redare, fără cookie-ul
 * de urmărire până la o interacțiune reală. E și originea din CSP.
 *
 * `loop` are nevoie de `playlist` cu ACELAȘI identificator — fără el, parametrul
 * e ignorat și clipul se oprește după o singură rulare.
 *
 * `controls` NU se pune pe 0: termenii YouTube cer ca butoanele și marca
 * playerului să rămână vizibile. Se retrag singure în timpul redării.
 */
export const sursaIncorporare = (id: string): string =>
  `https://www.youtube-nocookie.com/embed/${id}?` +
  new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: id,
    playsinline: '1',
    rel: '0',
  }).toString();

/**
 * Posterul vertical al unui clip, pentru cardurile care nu redau.
 *
 * `oar2.jpg` e miniatura pe care YouTube o generează pentru Shorts: 1080×1920,
 * exact forma cardului, ~100KB. Nu e documentată, deci nu ne bazăm doar pe ea —
 * vezi `posterClipRezerva`.
 */
export const posterClip = (id: string): string => `https://i.ytimg.com/vi/${id}/oar2.jpg`;

/**
 * Rezerva, dacă `oar2.jpg` lipsește. `hqdefault.jpg` există pentru orice clip:
 * e 4:3, dar pentru un Short cadrul vertical stă centrat între bare negre, iar
 * `object-fit: cover` pe un card 9:16 taie exact barele. Mai puțin clară, nu
 * greșită.
 */
export const posterClipRezerva = (id: string): string =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
