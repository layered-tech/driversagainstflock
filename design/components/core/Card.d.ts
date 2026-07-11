import React from 'react';

export interface CardProps {
    children?: React.ReactNode;
    /** @default "light" */
    tone?: 'light' | 'glass';
    /** CSS padding value. @default "var(--space-6)" */
    padding?: string;
    /** Lift on hover for clickable cards. */
    interactive?: boolean;
    style?: React.CSSProperties;
    onClick?: (e: React.MouseEvent) => void;
}

/** Content container — white on light pages, frosted glass over the map. */
export function Card(props: CardProps): JSX.Element;
