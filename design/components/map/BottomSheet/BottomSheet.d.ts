import React from 'react';

/**
 * @startingPoint section="Map" subtitle="Bottom sheet container with grabber" viewport="700x340"
 */
export interface BottomSheetProps {
  children?: React.ReactNode;
  /** Sheet heading (display font). */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Trailing header control, e.g. a close IconButton. */
  trailing?: React.ReactNode;
  /** Show the drag grabber. @default true */
  grabber?: boolean;
  style?: React.CSSProperties;
}

/**
 * Frosted sheet rising from the bottom edge — holds route comparisons,
 * place details, and marker info over the map.
 * @startingPoint section="Map" subtitle="Bottom sheet container with grabber" viewport="700x340"
 */
export function BottomSheet(props: BottomSheetProps): JSX.Element;
