import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Modal dialog & confirm alert" viewport="700x520"
 */
export interface DialogProps {
  /** @default true */
  open?: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  /** Body content below the description. */
  children?: React.ReactNode;
  /** Right-aligned action row (usually Buttons). */
  footer?: React.ReactNode;
  /** Icon name — renders a tinted chip above the title. */
  icon?: string;
  /** Chip tone. @default "brand" */
  tone?: 'brand' | 'alert' | 'warning' | 'info';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Scrim click closes + shows close button. @default true */
  dismissable?: boolean;
  style?: React.CSSProperties;
}

export interface AlertDialogProps {
  /** @default true */
  open?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  title?: string;
  description?: string;
  /** @default "Confirm" */
  confirmLabel?: string;
  /** @default "Cancel" */
  cancelLabel?: string;
  /** Red confirm + alert icon for irreversible actions. @default false */
  destructive?: boolean;
  icon?: string;
  style?: React.CSSProperties;
}

/**
 * Modal surface for focused tasks — blurred scrim, raised panel, optional
 * tinted icon, and a right-aligned footer.
 */
export function Dialog(props: DialogProps): JSX.Element | null;

/** Confirmation modal — not scrim-dismissable; Cancel + Confirm. */
export function AlertDialog(props: AlertDialogProps): JSX.Element;
