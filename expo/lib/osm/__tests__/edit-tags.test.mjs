import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildEditChangesetComment,
    buildRemovalChangesetComment,
    buildUpdatedNodeTags,
    EDIT_MOUNT_OPTIONS,
    parseNodeDetails,
    REMOVAL_REASONS,
} from '../edit-tags.js';

describe('parseNodeDetails', () => {
    test('parses a Flock ALPR pole node', () => {
        assert.deepEqual(
            parseNodeDetails({
                'camera:mount': 'pole',
                'camera:type': 'fixed',
                direction: '310',
                man_made: 'surveillance',
                manufacturer: 'Flock Safety',
                'manufacturer:wikidata': 'Q108485435',
                operator: 'City of Oakland',
                surveillance: 'public',
                'surveillance:type': 'ALPR',
                'surveillance:zone': 'traffic',
            }),
            {
                directions: [310],
                isActive: true,
                manufacturer: 'flock',
                mount: 'pole',
                operator: 'City of Oakland',
                type: 'alpr',
            },
        );
    });

    test('matches ALPR case-insensitively', () => {
        assert.equal(
            parseNodeDetails({ 'surveillance:type': 'alpr' }).type,
            'alpr',
        );
        assert.equal(
            parseNodeDetails({ 'surveillance:type': 'Alpr' }).type,
            'alpr',
        );
    });

    test('gantry mounts parse as the gantry type even with ALPR tags', () => {
        const details = parseNodeDetails({
            'camera:mount': 'gantry',
            'surveillance:type': 'ALPR',
        });

        assert.equal(details.type, 'gantry');
        assert.equal(details.mount, 'gantry');
    });

    test('non-ALPR cameras parse as cctv', () => {
        assert.equal(
            parseNodeDetails({ 'surveillance:type': 'camera' }).type,
            'cctv',
        );
        assert.equal(parseNodeDetails({}).type, 'cctv');
    });

    test('disused surveillance nodes parse as inactive', () => {
        assert.equal(
            parseNodeDetails({ 'disused:man_made': 'surveillance' }).isActive,
            false,
        );
        assert.equal(
            parseNodeDetails({ man_made: 'surveillance' }).isActive,
            true,
        );
        assert.equal(parseNodeDetails({}).isActive, true);
    });

    test('parses multi-value direction strings and drops cardinal tokens', () => {
        assert.deepEqual(
            parseNodeDetails({ direction: '310;130' }).directions,
            [310, 130],
        );
        assert.deepEqual(
            parseNodeDetails({ direction: '310;NW' }).directions,
            [310],
        );
        assert.deepEqual(parseNodeDetails({ direction: 'NW' }).directions, []);
        assert.deepEqual(
            parseNodeDetails({ direction: '430.4;-90' }).directions,
            [70, 270],
        );
        assert.deepEqual(parseNodeDetails({ direction: ';' }).directions, []);
        assert.deepEqual(parseNodeDetails({}).directions, []);
    });

    test('maps manufacturers onto the known options', () => {
        assert.equal(
            parseNodeDetails({ manufacturer: 'Flock Safety' }).manufacturer,
            'flock',
        );
        assert.equal(
            parseNodeDetails({ manufacturer: 'Motorola Solutions' })
                .manufacturer,
            'motorola',
        );
        assert.equal(
            parseNodeDetails({ manufacturer: 'Axis Communications' })
                .manufacturer,
            'other',
        );
        assert.equal(parseNodeDetails({}).manufacturer, 'other');
    });

    test('keeps only known camera:mount values', () => {
        assert.equal(
            parseNodeDetails({ 'camera:mount': 'traffic_signals' }).mount,
            'traffic_signals',
        );
        assert.equal(
            parseNodeDetails({ 'camera:mount': 'lamppost' }).mount,
            null,
        );
        assert.equal(parseNodeDetails({}).mount, null);
    });

    test('returns safe defaults for empty or missing tags', () => {
        assert.deepEqual(parseNodeDetails({}), {
            directions: [],
            isActive: true,
            manufacturer: 'other',
            mount: null,
            operator: '',
            type: 'cctv',
        });
        assert.deepEqual(parseNodeDetails(undefined).directions, []);
        assert.equal(
            parseNodeDetails({ operator: 'Oakland PD' }).operator,
            'Oakland PD',
        );
    });
});

