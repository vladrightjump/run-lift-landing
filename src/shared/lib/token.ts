/**
 * Tokenul din linkurile trimise pe email (`?token=`): confirmare, dezabonare,
 * renunțare. E un UUID v4; ce nu arată așa nu ajunge la server.
 */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esteTokenValid = (token: string): boolean => TOKEN_RE.test(token);

/** Tokenul din adresa curentă, sau șir gol. */
export const tokenDinAdresa = (): string => new URLSearchParams(window.location.search).get('token') ?? '';
