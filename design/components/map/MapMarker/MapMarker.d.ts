import React from 'react';

/**
 * @startingPoint section="Map" subtitle="Marker family & states" viewport="700x320"
 */
export interface MapMarkerProps {
  /** @default "place" */
  variant?: 'user' | 'place' | 'destination' | 'alpr' | 'camera' | 'cluster' | 'monitored' | 'police' | 'police-hidden';
  /** Glyph rendered inside place / destination markers (overrides iconName). */
  icon?: React.ReactNode;
  /** DAF Icon name for place / destination markers, e.g. "coffee", "flag". */
  iconName?: string;
  /** Count shown inside a cluster. */
  count?: number;
  /** Direction in degrees (0 = up) — aims the ~40° cone of view: camera field of view, or user heading. */
  heading?: number;
  /** Enlarges + adds a focus ring. */
  selected?: boolean;
  /** Dim to ~45% for off-route / filtered-out markers. */
  inactive?: boolean;
  /** Optional caption pill under the marker. */
  label?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * The full DAF map marker family — user location, place & destination pins
 * (large centered glyph in the head), ALPR/camera as small glowing dots with a
 * large ~40° cone of view, surveillance clusters, monitored nodes, and
 * Waze-sourced police reports (blue shield badge; dashed ring = hidden police).
 * @startingPoint section="Map" subtitle="Marker family & states" viewport="700x320"
 */
export function MapMarker(props: MapMarkerProps): JSX.Element;
