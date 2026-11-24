import {
  FEELINGS, TOPICS, feedbackReport, profilesReport,
  type FeedbackReport, type ProfilesReport,
} from './lib/member-form-data.js';
import { organizerIds } from './lib/organizers.js';
import { sendFormText } from './member-forms.js';

export const FORM_ORGANIZER_COMMANDS = [
  { command: 'feedback_grup', description: 'Pregătește invitația de feedback și profil' },
  { command: 'feedback_rezultate', description: 'Vezi răspunsurile de feedback fără nume' },
  { command: 'profiluri', description: 'Vezi profilurile și obiectivele trimise' },
];

const PAGE_SIZE = 5;

function pageLine(page: number, items: number, command: string): string {
  const pages = Math.max(1, Math.ceil(items / PAGE_SIZE));
  return 'Pagina ' + page + ' din ' + pages + (page < pages ? ' · Următoarea: /' + command + ' ' + (page + 1) : '');
}

function feedbackText(report: FeedbackReport, page: number): string {
  const lines = [
    'Feedback · ' + report.total + ' răspunsuri',
    '',
    'Cum se simt membrii',
    ...FEELINGS.map((label, i) => label + ': ' + report.feelings[i]),
    '',
    'Ce vor mai des',
    ...Object.values(TOPICS).map((label, i) => label + ': ' + report.topics[i]),
    '',
    'Comentarii fără nume · ' + report.comment_count,
    ...report.comments.map(comment => '• ' + comment),
  ];
  if (report.comment_count > PAGE_SIZE) lines.push('', pageLine(page, report.comment_count, 'feedback_rezultate'));
  return lines.join('\n');
}

function profilesText(report: ProfilesReport, page: number): string {
  const lines = ['Profiluri trimise · ' + report.total];
  for (const profile of report.profiles) {
    lines.push(
      '',
      profile.display_name + (profile.matched ? ' · Legat' : ' · De legat în Membri (ID Telegram ' + profile.telegram_user_id + ')'),
      'Obiectiv: ' + (profile.training_goal ?? '—'),
    );
  }
  if (report.total > PAGE_SIZE) lines.push('', pageLine(page, report.total, 'profiluri'));
  return lines.join('\n');
}

export async function handleFormReport(chatId: number, userId: number, text: string): Promise<boolean> {
  const command = /^\/(feedback_rezultate|profiluri)(?:@\w+)?(?:\s+(.*))?$/i.exec(text);
  if (!command || chatId !== userId) return false;
  if (!organizerIds().includes(userId)) return true;
  const name = command[1].toLowerCase();
  const pageText = command[2] ?? '1';
  const page = Number(pageText);
  if (!/^[1-9]\d{0,5}$/.test(pageText)) {
    await sendFormText(chatId, 'Folosește /' + name + ' sau /' + name + ' 2 pentru pagina următoare.');
    return true;
  }
  try {
    const result = name === 'profiluri'
      ? profilesText(await profilesReport(page), page)
      : feedbackText(await feedbackReport(page), page);
    await sendFormText(chatId, result);
  } catch {
    console.error('[member-forms] organizer report unavailable');
    await sendFormText(chatId, 'Raportul e indisponibil momentan. Încearcă din nou mai târziu.').catch(() => {});
  }
  return true;
}
