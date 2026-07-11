import React from 'react';

export interface InputProps {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    leadingIcon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
    /** Surface it sits on. @default "glass" */
    tone?: 'glass' | 'light';
    /** @default "md" */
    size?: 'md' | 'lg';
    disabled?: boolean;
    style?: React.CSSProperties;
}

/** Pill text field for search & forms — frosted on map, solid on light pages. */
export function Input(props: InputProps): JSX.Element;
