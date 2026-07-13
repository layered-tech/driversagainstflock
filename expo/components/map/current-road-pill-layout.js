import { getFollowCameraPadding } from './follow-camera-padding.js';

export const AUTO_PLAY_DRIVING_LOCATION_FOLLOW_VISIBLE_Y_RATIO = 0.85;
export const AUTO_PLAY_LOCATION_PUCK_HEIGHT = 50;
export const CURRENT_ROAD_PILL_GAP_FROM_LOCATION_PUCK = 4;
export const MOBILE_DRIVING_LOCATION_FOLLOW_Y_RATIO = 0.75;
export const MOBILE_LOCATION_PUCK_HEIGHT = 80;

const MOBILE_LOCATION_FOLLOW_MAX_TOP_PADDING_RATIO = 0.95;

function getNonNegativeNumber(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

/**
 * Resolves the phone driving puck's screen-space anchor from the same follow
 * viewport inputs used by the camera. The destination reserve keeps it clear
 * of the bottom destination surface when one is present.
 */
export function getMobileDrivingLocationAnchorY({
    bottomInset,
    followViewportBottomOffset,
    viewportHeight,
}) {
    const resolvedViewportHeight = getNonNegativeNumber(viewportHeight);

    if (!resolvedViewportHeight) {
        return null;
    }

    const cameraPadding = getFollowCameraPadding({
        followViewportBottomOffset,
        followViewportYRatio: MOBILE_DRIVING_LOCATION_FOLLOW_Y_RATIO,
        maxTopPaddingRatio: MOBILE_LOCATION_FOLLOW_MAX_TOP_PADDING_RATIO,
        viewportHeight: resolvedViewportHeight,
        viewportInsets: {
            paddingBottom: getNonNegativeNumber(bottomInset),
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
        },
    });

    return (
        (resolvedViewportHeight +
            cameraPadding.paddingTop -
            cameraPadding.paddingBottom) /
        2
    );
}

/**
 * Places the road context immediately below the centered location puck.
 */
export function getCurrentRoadPillTop({ locationAnchorY, locationPuckHeight }) {
    const resolvedLocationAnchorY = Number(locationAnchorY);

    if (!Number.isFinite(resolvedLocationAnchorY)) {
        return null;
    }

    return Math.round(
        Math.max(0, resolvedLocationAnchorY) +
            getNonNegativeNumber(locationPuckHeight) / 2 +
            CURRENT_ROAD_PILL_GAP_FROM_LOCATION_PUCK,
    );
}

/**
 * Road context remains useful while route guidance is active, so only the
 * presence of readable road text controls the pill's visibility.
 */
export function shouldShowCurrentRoadPill({ roadText }) {
    return typeof roadText === 'string' && Boolean(roadText.trim());
}
