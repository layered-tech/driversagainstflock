import React from 'react';

export interface BadgeProps {
    children?: React.ReactNode;
    /** @default "neutral" */
    tone?: 'brand' | 'alert' | 'warning' | 'info' | 'neutral' | 'ghost';
    icon?: React.ReactNode;
    /** @default "md" */
    size?: 'sm' | 'md';
    style?: React.CSSProperties;
}

/** Compact status/label token (e.g. "3 cameras", "Private", "Monitored"). */
export function Badge(props: BadgeProps): JSX.Element;
