import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

const { AutoPlayTopRightStatusOverlay } = loadTourModule(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    {
        'react-native': {
            useColorScheme: () => 'light',
            View: 'View',
            Text: 'Text',
            ActivityIndicator: 'ActivityIndicator',
        },
        './auto-play-map-status-layout': {
            getAutoPlayTopRightStatusOverlayLayout: () => ({
                positionStyle: {},
            }),
        },
        './design-system/tokens': { dafSemanticColors: { brand: '#7A5CFF' } },
        './map/driving-location-road-stack': {},
        './map/marker-loading-indicator': {},
        './map/navigation-puck-layout': {},
        './map/speed-limit': {},
        './map/speed-limit-layout': {},
    },
);

test('the automotive search flow has no automatic advancement hooks', () => {
    const source = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(
        source,
        /autoAdvanceSingleResult|singleResultCountdown|scheduleAutoPlaySingleResultAutoAdvance/,
    );
});

test('route loading and retired countdown data cannot display a floating card', () => {
    assert.equal(
        AutoPlayTopRightStatusOverlay({
            routeLoading: { destinationLabel: 'Coffee' },
            singleResultCountdown: {
                destinationLabel: 'Coffee',
                remainingSeconds: 1,
            },
        }),
        null,
    );
});

test('search progress still renders its query and only its search card', () => {
    const overlay = AutoPlayTopRightStatusOverlay({
        searchLoading: { query: 'Coffee' },
    });
    const card = overlay.props.children.type(overlay.props.children.props);
    assert.equal(card.props.testID, 'auto-play-search-loading-card');
    assert.equal(card.props.accessibilityLabel, 'Searching for Coffee');
});
