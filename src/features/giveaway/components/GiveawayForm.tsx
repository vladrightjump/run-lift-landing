import styles from './GiveawayForm.module.css';
import type { MouseEventHandler, Ref } from 'react';
import { momentComplet } from '../../../shared/lib/formatare';
import { useGiveawayForm } from '../hooks/useGiveawayForm';

type Props = {
  /** Sfârșitul înscrierilor, când e programat. */
  sfarsit: string | null;
  /** Serverul a refuzat trimiterea fiindcă giveaway-ul s-a închis între timp. */
  onInchis: () => void;
  bifaRegulament?: Ref<HTMLInputElement>;
  onRegulament?: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * Formularul de participare și cele două răspunsuri care îl înlocuiesc:
 * „ești înscris" și „ești deja înscris".
 *
 * Perioada și dublurile le decide serverul; formularul doar le arată. Capcana
 * anti-bot stă în `<form>`, ca la celelalte formulare publice (vezi
 * `tests/unit/antiBotSurfaces.test.tsx`).
 */
export const GiveawayForm = ({ sfarsit, onInchis, bifaRegulament, onRegulament }: Props) => {
  const { draft, setField, errors, state, eroare, submit, hpProps } = useGiveawayForm();

  if (state === 'success' || state === 'duplicate') {
    return (
      <div className={styles['gw-result']} data-css="gw-result" role="status">
        <span className={styles['gw-result-mark']} data-css="gw-result-mark" aria-hidden="true">✓</span>
        {state === 'success' ? (
          <>
            <h2>Ești în giveaway!</h2>
            <p>
              Am primit participarea ta. Câștigătorul e ales după{' '}
              {sfarsit ? momentComplet(sfarsit) : 'închiderea înscrierilor'} și e anunțat pe pagina noastră de Instagram.
            </p>
          </>
        ) : (
          <>
            <h2>Ești deja în giveaway</h2>
            <p>
              Am găsit deja o participare cu aceste date. O persoană participă o singură dată, deci nu mai
              ai nimic de făcut.
            </p>
          </>
        )}
        <a className={styles['gw-rules-link']} href="#regulament" aria-haspopup="dialog" onClick={onRegulament}>
          Citește regulamentul
        </a>
      </div>
    );
  }

  const clasaCamp = (gresit: boolean | undefined) => styles['gw-field'] + (gresit ? ' ' + styles.invalid : '');

  return (
    <form
      className={styles['gw-form']}
      data-css="gw-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit().then((rezultat) => {
          if (rezultat === 'closed') onInchis();
        });
      }}
    >
      {/* Capcană anti-bot — invizibilă; verificată pe server. */}
      <input type="text" {...hpProps} />

      <label className={clasaCamp(errors.nume)} data-css="gw-field">
        <span>Nume și prenume</span>
        <input
          type="text"
          placeholder="Ana Popescu"
          autoComplete="name"
          aria-invalid={errors.nume ? true : undefined}
          value={draft.nume}
          onChange={(e) => setField('nume', e.target.value)}
        />
      </label>
      <label className={clasaCamp(errors.telefon)} data-css="gw-field">
        <span>Telefon</span>
        <input
          type="tel"
          placeholder="069 123 456"
          autoComplete="tel"
          aria-invalid={errors.telefon ? true : undefined}
          value={draft.telefon}
          onChange={(e) => setField('telefon', e.target.value)}
        />
      </label>
      <label className={clasaCamp(errors.email)} data-css="gw-field">
        <span>Email</span>
        <input
          type="email"
          placeholder="email@exemplu.md"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          value={draft.email}
          onChange={(e) => setField('email', e.target.value)}
        />
      </label>
      <label className={clasaCamp(errors.instagram)} data-css="gw-field">
        <span>Instagram</span>
        <input
          type="text"
          placeholder="@contul.tău"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.instagram ? true : undefined}
          value={draft.instagram}
          onChange={(e) => setField('instagram', e.target.value)}
        />
      </label>

      <label
        className={styles['gw-check'] + (errors.acordRegulament ? ' ' + styles.invalid : '')}
        data-css="gw-check"
      >
        <input
          type="checkbox"
          ref={bifaRegulament}
          checked={draft.acordRegulament}
          aria-invalid={errors.acordRegulament ? true : undefined}
          onChange={(e) => setField('acordRegulament', e.target.checked)}
        />
        <span>
          Am citit și accept{' '}
          <a className={styles['gw-rules-link']} href="#regulament" aria-haspopup="dialog" onClick={onRegulament}>
            regulamentul
          </a>.
        </span>
      </label>
      <label className={styles['gw-check']} data-css="gw-check">
        <input
          type="checkbox"
          checked={draft.acordContact}
          onChange={(e) => setField('acordContact', e.target.checked)}
        />
        <span>Vreau să primesc de la Run + Lift vești despre evenimente și antrenamente. Opțional.</span>
      </label>

      {eroare && (
        <p className={styles['gw-error']} data-css="gw-error" role="alert">
          {eroare}
        </p>
      )}

      <button type="submit" className={styles['gw-submit']} data-css="gw-submit" disabled={state === 'loading'}>
        {state === 'loading' ? 'Se trimite…' : 'Intră în giveaway'}
      </button>
    </form>
  );
};
