import styles from './Toast.module.css';
import type { ToastState } from '../lib/useToast';

type Props = {
  toast: ToastState;
  hiding: boolean;
};

export const Toast = ({ toast, hiding }: Props) => {
  const classes = [styles.toast];
  if (toast) classes.push(styles.show);
  if (toast?.kind === 'success') classes.push(styles.success);
  if (hiding) classes.push(styles.hide);

  return (
    <div id="toast" className={classes.join(' ')} role="status" aria-live="polite">
      <span className={styles.icon}>{toast?.kind === 'success' ? '✓' : '!'}</span>
      <span>{toast?.msg ?? ''}</span>
    </div>
  );
};
