import type { ToastState } from '../hooks/useToast';

type Props = {
  toast: ToastState;
  hiding: boolean;
};

export const Toast = ({ toast, hiding }: Props) => {
  const classes = ['toast'];
  if (toast) classes.push('show');
  if (toast?.kind === 'success') classes.push('success');
  if (hiding) classes.push('hide');

  return (
    <div id="toast" className={classes.join(' ')} role="status" aria-live="polite">
      <span className="icon">{toast?.kind === 'success' ? '✓' : '!'}</span>
      <span>{toast?.msg ?? ''}</span>
    </div>
  );
};
