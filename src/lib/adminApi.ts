import { SUPABASE } from './config';
import { SubmitHttpError } from './supabase';

/**
 * API-ul backoffice-ului — totul trece prin RPC-uri SECURITY DEFINER care
 * validează un token de sesiune (tabelele `admin_users`/`admin_sessions`
 * au RLS fără politici, deci cheia publică singură nu poate citi nimic).
 */

const TOKEN_KEY = 'runlift_admin_token';

export type AdminRegistration = {
  id: string;
  created_at: string;
  nume: string;
  telefon: string;
  email: string;
  echipa: string;
};

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const storeToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Privat mode fără localStorage — sesiunea ține doar cât pagina.
  }
};

export const clearStoredToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // idem
  }
};

/** Sesiune invalidă/expirată — semnal pentru revenirea la login. */
export class InvalidTokenError extends Error {
  constructor() {
    super('invalid_token');
  }
}

const rpc = async <T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (body.includes('invalid_token')) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, body);
  }
  return (await res.json().catch(() => undefined)) as T;
};

/** Autentificare — întoarce token-ul de sesiune sau null la credențiale greșite. */
export const adminLogin = (username: string, password: string): Promise<string | null> =>
  rpc<string | null>('admin_login', { p_username: username, p_password: password });

export const checkToken = (token: string, signal?: AbortSignal): Promise<boolean> =>
  rpc<boolean>('admin_check_token', { p_token: token }, signal);

export const listRegistrations = (token: string, signal?: AbortSignal): Promise<AdminRegistration[]> =>
  rpc<AdminRegistration[]>('admin_list_registrations', { p_token: token }, signal);

export type AdminLaunchSignup = {
  id: string;
  created_at: string;
  nume: string;
  prenume: string;
  email: string;
  telefon: string;
};

/** Înscrierile la „Anunță-mă la lansare" (tabelul launch_notifications). */
export const listLaunchNotifications = (
  token: string,
  signal?: AbortSignal
): Promise<AdminLaunchSignup[]> =>
  rpc<AdminLaunchSignup[]>('admin_list_launch_notifications', { p_token: token }, signal);

/** Adaugă o înscriere (acord = true implicit). Email duplicat => HTTP 409. */
export const addRegistration = (
  token: string,
  data: { nume: string; telefon: string; email: string }
): Promise<string> =>
  rpc<string>('admin_add_registration', {
    p_token: token,
    p_nume: data.nume,
    p_telefon: data.telefon,
    p_email: data.email,
  });

export const deleteRegistration = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_registration', { p_token: token, p_id: id });

export const adminLogout = (token: string): Promise<void> =>
  rpc<void>('admin_logout', { p_token: token });
