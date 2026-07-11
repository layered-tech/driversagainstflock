import React from 'react';

export interface ChipProps {
    children?: React.ReactNode;
    selected?: boolean;
    icon?: React.ReactNode;
    /** @default "glass" */
    tone?: 'glass' | 'light';
    onClick?: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
}

/** Selectable filter / quick-action chip — selected = Signal Green fill. */
export function Chip(props: ChipProps): JSX.Element;
