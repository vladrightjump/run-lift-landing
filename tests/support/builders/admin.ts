import { SNAPSHOT_CONFIG } from '../../../src/shared/content/eventConfig';
import { participant } from './registrations';
import { dateSala } from './sala';

export function adminNavigationData(): Record<string, unknown> {
  return {
    admin_check_token: true,
    admin_list_registrations: [],
    admin_list_waitlist: [],
    admin_list_email_log: [],
    admin_list_events: [],
    admin_list_editions: [
      { editie: SNAPSHOT_CONFIG.number, participanti: 0, asteptare: 0, lansare: 0, prima: null, ultima: null, este_curenta: true },
    ],
    admin_list_launch_notifications: [],
    admin_list_email_templates: [],
    admin_get_event_config: [],
    admin_list_training_reels: [],
    admin_list_weekly_workout: [],
  };
}

export function adminControlsData(): Record<string, unknown> {
  return {
    ...adminNavigationData(),
    admin_list_registrations: [
      participant({ id: 'p1', nume: 'Ana Rusu', email: 'ana@exemplu.md', editie: SNAPSHOT_CONFIG.number }),
    ],
    admin_list_waitlist: [
      { id: 'w1', created_at: '2026-08-20T10:00:00Z', nume: 'Ion Ceban', telefon: '069000001', email: 'ion@exemplu.md', editie: SNAPSHOT_CONFIG.number },
    ],
    admin_list_editions: [
      { editie: SNAPSHOT_CONFIG.number, participanti: 1, asteptare: 1, lansare: 0, prima: null, ultima: null, este_curenta: true },
    ],
    // Două clipuri: lista ordonabilă arată selectorul de poziție doar de la două.
    admin_list_training_reels: [
      { id: 'c1', numar: 1, youtube: 'dQw4w9WgXcQ', caption: 'Marți seara, în parc', url: 'https://www.instagram.com/reel/AAAAA11111/', vizibil: true },
      { id: 'c2', numar: 2, youtube: 'Ab01234567x', caption: 'Circuit funcțional', url: 'https://www.instagram.com/reel/BBBBB22222/', vizibil: true },
    ],
    admin_sala_date: dateSala(),
    admin_login: null,
  };
}
