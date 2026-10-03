import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const directionsSource = readFileSync(
    new URL('../directions.js', import.meta.url),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

test('next automotive maneuver distance follows canonical route progress', () => {
    assert.match(
        directionsSource,
        /function getNextDirectionsManeuver[\s\S]*?decorateActiveManeuver\(\s*nextManeuver,[\s\S]*?nextManeuver\.startDistance - progressDistance/,
    );
    assert.match(
        autoPlaySource,
        /getNextDirectionsManeuver\(\s*route,\s*userLocation,\s*routeProgress\s*\)/,
    );
});

function guidanceHarness() {
    const history = [];
    const scope = {
        activeNavigationRoute: {},
        activeNavigationDestination: { label: 'Destination' },
        lastNavigationGuidanceLocation: null,
        latestNavigationGuidanceRecordedAt: null,
        rootMapPanningInterfaceIsVisible: false,
        lastNavigationGuidanceUpdatedAt: 0,
        navigationRouteGeneration: 1,
        navigationProgressTracker: { update: (_route, location) => location },
        getSelectedDirectionsRouteOption: () => ({
            coordinates: [[0, 0]],
            routeLabel: 'Route',
        }),
        getActiveDirectionsManeuver: (_route, location) => ({
            instruction: location?.roadMatch?.isRoundabout
                ? 'Take second exit'
                : 'Turn right',
        }),
        getRemainingDirectionsRouteValues: (_route, location) => ({
            distanceRemaining: location?.longitude ?? 0,
            durationRemaining: 60,
        }),
        getTripPointFromCoordinate: (_coordinate, _name, estimates) =>
            estimates,
        makeTravelEstimates: (distanceRemaining) => ({ distanceRemaining }),
        makeNavigationMessage: (_route, _location, _progress, maneuver) => ({
            title: maneuver.instruction,
        }),
        makeAutoPlayRoutingManeuvers: (
            _route,
            _location,
            _progress,
            maneuver,
        ) => [maneuver],
        rootMapTemplate: {
            updateTravelEstimates: (estimates) => history.push({ estimates }),
            updateManeuvers: (maneuvers) => history.push({ maneuvers }),
        },
        setAutoPlayState() {},
        formatDirectionsDistance: String,
        formatDirectionsDuration: String,
        getAutoPlayDestinationDistanceMeters: () => 100,
        autoDriveIsEnabled: true,
    };
    const source = autoPlaySource.match(
        /^function updateNavigationGuidance\([^]*?^}/m,
    )?.[0];
    const finiteNumber = autoPlaySource.match(
        /^function getFiniteNumber\([^]*?^}/m,
    )?.[0];
    assert.ok(source);
    const update = new Function(
        'scope',
        `with (scope) { ${finiteNumber}\n${source}\nreturn updateNavigationGuidance; }`,
    )(scope);
    return { history, update };
}

test('both native guidance methods retain the current fix and roundabout context through delayed or missing updates', () => {
    const { history, update } = guidanceHarness();
    update({
        longitude: 200,
        recordedAt: 3000,
        roadMatch: { isRoundabout: false },
    });
    const expected = history.slice();
    update({
        longitude: 100,
        recordedAt: 2000,
        roadMatch: { isRoundabout: true },
    });
    assert.deepEqual(history.slice(-2), expected);
    update(null);
    assert.deepEqual(history.slice(-2), expected);
    update({ longitude: 210, roadMatch: { isRoundabout: false } });
    update({
        longitude: 100,
        recordedAt: 2500,
        roadMatch: { isRoundabout: true },
    });
    assert.equal(history.at(-1).maneuvers[0].instruction, 'Turn right');
    assert.equal(history.at(-2).estimates[0].distanceRemaining, 210);
    update({
        longitude: 220,
        recordedAt: 4000,
        roadMatch: { isRoundabout: true },
    });
    assert.equal(history.at(-1).maneuvers[0].instruction, 'Take second exit');
    assert.equal(history.at(-2).estimates[0].distanceRemaining, 220);
});
