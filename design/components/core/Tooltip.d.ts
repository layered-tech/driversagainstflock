import React from 'react';

export interface TooltipProps {
    /** Bubble content (string or node). */
    content: React.ReactNode;
    /** @default "top" */
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** Hover-in delay in ms. @default 120 */
    delay?: number;
    /** The trigger element. */
    children?: React.ReactNode;
    style?: React.CSSProperties;
}

/**
 * Small inverse-surface bubble that explains an icon-only control on hover
 * or keyboard focus. Positions on `side` with a matching arrow.
 */
export function Tooltip(props: TooltipProps): JSX.Element;
