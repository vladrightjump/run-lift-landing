import { GOOGLE_FORM } from './config';
import type { FormData } from './validation';

/**
 * POST către Google Forms `formResponse` endpoint.
 * Folosește `mode: 'no-cors'` — Google acceptă cererea, dar noi nu putem
 * citi răspunsul. Dacă promisiunea se rezolvă, presupunem că a mers.
 */
export const submitToGoogleForm = (data: FormData): Promise<Response> => {
  const url = `https://docs.google.com/forms/d/e/${GOOGLE_FORM.formId}/formResponse`;
  const body = new URLSearchParams();
  body.append(`entry.${GOOGLE_FORM.entries.nume}`, data.nume);
  body.append(`entry.${GOOGLE_FORM.entries.telefon}`, data.telefon);
  body.append(`entry.${GOOGLE_FORM.entries.email}`, data.email);
  if (data.echipa) {
    body.append(`entry.${GOOGLE_FORM.entries.echipa}`, data.echipa);
  }
  body.append(`entry.${GOOGLE_FORM.entries.acord}`, GOOGLE_FORM.acordValue);

  return fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
};
