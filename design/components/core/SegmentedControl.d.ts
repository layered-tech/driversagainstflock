import React from 'react';

export interface SegmentOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

export interface SegmentedControlProps {
    options: SegmentOption[];
    value: string;
    onChange?: (value: string) => void;
    /** @default "glass" */
    tone?: 'glass' | 'light';
    style?: React.CSSProperties;
}

/** Sliding segmented switch for exclusive views (Fastest / Private, map layers). */
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
