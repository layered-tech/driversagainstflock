import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    findMarkerDirectionValue,
    formatDirectionLabels,
    parseDirectionValues,
} from '../direction-values.js';

describe('parseDirectionValues', () => {
    test('parses semicolon, comma, and hyphen-delimited values', () => {
        assert.deepEqual(
            parseDirectionValues('90;270,45-225'),
            [90, 270, 45, 225],
        );
        assert.deepEqual(parseDirectionValues('-90;430.4'), [270, 70.4]);
    });

    test('parses abbreviated and named cardinal values', () => {
        assert.deepEqual(
            parseDirectionValues('N;NNE,southwest-WB'),
            [0, 22.5, 225, 270],
        );
    });

    test('filters empty and unsupported values', () => {
        assert.deepEqual(
            parseDirectionValues('90;;not-a-direction;SW'),
            [90, 225],
        );
        assert.deepEqual(parseDirectionValues(null), []);
    });
});

describe('findMarkerDirectionValue', () => {
    test('prefers a direct raw direction value', () => {
        assert.equal(
            findMarkerDirectionValue({
                properties: {
                    direction: '90;270',
                    heading: 90,
                    osm_nodes: [{ tags: { direction: '45' } }],
                },
            }),
            '90;270',
        );
    });

    test('finds direction and camera direction in nested OSM tags', () => {
        assert.equal(
            findMarkerDirectionValue({
                properties: {
                    osm_nodes: [{ tags: { direction: '45;225' } }],
                },
            }),
            '45;225',
        );
        assert.equal(
            findMarkerDirectionValue({
                properties: {
                    osm_nodes: JSON.stringify([
                        { tags: { 'camera:direction': 'NE;SW' } },
                    ]),
                },
            }),
            'NE;SW',
        );
    });

    test('falls back to legacy scalar marker headings', () => {
        assert.equal(
            findMarkerDirectionValue({ properties: { bearing: 180 } }),
            180,
        );
        assert.equal(
            findMarkerDirectionValue({
                properties: {
                    direction: 'not-a-direction',
                    heading: 90,
                },
            }),
            90,
        );
    });
});

describe('formatDirectionLabels', () => {
    test('formats every direction with degrees and a cardinal label', () => {
        assert.equal(
            formatDirectionLabels('90;270'),
            '90 deg - facing E; 270 deg - facing W',
        );
        assert.equal(
            formatDirectionLabels('NNE;SW'),
            '22.5 deg - facing NNE; 225 deg - facing SW',
        );
    });
});
