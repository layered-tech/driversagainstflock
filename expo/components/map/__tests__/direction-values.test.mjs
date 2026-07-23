import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    formatMarkerDirectionLabel,
    getMarkerDirectionValue,
    getMarkerDirectionValues,
    normalizeDirectionDegrees,
    parseDirectionValues,
} from '../direction-values.js';

describe('direction value parsing', () => {
    test('parses semicolon, comma, and hyphen-delimited values', () => {
        assert.deepEqual(
            parseDirectionValues('90;270,SW-NW'),
            [90, 270, 225, 315],
        );
        assert.deepEqual(parseDirectionValues('-90;430'), [270, 70]);
    });

    test('normalizes cardinal and array values', () => {
        assert.deepEqual(
            parseDirectionValues(['NNE;180', 'west']),
            [22.5, 180, 270],
        );
        assert.equal(normalizeDirectionDegrees('north'), 0);
        assert.equal(normalizeDirectionDegrees('not-a-direction'), null);
    });
});

describe('marker direction values', () => {
    test('prefers and parses the raw top-level direction', () => {
        const marker = {
            properties: {
                bearing: 45,
                direction: '90;270',
                heading: 180,
            },
        };

        assert.equal(getMarkerDirectionValue(marker), '90;270');
        assert.deepEqual(getMarkerDirectionValues(marker), [90, 270]);
    });

    test('falls back to every nested OSM node direction tag', () => {
        const marker = {
            properties: {
                osm_nodes: [
                    { tags: { direction: '45;225' } },
                    { tags: { 'camera:direction': '0;180' } },
                    { tags: { 'camera:angle': 'NW-SE' } },
                ],
            },
        };

        assert.deepEqual(
            getMarkerDirectionValues(marker),
            [45, 225, 0, 180, 315, 135],
        );
    });

    test('formats every direction using the existing marker label style', () => {
        assert.equal(
            formatMarkerDirectionLabel({
                properties: { direction: '90;270' },
            }),
            '90 deg - facing E; 270 deg - facing W',
        );
        assert.equal(
            formatMarkerDirectionLabel({
                properties: {
                    osm_nodes: [{ tags: { direction: '315;135' } }],
                },
            }),
            '315 deg - facing NW; 135 deg - facing SE',
        );
        assert.equal(
            formatMarkerDirectionLabel({
                properties: { direction: 'NNE;SW' },
            }),
            '22.5 deg - facing NNE; 225 deg - facing SW',
        );
        assert.equal(formatMarkerDirectionLabel({ properties: {} }), '');
    });
});

test('wires shared marker direction values into map cones and details', () => {
    const geoSource = readFileSync(
        new URL('../geo.js', import.meta.url),
        'utf8',
    );
    const markerDetailsSource = readFileSync(
        new URL('../marker-details-sheet.js', import.meta.url),
        'utf8',
    );

    assert.match(
        geoSource,
        /getMarkerDirectionValues\(marker\)[\s\S]*?\.slice\(0, MAX_MARKER_CONE_DIRECTIONS\)/,
    );
    assert.match(
        markerDetailsSource,
        /formatMarkerDirectionLabel\(selectedMarker\) \|\| 'Not reported'/,
    );
    assert.match(
        markerDetailsSource,
        /label="Direction"[\s\S]*?numberOfLines=\{0\}/,
    );
});
