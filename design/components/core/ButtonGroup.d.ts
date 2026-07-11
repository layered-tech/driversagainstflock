import React from 'react';

export interface ButtonGroupProps {
    /** Two or more <Button> elements. */
    children?: React.ReactNode;
    /** Layout axis. @default "horizontal" */
    orientation?: 'horizontal' | 'vertical';
    /** Force a single size onto every segment (overrides each Button's own size). */
    size?: 'sm' | 'md' | 'lg';
    /** Stretch to fill the container; segments share space equally. @default false */
    fullWidth?: boolean;
    /** Joined segments (true) or evenly-spaced standalone pills (false). @default true */
    attached?: boolean;
    style?: React.CSSProperties;
}

/**
 * Joins a set of Buttons into one segmented control — rounded outer corners,
 * square inner corners, a shared hairline divider and a single elevation.
 */
export function ButtonGroup(props: ButtonGroupProps): JSX.Element;
