import React from 'react';

/**
 * @startingPoint section="Map" subtitle="Turn-by-turn instruction banner" viewport="700x160"
 */
export interface NavBannerProps {
  /** @default "right" */
  maneuver?: 'left' | 'right' | 'straight' | 'sharp-left' | 'sharp-right' | 'uturn' | 'merge' | 'exit' | 'arrive';
  /** Distance to the maneuver, e.g. "500 ft". */
  distance?: string;
  /** Spoken instruction text. */
  instruction?: string;
  /** Optional "then …" next-step hint. */
  then?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Turn-by-turn instruction banner for active navigation.
 * @startingPoint section="Map" subtitle="Turn-by-turn instruction banner" viewport="700x130"
 */
export function NavBanner(props: NavBannerProps): JSX.Element;
