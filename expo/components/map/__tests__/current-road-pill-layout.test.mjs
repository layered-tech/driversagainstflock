import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    AUTO_PLAY_LOCATION_PUCK_HEIGHT,
    CURRENT_ROAD_PILL_GAP_FROM_LOCATION_PUCK,
    getCurrentRoadPillTop,
    getMobileDrivingLocationAnchorY,
    MOBILE_DRIVING_LOCATION_FOLLOW_Y_RATIO,
    MOBILE_LOCATION_PUCK_HEIGHT,
    shouldShowCurrentRoadPill,
} from '../current-road-pill-layout.js';

describe('current road pill layout', () => {
    test('moves the phone puck up and places the pill beneath it', () => {
        const locationAnchorY = getMobileDrivingLocationAnchorY({
            bottomInset: 34,
            followViewportBottomOffset: 144,
            viewportHeight: 844,
        });
        const pillTop = getCurrentRoadPillTop({
            locationAnchorY,
            locationPuckHeight: MOBILE_LOCATION_PUCK_HEIGHT,
        });

        assert.ok(
            Math.abs(
                locationAnchorY - 844 * MOBILE_DRIVING_LOCATION_FOLLOW_Y_RATIO,
            ) <= 0.5,
        );
        assert.ok(locationAnchorY < 844 * 0.8);
        assert.equal(
            pillTop,
            Math.round(
                locationAnchorY +
                    MOBILE_LOCATION_PUCK_HEIGHT / 2 +
                    CURRENT_ROAD_PILL_GAP_FROM_LOCATION_PUCK,
            ),
        );
    });

    test('keeps the phone puck inside the camera destination reserve', () => {
        assert.equal(
            getMobileDrivingLocationAnchorY({
                bottomInset: 100,
                followViewportBottomOffset: 144,
                viewportHeight: 400,
            }),
            156,
        );
    });

    test('uses the same map camera bounds on constrained maps', () => {
        assert.equal(
            getMobileDrivingLocationAnchorY({
                bottomInset: 100,
                followViewportBottomOffset: 144,
                viewportHeight: 400,
            }),
            156,
        );
    });

    test('uses the car puck height when positioning the shared car pill', () => {
        assert.equal(
            getCurrentRoadPillTop({
                locationAnchorY: 842.4,
                locationPuckHeight: AUTO_PLAY_LOCATION_PUCK_HEIGHT,
            }),
            Math.round(
                842.4 +
                    AUTO_PLAY_LOCATION_PUCK_HEIGHT / 2 +
                    CURRENT_ROAD_PILL_GAP_FROM_LOCATION_PUCK,
            ),
        );
    });

    test('keeps road context visible during active navigation', () => {
        assert.equal(
            shouldShowCurrentRoadPill({
                roadText: 'Main Street',
                routeIsActive: true,
            }),
            true,
        );
        assert.equal(shouldShowCurrentRoadPill({ roadText: '   ' }), false);
    });
});
