/** API-ul public al funcționalității `/inscriere`: ruta. Restul folderului e intern. */
export { rutaInscriere } from './route';
export { useLaunchForm } from './hooks/useLaunchForm';
export { useStats } from './hooks/useStats';
export { useRegistration } from './hooks/useRegistration';
export { RegistrationSection } from './components/RegistrationSection';
export { RegistrationOverlay } from './components/RegistrationOverlay';
export type { LaunchDraft } from './lib/launchForm';
export { isDuplicateError, isBotRejectedError, postForm } from './data/api';
export type { AntiBot } from './data/api';
export { useAntiBot, antiBotErrorMessage, ANTIBOT_MESSAGES } from './lib/antiBot';
export { sendConfirmationEmail } from './data/api';
export type { PublicStats } from './data/api';
