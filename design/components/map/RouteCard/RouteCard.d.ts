import React from 'react';

/**
 * @startingPoint section="Map" subtitle="Fastest vs Private route options" viewport="700x260"
 */
export interface RouteCardProps {
  /** @default "fast" */
  kind?: 'fast' | 'private';
  /** Travel time, e.g. "24 min". */
  eta?: string;
  /** Arrival clock, e.g. "arrive 6:12". */
  arrival?: string;
  /** Distance, e.g. "12.4 mi". */
  distance?: string;
  /** Number of ALPR cameras on this route. */
  cameras?: number;
  selected?: boolean;
  /** Show the "Pick" recommendation chip. */
  recommended?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Selectable route option for the comparison sheet. Fastest vs Private are
 * distinguished by icon, line pattern, AND label — not color alone.
 * @startingPoint section="Map" subtitle="Fastest vs Private route options" viewport="700x260"
 */
export function RouteCard(props: RouteCardProps): JSX.Element;