describe('buildUpdatedNodeTags', () => {
    test('preserves unmanaged tags while rewriting the managed vocabulary', () => {
        assert.deepEqual(
            buildUpdatedNodeTags(
                {
                    'camera:mount': 'pole',
                    'camera:type': 'fixed',
                    direction: '90',
                    man_made: 'surveillance',
                    manufacturer: 'Flock Safety',
                    'manufacturer:wikidata': 'Q108485435',
                    note: 'installed on the corner',
                    operator: 'City of Oakland',
                    surveillance: 'public',
                    'surveillance:type': 'ALPR',
                    'surveillance:zone': 'traffic',
                    'survey:date': '2026-06-21',
                },
                {
                    directions: [310, 130],
                    isActive: true,
                    manufacturer: 'motorola',
                    mount: 'traffic_signals',
                    operator: 'Oakland PD',
                    type: 'alpr',
                },
            ),
            {
                'camera:mount': 'traffic_signals',
                'camera:type': 'fixed',
                direction: '310;130',
                man_made: 'surveillance',
                manufacturer: 'Motorola Solutions',
                'manufacturer:wikidata': 'Q634815',
                note: 'installed on the corner',
                operator: 'Oakland PD',
                surveillance: 'public',
                'surveillance:type': 'ALPR',
                'surveillance:zone': 'traffic',
                'survey:date': '2026-06-21',
            },
        );
    });

    test('switching cctv to alpr swaps the type and adds the traffic zone', () => {
        const tags = buildUpdatedNodeTags(
            {
                man_made: 'surveillance',
                surveillance: 'public',
                'surveillance:type': 'camera',
            },
            { isActive: true, manufacturer: 'other', type: 'alpr' },
        );

        assert.equal(tags['surveillance:type'], 'ALPR');
        assert.equal(tags['surveillance:zone'], 'traffic');
    });

    test('switching alpr to cctv drops the stale traffic zone', () => {
        const tags = buildUpdatedNodeTags(
            {
                man_made: 'surveillance',
                'surveillance:type': 'ALPR',
                'surveillance:zone': 'traffic',
            },
            { isActive: true, manufacturer: 'other', type: 'cctv' },
        );

        assert.equal(tags['surveillance:type'], 'camera');
        assert.equal(tags['surveillance:zone'], undefined);
    });

    test('deactivating swaps man_made for disused:man_made and back', () => {
        const disusedTags = buildUpdatedNodeTags(
            { man_made: 'surveillance', 'surveillance:type': 'ALPR' },
            { isActive: false, manufacturer: 'other', type: 'alpr' },
        );

        assert.equal(disusedTags.man_made, undefined);
        assert.equal(disusedTags['disused:man_made'], 'surveillance');

        const reactivatedTags = buildUpdatedNodeTags(disusedTags, {
            isActive: true,
            manufacturer: 'other',
            type: 'alpr',
        });

        assert.equal(reactivatedTags.man_made, 'surveillance');
        assert.equal(reactivatedTags['disused:man_made'], undefined);
    });

    test('trims the operator and removes it when blank', () => {
        assert.equal(
            buildUpdatedNodeTags(
                {},
                {
                    operator: '  City of Oakland  ',
                    type: 'alpr',
                },
            ).operator,
            'City of Oakland',
        );
        assert.equal(
            buildUpdatedNodeTags(
                { operator: 'Old Operator' },
                { operator: '   ', type: 'alpr' },
            ).operator,
            undefined,
        );
    });

    test('joins directions with semicolons and clears stale values', () => {
        assert.equal(
            buildUpdatedNodeTags({}, { directions: [90.4, 270], type: 'alpr' })
                .direction,
            '90;270',
        );
        assert.equal(
            buildUpdatedNodeTags(
                { direction: '45' },
                { directions: [], type: 'alpr' },
            ).direction,
            undefined,
        );
    });

    test('removes manufacturer tags when switching to other', () => {
        const tags = buildUpdatedNodeTags(
            {
                manufacturer: 'Flock Safety',
                'manufacturer:wikidata': 'Q108485435',
            },
            { isActive: true, manufacturer: 'other', type: 'alpr' },
        );

        assert.equal(tags.manufacturer, undefined);
        assert.equal(tags['manufacturer:wikidata'], undefined);
    });

    test('writes only known camera:mount values and gantry always wins', () => {
        assert.equal(
            buildUpdatedNodeTags({}, { mount: 'lamppost', type: 'alpr' })[
                'camera:mount'
            ],
            undefined,
        );
        assert.equal(
            buildUpdatedNodeTags(
                { 'camera:mount': 'pole' },
                {
                    mount: null,
                    type: 'alpr',
                },
            )['camera:mount'],
            undefined,
        );
        assert.equal(
            buildUpdatedNodeTags({}, { mount: 'pole', type: 'gantry' })[
                'camera:mount'
            ],
            'gantry',
        );
    });

    test('round-trips a parsed node back to equivalent tags', () => {
        const existingTags = {
            'camera:mount': 'pole',
            'camera:type': 'fixed',
            direction: '310;130',
            man_made: 'surveillance',
            manufacturer: 'Flock Safety',
            'manufacturer:wikidata': 'Q108485435',
            operator: 'City of Oakland',
            surveillance: 'public',
            'surveillance:type': 'ALPR',
            'surveillance:zone': 'traffic',
            'survey:date': '2026-06-21',
        };

        assert.deepEqual(
            buildUpdatedNodeTags(existingTags, parseNodeDetails(existingTags)),
            existingTags,
        );
    });
});

