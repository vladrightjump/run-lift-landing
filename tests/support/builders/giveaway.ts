import type {
  DateGiveaway,
  GiveawayAdmin,
  ParticipareGiveaway,
} from '../../../src/features/admin/zones/site/giveawayApi';

let contor = 0;

/** O participare, așa cum o întoarce `admin_giveaway_date`. */
export const participareGiveaway = (over: Partial<ParticipareGiveaway> = {}): ParticipareGiveaway => {
  contor += 1;
  return {
    id: `part-${contor}`,
    nume: `Participant ${contor}`,
    telefon: `0690000${String(contor).padStart(2, '0')}`,
    email: `om${contor}@exemplu.ro`,
    instagram: `cont.${contor}`,
    acord_contact: false,
    created_at: '2026-11-10T09:00:00Z',
    extrasa_la: null,
    inlocuita_la: null,
    ...over,
  };
};

/** Giveaway-ul afișat. Implicit: înscrieri închise, nimeni extras. */
const giveawayAdmin = (over: Partial<GiveawayAdmin> = {}): GiveawayAdmin => ({
  id: 'gw-1',
  slug: 'toamna',
  titlu: 'Giveaway de toamnă',
  starts_at: '2026-11-01T08:00:00Z',
  ends_at: '2026-11-30T18:00:00Z',
  stare: 'inchis',
  castigator: null,
  incheiat_la: null,
  total_participari: null,
  ...over,
});

/** Răspunsul întreg al `admin_giveaway_date`. */
export const dateGiveaway = (
  over: { giveaway?: Partial<GiveawayAdmin> | null; participari?: ParticipareGiveaway[]; giveaways?: DateGiveaway['giveaways'] } = {}
): DateGiveaway => {
  const giveaway = over.giveaway === null ? null : giveawayAdmin(over.giveaway);
  return {
    giveaways:
      over.giveaways ??
      (giveaway ? [{ id: giveaway.id, slug: giveaway.slug, titlu: giveaway.titlu, stare: giveaway.stare }] : []),
    giveaway,
    participari: over.participari ?? [],
  };
};
