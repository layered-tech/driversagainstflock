import {
    startAutoDriveSimulation,
    stopAutoDriveSimulation,
} from '../auto-play-drive-simulation';
import { presenceCoordinator } from './alpr-presence-runtime';
import { e2eMapApiMocksCanBeEnabled } from './api-mocks';
import { getRoadCoordinateDistanceMeters } from './road-graph';
import { pewaukeeCoordinates } from './pewaukee-drive-fixture';

let fixture = null;
export function getPresenceE2EFixture() {
    return e2eMapApiMocksCanBeEnabled() ? fixture : null;
}
export function startPresenceE2EScenario(command) {
    if (!e2eMapApiMocksCanBeEnabled()) return false;
    if (command === 'reset') {
        fixture = null;
        stopAutoDriveSimulation();
        void presenceCoordinator
            .resetLimits()
            .then(() => console.info('[E2E] presence-limits-reset'))
            .catch((error) =>
                console.info(`[E2E] presence-reset-failed:${error.message}`),
            );
        return true;
    }
    if (command === 'stop') {
        fixture = null;
        stopAutoDriveSimulation();
        return true;
    }
    if (!['start', 'navigation', 'former-eligibility'].includes(command))
        return false;
    const navigationActive = command === 'navigation';
    const formerEligibilityGates = command === 'former-eligibility';
    // Start just north of the mapped reader so the smoke suite observes the pass.
    const coordinates = pewaukeeCoordinates.slice(48);
    const speedMetersPerSecond = 8;
    fixture = {
        coordinates,
        routeKey: 'presence-e2e',
        navigationActive,
        maneuverSeconds: null,
        coverageComplete: true,
        coverageCenter: null,
        nodes: [
            {
                id: 'osm-node-12634608635',
                osm_id: 12634608635,
                longitude: -88.2445066,
                latitude: 43.1099621,
                tags: { 'addr:street': 'Pewaukee Road' },
            },
        ],
    };
    startAutoDriveSimulation({
        coordinates,
        speedMetersPerSecond,
        tickMs: 1000,
        onLocation: (position) => {
            if (navigationActive) {
                fixture.maneuverSeconds =
                    getRoadCoordinateDistanceMeters(
                        [position.coords.longitude, position.coords.latitude],
                        coordinates.at(-1),
                    ) / speedMetersPerSecond;
            }
            fixture.location = {
                ...position.coords,
                ...(formerEligibilityGates ? { speed: 0 } : {}),
                recordedAt: position.timestamp,
                roadMatch: {
                    isOffRoad: formerEligibilityGates,
                    isTeleport: formerEligibilityGates,
                    wayId: 'presence-e2e-road',
                    roadClass: formerEligibilityGates
                        ? 'motorway'
                        : 'residential',
                    edgeMatchProbability: 0.99,
                },
            };
        },
        onArrive: () => {
            fixture = null;
        },
    });
    console.info(`[E2E] presence-drive-started:${command}`);
    return true;
}
