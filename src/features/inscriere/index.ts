/** API-ul public al funcționalității `/inscriere`: ruta. Restul folderului e intern. */
export { rutaInscriere } from './route';
export { useLaunchForm } from './hooks/useLaunchForm';
export { useStats } from './hooks/useStats';
export { useRegistration } from './hooks/useRegistration';
export { RegistrationSection } from './components/RegistrationSection';
export { RegistrationOverlay } from './components/RegistrationOverlay';
export type { LaunchDraft } from './lib/launchForm';
export { isDuplicateError } from './data/api';
export { sendConfirmationEmail } from './data/api';
export type { PublicStats } from './data/api';
