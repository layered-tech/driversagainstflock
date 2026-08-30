import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    DRIVING_MAP_VIEW_PERSPECTIVE,
    DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
    getDrivingMapViewFollowConfiguration,
    getDrivingMapViewPresentation,
    getDrivingRouteOverviewPadding,
    getNextDrivingMapViewMode,
    shouldRestoreDrivingPerspective,
    shouldShowDrivingMapStatus,
} from '../driving-map-view.js';

describe('driving map view modes', () => {
    test('cycles directly between perspective and route overview', () => {
        assert.equal(
            getNextDrivingMapViewMode(DRIVING_MAP_VIEW_PERSPECTIVE),
            DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
        );
        assert.equal(
            getNextDrivingMapViewMode(DRIVING_MAP_VIEW_ROUTE_OVERVIEW),
            DRIVING_MAP_VIEW_PERSPECTIVE,
        );
    });

    test('keeps perspective pitched and route overview level', () => {
        assert.deepEqual(
            getDrivingMapViewFollowConfiguration(DRIVING_MAP_VIEW_PERSPECTIVE),
            { pitch: 55 },
        );
        assert.deepEqual(
            getDrivingMapViewFollowConfiguration(
                DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
            ),
            { pitch: 0 },
        );
    });

    test('describes the current mode for the shared control', () => {
        assert.deepEqual(
            getDrivingMapViewPresentation(DRIVING_MAP_VIEW_ROUTE_OVERVIEW),
            {
                iconName: 'map',
                label: 'Route overview',
                shortLabel: 'Route',
            },
        );
    });

    test('hides driving status in route overview mode', () => {
        assert.equal(
            shouldShowDrivingMapStatus(DRIVING_MAP_VIEW_PERSPECTIVE),
            true,
        );
        assert.equal(
            shouldShowDrivingMapStatus(DRIVING_MAP_VIEW_ROUTE_OVERVIEW),
            false,
        );
    });

    test('only the root map resets route mode after guidance ends', () => {
        assert.equal(
            shouldRestoreDrivingPerspective({
                hasActiveDirectionsRoute: false,
                isRootMapSurface: false,
                mode: DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
            }),
            false,
        );
        assert.equal(
            shouldRestoreDrivingPerspective({
                hasActiveDirectionsRoute: true,
                isRootMapSurface: true,
                mode: DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
            }),
            false,
        );
        assert.equal(
            shouldRestoreDrivingPerspective({
                hasActiveDirectionsRoute: false,
                isRootMapSurface: true,
                mode: DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
            }),
            true,
        );
    });

    test('pads route overview around navigation chrome and safe areas', () => {
        assert.deepEqual(
            getDrivingRouteOverviewPadding({
                bottom: 34,
                left: 0,
                right: 0,
                top: 59,
            }),
            [179, 72, 178, 24],
        );
    });
});
