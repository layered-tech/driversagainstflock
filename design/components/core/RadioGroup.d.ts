import React from 'react';

export interface RadioOption {
    value: string;
    label: string;
    /** Secondary line under the label. */
    description?: string;
    disabled?: boolean;
}

export interface RadioGroupProps {
    options: RadioOption[];
    /** Selected option value. */
    value?: string;
    onChange?: (value: string) => void;
    /** @default "vertical" */
    orientation?: 'vertical' | 'horizontal';
    disabled?: boolean;
    style?: React.CSSProperties;
}

/**
 * Single-select from a small set. Brand ring + dot on the selected option,
 * with roving arrow-key navigation.
 */
export function RadioGroup(props: RadioGroupProps): JSX.Element;
