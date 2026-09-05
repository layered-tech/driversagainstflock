import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { parseAndroidGeoIntent } from '../../root/android-geo-intent.js';

const handlerSource = readFileSync(
    new URL('../../root/android-geo-intent-handler.js', import.meta.url),
    'utf8',
);
const rootLayoutSource = readFileSync(
    new URL('../../../app/_layout.js', import.meta.url),
    'utf8',
);
const mapSearchSource = readFileSync(
    new URL('../use-map-search.js', import.meta.url),
    'utf8',
);

describe('Android phone geo intents', () => {
    test('turns bounded coordinates into the shared directions waypoint shape', () => {
        assert.deepEqual(
            parseAndroidGeoIntent(
                'geo:41.881832,-87.623177?q=Chicago&intent=directions',
            ),
            {
                destinationQuery: '',
                destinationWaypoint: {
                    id: 'android-geo:41.881832,-87.623177',
                    inputValue: 'Chicago',
                    kind: 'place',
                    label: 'Chicago',
                    location: {
                        latitude: 41.881832,
                        longitude: -87.623177,
                    },
                    subtitle: '41.881832, -87.623177',
                },
            },
        );
    });

    test('opens text-only destinations in the shared directions search flow', () => {
        assert.deepEqual(
            parseAndroidGeoIntent(
                'geo:0,0?q=1600+Amphitheatre+Parkway&intent=navigation',
            ),
            {
                destinationQuery: '1600 Amphitheatre Parkway',
                destinationWaypoint: null,
            },
        );
    });

    test('accepts coordinates encoded in the q parameter', () => {
        const intent = parseAndroidGeoIntent(
            'geo:0,0?q=41.881832,-87.623177(Chicago)',
        );

        assert.equal(intent.destinationWaypoint.label, 'Chicago');
        assert.deepEqual(intent.destinationWaypoint.location, {
            latitude: 41.881832,
            longitude: -87.623177,
        });
    });

    test('accepts hierarchical geo coordinates delivered to MainActivity', () => {
        const intent = parseAndroidGeoIntent(
            'geo://41.881832,-87.623177?q=Chicago',
        );

        assert.equal(intent.destinationWaypoint.label, 'Chicago');
        assert.deepEqual(intent.destinationWaypoint.location, {
            latitude: 41.881832,
            longitude: -87.623177,
        });
    });

    test('rejects malformed, duplicated, and unsupported intent metadata', () => {
        for (const value of [
            'https://example.com/?q=Chicago',
            'geo:95,200',
            'geo:0,0',
            'geo:0,0?q=one&q=two',
            'geo:0,0?q=Chicago&intent=add_a_stop',
        ]) {
            assert.equal(parseAndroidGeoIntent(value), null, value);
        }
    });

    test('consumes initial and later geo links through shared map state', () => {
        assert.doesNotMatch(handlerSource, /useLinkingURL/);
        assert.match(
            handlerSource,
            /Linking\.addEventListener\('url',[\s\S]*?handleLiveURL\(url\)/,
        );
        assert.match(
            handlerSource,
            /Linking\.getInitialURL\(\)[\s\S]*?handleInitialURL\(url\)/,
        );
        assert.match(
            handlerSource,
            /pendingInitialIntentDuplicateRef\.current = null;[\s\S]*?return;[\s\S]*?handleURL\(value\)/,
        );
        assert.match(
            handlerSource,
            /setPendingDirectionsRequest\(\{[\s\S]*?source: 'android_geo_intent'[\s\S]*?router\.navigate\('\/'\)/,
        );
        assert.match(
            rootLayoutSource,
            /<SharedMapStateProvider>[\s\S]*?<AndroidGeoIntentHandler \/>/,
        );
        assert.match(
            mapSearchSource,
            /pendingDirectionsRequest\?\.destinationQuery[\s\S]*?setDirectionsDestinationValue\(destinationQuery\)[\s\S]*?setSearchMode\(DIRECTIONS_MODE_DIRECTIONS\)/,
        );
    });
});
