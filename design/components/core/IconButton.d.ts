import React from 'react';

export interface IconButtonProps {
    children?: React.ReactNode;
    /** Accessible label (required). */
    label: string;
    /** @default "glass" */
    variant?: 'glass' | 'solid' | 'brand' | 'plain';
    /** @default "md" */
    size?: 'sm' | 'md' | 'lg';
    /** Toggled / selected state — adopts brand outline. */
    active?: boolean;
    disabled?: boolean;
    style?: React.CSSProperties;
    onClick?: (e: React.MouseEvent) => void;
}

/** Round glass control for floating map actions (recenter, layers, mute). */
export function IconButton(props: IconButtonProps): JSX.Element;
