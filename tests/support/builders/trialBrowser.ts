import { trialConfig, trialData } from './trial';
import { dateSala } from './sala';
import { salaBrowserResponses } from './salaBrowser';

export const trialBrowserConfig = () => trialConfig({
  message_texts: {}, enabled: true, bot_username: 'ParkTrialBot', welcome_text: 'Bine ai venit!',
  trial_conditions: 'Vino cu 10 minute înainte.', trial_price: '100 MDL', bring_text: 'Apă și prosop.',
  continuation_conditions: 'Discutăm abonamentul.', organizer_telegram_id: 123,
  contact_text: 'Scrie-ne pe Instagram.', permissions_verified_at: new Date().toISOString(),
});

export const trialBrowserData = (attended: boolean, config = trialBrowserConfig()) => trialData({
  config,
  prospects: [{ id: 'p1', full_name: 'Ana Rusu', telegram_user_id: 456, telegram_username: 'ana', source: 'home', stage: attended ? 'attended' : 'awaiting_attendance', dm_enabled: true }],
  bookings: [{ id: 'b1', prospect_id: 'p1', version: 1, status: attended ? 'attended' : 'awaiting_attendance', session_start: '2026-10-08T03:30:00Z', session_location: 'Parcul Dumitru Râșcanu', attendance_at: attended ? new Date().toISOString() : null, continuation: null }],
  organizers: [{ id: 'a1', full_name: 'Vlad', telegram_user_id: 123 }],
});

export const trialBrowserAdminResponses = () => ({
  ...salaBrowserResponses(dateSala({ azi: '2026-10-08', config: null, membri: [], antrenamente: [], raspunsuri: [] })),
  admin_sala_rezumat: null,
});
