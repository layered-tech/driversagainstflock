import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildChangesetTags,
    buildNodeTags,
    degreesToCardinal,
    formatBearingChip,
} from '../../../components/contribute/osm-tags.js';

describe('buildNodeTags', () => {
    test('maps the ALPR defaults', () => {
        assert.deepEqual(
            buildNodeTags({
                directions: [],
                manufacturer: 'flock',
                mount: null,
                operator: '',
                type: 'alpr',
            }),
            {
                'camera:type': 'fixed',
                man_made: 'surveillance',
                manufacturer: 'Flock Safety',
                'manufacturer:wikidata': 'Q108485435',
                surveillance: 'public',
                'surveillance:type': 'ALPR',
                'surveillance:zone': 'traffic',
            },
        );
    });

    test('maps CCTV to surveillance:type=camera without a zone', () => {
        const tags = buildNodeTags({ manufacturer: 'other', type: 'cctv' });

        assert.equal(tags['surveillance:type'], 'camera');
        assert.equal(tags.surveillance, 'public');
        assert.equal(tags['camera:type'], 'fixed');
        assert.equal(tags['surveillance:zone'], undefined);
    });

    test('gantry type forces the gantry mount over any selection', () => {
        const tags = buildNodeTags({
            manufacturer: 'motorola',
            mount: 'pole',
            type: 'gantry',
        });

        assert.equal(tags['surveillance:type'], 'ALPR');
        assert.equal(tags['camera:mount'], 'gantry');
        assert.equal(tags.manufacturer, 'Motorola Solutions');
        assert.equal(tags['manufacturer:wikidata'], 'Q634815');
    });

    test('omits manufacturer tags for other', () => {
        const tags = buildNodeTags({ manufacturer: 'other', type: 'alpr' });

        assert.equal(tags.manufacturer, undefined);
        assert.equal(tags['manufacturer:wikidata'], undefined);
    });

    test('trims the operator and omits it when blank', () => {
        assert.equal(
            buildNodeTags({ operator: '  City of San Francisco  ' }).operator,
            'City of San Francisco',
        );
        assert.equal(buildNodeTags({ operator: '   ' }).operator, undefined);
    });

    test('joins bearings with semicolons and normalizes them modulo 360', () => {
        assert.equal(buildNodeTags({ directions: [250] }).direction, '250');
        assert.equal(
            buildNodeTags({ directions: [90.4, 270] }).direction,
            '90;270',
        );
        assert.equal(buildNodeTags({ directions: [430] }).direction, '70');
        assert.equal(buildNodeTags({ directions: [] }).direction, undefined);
        assert.equal(
            buildNodeTags({ directions: [Number.NaN] }).direction,
            undefined,
        );
    });

    test('writes only known camera:mount values', () => {
        assert.equal(
            buildNodeTags({ mount: 'traffic_signals' })['camera:mount'],
            'traffic_signals',
        );
        assert.equal(
            buildNodeTags({ mount: 'lamppost' })['camera:mount'],
            undefined,
        );
        assert.equal(buildNodeTags({ mount: null })['camera:mount'], undefined);
    });
});

describe('buildChangesetTags', () => {
    test('trims the comment and includes the source', () => {
        assert.deepEqual(
            buildChangesetTags({
                comment: '  Added 2 cameras.  ',
                hashtags: '',
                source: 'survey',
            }),
            {
                comment: 'Added 2 cameras.',
                source: 'survey',
            },
        );
    });

    test('normalizes space-separated hashtags to semicolon-delimited', () => {
        assert.equal(
            buildChangesetTags({
                comment: 'x',
                hashtags: '#flock #alpr #surveillance',
            }).hashtags,
            '#flock;#alpr;#surveillance',
        );
    });

    test('repairs missing hashes and mixed separators', () => {
        assert.equal(
            buildChangesetTags({ comment: 'x', hashtags: 'flock, alpr;;#daf' })
                .hashtags,
            '#flock;#alpr;#daf',
        );
    });

    test('omits empty source and hashtags', () => {
        assert.deepEqual(buildChangesetTags({ comment: 'x' }), {
            comment: 'x',
        });
    });
});

describe('degreesToCardinal', () => {
    test('maps bearings onto the 16-point compass', () => {
        assert.equal(degreesToCardinal(0), 'N');
        assert.equal(degreesToCardinal(45), 'NE');
        assert.equal(degreesToCardinal(90), 'E');
        assert.equal(degreesToCardinal(250), 'WSW');
        assert.equal(degreesToCardinal(315), 'NW');
        assert.equal(degreesToCardinal(337), 'NNW');
        assert.equal(degreesToCardinal(350), 'N');
    });

    test('returns an empty string for invalid input', () => {
        assert.equal(degreesToCardinal(null), '');
        assert.equal(degreesToCardinal(Number.NaN), '');
    });
});

describe('formatBearingChip', () => {
    test('formats a bearing with its cardinal', () => {
        assert.equal(formatBearingChip(250), '250° · WSW');
        assert.equal(formatBearingChip(430), '70° · ENE');
    });

    test('returns an empty string for invalid input', () => {
        assert.equal(formatBearingChip(undefined), '');
    });
});
