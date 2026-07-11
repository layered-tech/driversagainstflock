import React from 'react';

export interface ToastProps {
    /** @default "info" */
    tone?: 'info' | 'success' | 'warning' | 'alert';
    title?: string;
    description?: string;
    /** Inline text action. */
    action?: { label: string; onClick: () => void };
    onDismiss?: () => void;
    /** Override the tone's default icon (name from the DAF Icon set). */
    icon?: string;
    style?: React.CSSProperties;
}

export interface ToastViewportProps {
    children?: React.ReactNode;
    /** @default "bottom-right" */
    placement?:
        | 'top-left'
        | 'top-center'
        | 'top-right'
        | 'bottom-left'
        | 'bottom-center'
        | 'bottom-right';
    style?: React.CSSProperties;
}

/**
 * Transient notification — frosted card, tinted status chip, optional
 * description + inline action + dismiss.
 */
export function Toast(props: ToastProps): JSX.Element;

/** Fixed-position stack for Toasts. Place once near the app root. */
export function ToastViewport(props: ToastViewportProps): JSX.Element;
