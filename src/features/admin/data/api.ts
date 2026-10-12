import { rpc } from '../../../shared/lib/rpc';

/** Autentificare — întoarce token-ul de sesiune sau null la credențiale greșite. */
export const adminLogin = (username: string, password: string): Promise<string | null> =>
  rpc<string | null>('admin_login', { p_username: username, p_password: password });
