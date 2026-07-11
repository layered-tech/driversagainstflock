import React from 'react';

export interface CheckboxProps {
    /** @default false */
    checked?: boolean;
    /** Mixed state — renders a dash instead of a check. @default false */
    indeterminate?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    /** Text beside the box. Omit for a bare checkbox. */
    label?: string;
    /** Secondary line under the label. */
    description?: string;
    /** @default "md" */
    size?: 'sm' | 'md';
    style?: React.CSSProperties;
}

/**
 * Multi-select / opt-in toggle. Brand fill + check when on; supports an
 * indeterminate (mixed) state and an optional label + description.
 */
export function Checkbox(props: CheckboxProps): JSX.Element;
