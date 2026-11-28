export const CURRENT_ROAD_PILL_BOTTOM_GAP = 10;
export const AUTO_PLAY_CURRENT_ROAD_PILL_PUCK_TARGET_GAP = 20;
export const MOBILE_CURRENT_ROAD_PILL_PUCK_TARGET_GAP = 38;

/**
 * Road context remains useful while route guidance is active, so only the
 * presence of readable road text controls the pill's visibility.
 */
export function shouldShowCurrentRoadPill({ roadText }) {
    return typeof roadText === 'string' && Boolean(roadText.trim());
}
