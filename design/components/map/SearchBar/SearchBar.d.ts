import React from 'react';

export interface SearchBarProps {
    /** @default "Where to?" */
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onFocus?: (e: React.FocusEvent) => void;
    /** Hamburger handler. When set, renders the leading menu button. */
    onMenu?: (e: React.MouseEvent) => void;
    /** Clear handler. When set, renders the ✕ button while the input has text. */
    onClear?: (e: React.MouseEvent) => void;
    /** Voice handler. When set, renders a mic button before the directions divider. */
    onVoice?: (e: React.MouseEvent) => void;
    /** Directions handler. When set, renders the divider-separated directions button. */
    onDirections?: (e: React.MouseEvent) => void;
    /** Leading glyph/icon. Defaults to a Lucide search icon. */
    leading?: React.ReactNode;
    /** Extra slot injected before the directions button (e.g. avatar, mic). */
    trailing?: React.ReactNode;
    readOnly?: boolean;
    style?: React.CSSProperties;
}

/** Compact, minimal floating "Where to?" search pill for the top of the map. */
export function SearchBar(props: SearchBarProps): JSX.Element;
