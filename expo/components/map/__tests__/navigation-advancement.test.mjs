import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getDirectionsRouteCoordinatesAhead,
    getUpcomingElectronicHorizonAlerts,
} from '../electronic-horizon.js';
import { shouldKeepCurrentManeuverActive } from '../navigation-advancement.js';

const routeCoordinates = [
    [-97.7431, 30.2672],
    [-97.7421, 30.2672],
    [-97.7411, 30.2672],
    [-97.7401, 30.2672],
];

describe('navigation item advancement', () => {
    test('advances to the next maneuver immediately after passing its location', () => {
        const currentManeuver = {
            endDistance: 200,
            startDistance: 100,
            type: 1,
        };
        const upcomingManeuver = {
            endDistance: 300,
            startDistance: 200,
            type: 6,
        };

        assert.equal(
            shouldKeepCurrentManeuverActive({
                currentManeuver,
                progressDistance: 100,
                upcomingManeuver,
            }),
            true,
        );
        assert.equal(
            shouldKeepCurrentManeuverActive({
                currentManeuver,
                progressDistance: 101,
                upcomingManeuver,
            }),
            false,
        );
    });

    test('removes police and ALPR alerts immediately after passing them', () => {
        const userLocation = {
            latitude: 30.2672,
            longitude: -97.74209,
        };
        const pathCoordinates = getDirectionsRouteCoordinatesAhead(
            routeCoordinates,
            userLocation,
        );
        const alerts = getUpcomingElectronicHorizonAlerts({
            alprNodes: [
                { coordinate: routeCoordinates[1], id: 'passed-alpr' },
                { coordinate: routeCoordinates[2], id: 'next-alpr' },
            ],
            pathCoordinates,
            policeAlerts: [
                { coordinate: routeCoordinates[1], id: 'passed-police' },
                { coordinate: routeCoordinates[2], id: 'next-police' },
            ],
        });

        assert.deepEqual(
            alerts.map((alert) => alert.id),
            ['next-alpr', 'next-police'],
        );
    });
});
