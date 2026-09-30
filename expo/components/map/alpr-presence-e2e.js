import {
    startAutoDriveSimulation,
    stopAutoDriveSimulation,
} from '../auto-play-drive-simulation';
import { presenceCoordinator } from './alpr-presence-runtime';
import { e2eMapApiMocksCanBeEnabled } from './api-mocks';

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
    const navigationActive = command.startsWith('navigation');
    const formerEligibilityGates = command === 'former-eligibility';
    const coordinates = [
        [-97.7431, 30.2672],
        [-97.7431, 30.2742],
    ];
    fixture = {
        coordinates,
        routeKey: 'presence-e2e',
        navigationActive,
        maneuverSeconds: command === 'navigation-near-maneuver' ? 20 : 90,
        coverageComplete: true,
        coverageCenter: null,
        nodes: [
            {
                id: 'osm-node-fixture',
                osm_id: 987654321,
                longitude: -97.7431,
                latitude: 30.26755,
                tags: { 'addr:street': 'Congress Avenue' },
            },
        ],
    };
    startAutoDriveSimulation({
        coordinates,
        speedMetersPerSecond: 8,
        tickMs: 1000,
        onLocation: (position) => {
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
