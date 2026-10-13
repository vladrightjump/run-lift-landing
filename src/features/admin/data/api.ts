import { rpc } from '../../../shared/lib/rpc';

/** Autentificare — întoarce token-ul de sesiune sau null la credențiale greșite. */
export const adminLogin = (username: string, password: string): Promise<string | null> =>
  rpc<string | null>('admin_login', { p_username: username, p_password: password });

export { getStoredToken, storeToken, clearStoredToken } from '../../../shared/lib/adminToken';

export const checkToken = (token: string, signal?: AbortSignal): Promise<boolean> =>
  rpc<boolean>('admin_check_token', { p_token: token }, signal);

export const adminLogout = (token: string): Promise<void> =>
  rpc<void>('admin_logout', { p_token: token });
