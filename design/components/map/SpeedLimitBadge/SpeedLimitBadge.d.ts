import React from 'react';

/**
 * @startingPoint section="Map" subtitle="Posted limit + live speed sign" viewport="700x260"
 */
export interface SpeedLimitBadgeProps {
  /** Posted speed limit shown on the white sign. @default 35 */
  limit?: number | string;
  /** Current driving speed. When set, renders the bottom-corner read-out — gray at/under the limit, black when over. */
  current?: number;
  /** Sign size: a named preset (`"sm"` 44 / `"md"` 58 / `"lg"` 80) or a raw px width. @default "md" */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Units label under the limit number. @default "mph" */
  unit?: string;
  style?: React.CSSProperties;
}

/**
 * DAF SpeedLimitBadge — a real-world white speed-limit sign (black border,
 * stacked "SPEED LIMIT", big tabular numeral) with an optional current-speed
 * read-out tucked into the bottom corner: a calm gray at or under the posted
 * limit, hardening to black when you're over.
 * Theme-independent: the sign stays white in light and dark.
 * @startingPoint section="Map" subtitle="Posted limit + live speed sign" viewport="700x260"
 */
export function SpeedLimitBadge(props: SpeedLimitBadgeProps): JSX.Element;
