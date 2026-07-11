import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Pill buttons in every variant & size" viewport="700x270"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual emphasis. @default "primary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Primary action control for DAF — pill-shaped, touch-first, calm press feedback.
 * @startingPoint section="Core" subtitle="Pill buttons in every variant & size" viewport="700x270"
 */
export function Button(props: ButtonProps): JSX.Element;
