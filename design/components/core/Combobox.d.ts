import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Autocomplete search field with results panel" viewport="700x360"
 */
export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line (e.g. street address). */
  sublabel?: string;
  /** Icon name from the DAF Icon set. @default "map-pin" */
  icon?: string;
  /** Trailing meta, e.g. "2.1 mi". */
  meta?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  onSelect?: (option: ComboboxOption) => void;
  /** Fires on every keystroke — use for async/remote results. */
  onChange?: (query: string) => void;
  /** @default "Search destinations" */
  placeholder?: string;
  /** @default "No matches" */
  emptyText?: string;
  /** Built-in substring filter. Set false when results are pre-filtered (async). @default true */
  filter?: boolean;
  /** @default "glass" */
  tone?: 'glass' | 'light';
  /** @default "md" */
  size?: 'md' | 'lg';
  /** Rows before the panel scrolls. @default 6 */
  maxVisible?: number;
  style?: React.CSSProperties;
}

/**
 * Autocomplete field powering destination search — glass field + floating
 * results panel with match highlighting and keyboard nav.
 * @startingPoint section="Core" subtitle="Autocomplete search field with results panel" viewport="700x360"
 */
export function Combobox(props: ComboboxProps): JSX.Element;
