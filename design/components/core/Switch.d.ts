import React from 'react';

export interface SwitchProps {
    checked?: boolean;
    onChange?: (next: boolean) => void;
    disabled?: boolean;
    /** Optional trailing label. */
    label?: string;
    style?: React.CSSProperties;
}

/** Binary toggle for drive preferences — on = Signal Green. */
export function Switch(props: SwitchProps): JSX.Element;