describe('buildEditChangesetComment', () => {
    test('names the camera type', () => {
        assert.equal(
            buildEditChangesetComment({ type: 'alpr' }),
            'Updated ALPR camera details',
        );
        assert.equal(
            buildEditChangesetComment({ type: 'cctv' }),
            'Updated CCTV camera details',
        );
        assert.equal(
            buildEditChangesetComment({ type: 'gantry' }),
            'Updated gantry camera details',
        );
        assert.equal(
            buildEditChangesetComment({}),
            'Updated ALPR camera details',
        );
    });
});

describe('buildRemovalChangesetComment', () => {
    test('includes the selected removal reason', () => {
        assert.equal(
            buildRemovalChangesetComment('gone'),
            'Removed ALPR camera (gone from pole)',
        );
        assert.equal(
            buildRemovalChangesetComment('never-existed'),
            'Removed ALPR camera (never existed)',
        );
        assert.equal(
            buildRemovalChangesetComment('duplicate'),
            'Removed ALPR camera (duplicate node)',
        );
    });

    test('falls back to no longer present', () => {
        assert.equal(
            buildRemovalChangesetComment('other'),
            'Removed ALPR camera (no longer present)',
        );
        assert.equal(
            buildRemovalChangesetComment('mystery'),
            'Removed ALPR camera (no longer present)',
        );
        assert.equal(
            buildRemovalChangesetComment(undefined),
            'Removed ALPR camera (no longer present)',
        );
    });
});

describe('edit option lists', () => {
    test('mount options map to known OSM camera:mount values', () => {
        assert.deepEqual(
            EDIT_MOUNT_OPTIONS.map((option) => option.value),
            ['pole', 'gantry', 'building', 'traffic_signals'],
        );
    });

    test('removal reasons expose stable values with changeset comments', () => {
        assert.deepEqual(
            REMOVAL_REASONS.map((reason) => reason.value),
            ['gone', 'never-existed', 'duplicate', 'other'],
        );

        for (const reason of REMOVAL_REASONS) {
            assert.equal(typeof reason.comment, 'string');
            assert.ok(reason.comment.length > 0);
            assert.equal(typeof reason.label, 'string');
            assert.ok(reason.label.length > 0);
        }
    });
});
