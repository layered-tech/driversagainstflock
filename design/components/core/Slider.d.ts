import React from 'react';

export interface SliderProps {
    /** Controlled value. Omit for uncontrolled (see defaultValue). */
    value?: number;
    /** Initial value when uncontrolled. @default 0 */
    defaultValue?: number;
    /** @default 0 */
    min?: number;
    /** @default 100 */
    max?: number;
    /** @default 1 */
    step?: number;
    onChange?: (value: number) => void;
    disabled?: boolean;
    /** Caption shown above the track. */
    label?: string;
    /** Show the numeric readout (top-right). @default false */
    showValue?: boolean;
    /** Format the readout, e.g. (v) => `${v} mi`. */
    formatValue?: (value: number) => string;
    style?: React.CSSProperties;
}

/**
 * Continuous value selector — white knob on a brand-filled track.
 * Click, drag, or use arrow / PageUp·Down / Home / End keys.
 */
export function Slider(props: SliderProps): JSX.Element;
