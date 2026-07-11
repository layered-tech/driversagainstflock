import React from 'react';

/**
 * @startingPoint section="Foundations" subtitle="Lucide icon primitive & set" viewport="700x360"
 */
export interface IconProps {
  /** Icon name (Lucide kebab-case), e.g. "search", "shield-check", "camera". */
  name: string;
  /** Pixel size (width = height). */
  size?: number;
  /** Stroke width on the 24-grid. */
  stroke?: number;
  /** Stroke color (defaults to currentColor so it inherits text color). */
  color?: string;
  style?: React.CSSProperties;
  /** Accessible label; when set the icon is exposed to AT. */
  title?: string;
}

/** The single Lucide-based icon primitive used across DAF. */
export function Icon(props: IconProps): JSX.Element;

/** Icon names available in this build. */
export const ICON_NAMES: string[];
