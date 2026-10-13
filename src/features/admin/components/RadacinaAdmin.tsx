import styles from './RadacinaAdmin.module.css';
import { useEffect, type ReactNode } from 'react';

/**
 * Rădăcina temei „Panoul" (KTD2 din planul redesignului adminului).
 *
 * Jetoanele adminului stau pe `.admin-app`, iar clasa de pe `<html>` vopsește
 * și fundalul paginii — fără ea, derularea peste margine ar arăta fundalul
 * închis al paginii publice sub un admin luminos. Pagina publică nu poartă
 * niciuna dintre clase, deci rămâne neschimbată.
 */
export const RadacinaAdmin = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('admin-pagina');
    return () => html.classList.remove('admin-pagina');
  }, []);
  return <div className={styles['admin-app']} data-css="admin-app">{children}</div>;
};
