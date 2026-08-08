import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={[styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
