import { adminNavigationData } from './admin';
import { dateSala, membruSala } from './sala';

export const salaBrowser = (now = new Date()): ReturnType<typeof dateSala> => {
  const plus = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const base = dateSala();
  return {
    ...base,
    azi: plus(0),
    config: { ...base.config!, location: 'Parcul Dumitru Râșcanu' },
    membri: ['Ana Rusu', 'Ion Ceban', 'Maria Lungu', 'Roma Admin', 'Dan Fără Cont'].map((name, i) =>
      membruSala(`m${i}`, { full_name: name, is_admin: i === 3, telegram_user_id: i === 4 ? null : 1000 + i,
        telegram_membership: i === 4 ? 'unknown' : 'in_group' })),
    antrenamente: [
      { id: 's2', session_date: plus(1), starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'scheduled', poll_sent: true },
      { id: 's1', session_date: plus(-2), starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'done', poll_sent: true },
    ],
    raspunsuri: [
      { session_id: 's2', member_id: 'm0', response: 'yes', is_first_training: false, responded_at: now.toISOString() },
      { session_id: 's2', member_id: 'm1', response: 'no', is_first_training: false, responded_at: now.toISOString() },
      { session_id: 's1', member_id: 'm2', response: 'yes', is_first_training: false, responded_at: now.toISOString() },
    ],
  };
};

export const salaBrowserResponses = (sala: ReturnType<typeof salaBrowser>) => ({
  ...adminNavigationData(),
  admin_sala_date: sala,
  admin_sala_rezumat: {
    azi: sala.azi, pornit: true, poll_days: [1, 3], poll_time: '12:00',
    urmatorul: { ...sala.antrenamente[0], vin: 1, nu_vin: 1 },
  },
});
