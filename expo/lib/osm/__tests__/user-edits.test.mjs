import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildCameraTypeLabel,
    buildYourEditsModel,
    collectSurveillanceNodeIds,
    formatChangesetDateLabel,
    formatCoordinateLabel,
    formatGroupedNumber,
    isSurveillanceTags,
} from '../user-edits.js';

const ALPR_TAGS = {
    man_made: 'surveillance',
    manufacturer: 'Flock Safety',
    'surveillance:type': 'ALPR',
};

// Local-time constructions keep the expected calendar labels stable no
// matter which timezone the test machine runs in.
const NOW = new Date(2026, 6, 11, 12, 0, 0).getTime();
const USER = { id: '90001', name: 'daf_mapper' };

function isoMinutesAgo(minutes) {
    return new Date(NOW - minutes * 60 * 1000).toISOString();
}

function makeChangeset(id, overrides = {}) {
    return {
        changesCount: 1,
        closedAt: isoMinutesAgo(5),
        createdAt: isoMinutesAgo(6),
        id,
        open: false,
        tags: {},
        ...overrides,
    };
}

function makeChangeNode(id, overrides = {}) {
    return {
        id,
        latitude: 37.774912,
        longitude: -122.419415,
        tags: ALPR_TAGS,
        version: 1,
        ...overrides,
    };
}

function makeCurrentNode(id, overrides = {}) {
    return {
        id,
        latitude: 37.774912,
        longitude: -122.419415,
        tags: ALPR_TAGS,
        timestamp: isoMinutesAgo(5),
        uid: 90001,
        user: 'daf_mapper',
        version: 1,
        visible: true,
        ...overrides,
    };
}

function emptyGroups(overrides = {}) {
    return { created: [], deleted: [], modified: [], ...overrides };
}

describe('isSurveillanceTags', () => {
    test('recognizes surveillance nodes in all supported shapes', () => {
        assert.equal(isSurveillanceTags({ man_made: 'surveillance' }), true);
        assert.equal(
            isSurveillanceTags({ 'disused:man_made': 'surveillance' }),
            true,
        );
        assert.equal(isSurveillanceTags({ 'surveillance:type': 'ALPR' }), true);
    });

    test('rejects other or missing tags', () => {
        assert.equal(isSurveillanceTags({ highway: 'crossing' }), false);
        assert.equal(isSurveillanceTags({}), false);
        assert.equal(isSurveillanceTags(null), false);
        assert.equal(isSurveillanceTags(undefined), false);
    });
});

describe('buildCameraTypeLabel', () => {
    test('labels ALPR readers with their manufacturer', () => {
        assert.equal(
            buildCameraTypeLabel(ALPR_TAGS),
            'ALPR reader · Flock Safety',
        );
    });

    test('is case-insensitive about the surveillance type', () => {
        assert.equal(
            buildCameraTypeLabel({ 'surveillance:type': 'alpr' }),
            'ALPR reader',
        );
    });

    test('labels gantry-mounted readers as gantry cameras', () => {
        assert.equal(
            buildCameraTypeLabel({
                'camera:mount': 'gantry',
                manufacturer: 'Motorola Solutions',
                'surveillance:type': 'ALPR',
            }),
            'Gantry camera · Motorola Solutions',
        );
    });

    test('falls back to CCTV without a manufacturer suffix', () => {
        assert.equal(
            buildCameraTypeLabel({ 'surveillance:type': 'camera' }),
            'CCTV camera',
        );
        assert.equal(buildCameraTypeLabel({}), 'CCTV camera');
    });
});

describe('formatGroupedNumber', () => {
    test('comma-groups ids independent of locale', () => {
        assert.equal(formatGroupedNumber(171224908), '171,224,908');
        assert.equal(formatGroupedNumber(954), '954');
        assert.equal(formatGroupedNumber('12345'), '12,345');
    });
});

describe('formatCoordinateLabel', () => {
    test('renders four decimal places', () => {
        assert.equal(
            formatCoordinateLabel(37.774912, -122.419415),
            '37.7749, -122.4194',
        );
    });

    test('falls back when coordinates are missing', () => {
        assert.equal(formatCoordinateLabel(null, null), 'Location unavailable');
        assert.equal(
            formatCoordinateLabel(37.774912, null),
            'Location unavailable',
        );
    });
});

describe('formatChangesetDateLabel', () => {
    test('uses "Just now" under an hour', () => {
        assert.equal(
            formatChangesetDateLabel(NOW - 59 * 60 * 1000, NOW),
            'Just now',
        );
    });

    test('uses hours under a day', () => {
        assert.equal(
            formatChangesetDateLabel(NOW - 3 * 60 * 60 * 1000, NOW),
            '3h ago',
        );
        assert.equal(
            formatChangesetDateLabel(NOW - 23 * 60 * 60 * 1000, NOW),
            '23h ago',
        );
    });

    test('uses a short day-month label for the current year', () => {
        assert.equal(
            formatChangesetDateLabel(new Date(2026, 5, 21, 9).getTime(), NOW),
            '21 Jun',
        );
    });

    test('appends the year for older changesets', () => {
        assert.equal(
            formatChangesetDateLabel(new Date(2025, 10, 3, 9).getTime(), NOW),
            '3 Nov 2025',
        );
    });
});

describe('collectSurveillanceNodeIds', () => {
    test('collects camera and tagless node ids without duplicates', () => {
        const nodeIds = collectSurveillanceNodeIds({
            changesets: [makeChangeset(1), makeChangeset(2)],
            changesetNodesById: {
                1: emptyGroups({
                    created: [
                        makeChangeNode(11),
                        makeChangeNode(13, { tags: { highway: 'crossing' } }),
                    ],
                    deleted: [makeChangeNode(12, { tags: {} })],
                }),
                2: emptyGroups({
                    modified: [makeChangeNode(11, { version: 2 })],
                }),
            },
        });

        assert.deepEqual([...nodeIds].sort(), [11, 12]);
    });
});

describe('buildYourEditsModel', () => {
    test('assembles sections with formatted labels, newest first', () => {
        const model = buildYourEditsModel({
            changesets: [
                makeChangeset(170981554, {
                    closedAt: new Date(2026, 5, 21, 9, 30).toISOString(),
                }),
                makeChangeset(171224908, { closedAt: isoMinutesAgo(4) }),
            ],
            changesetNodesById: {
                170981554: emptyGroups({
                    modified: [makeChangeNode(11640217, { version: 3 })],
                }),
                171224908: emptyGroups({
                    created: [
                        makeChangeNode(12100881),
                        makeChangeNode(12100882),
                    ],
                }),
            },
            currentNodesById: {
                11640217: makeCurrentNode(11640217, { version: 3 }),
                12100881: makeCurrentNode(12100881),
                12100882: makeCurrentNode(12100882),
            },
            currentUser: USER,
            now: NOW,
        });

        assert.equal(model.sections.length, 2);

        const [freshSection, olderSection] = model.sections;

        assert.equal(freshSection.id, 171224908);
        assert.equal(freshSection.idLabel, 'changeset/171,224,908');
        assert.equal(freshSection.title, 'Just now · 2 cameras');
        assert.equal(freshSection.isFresh, true);
        assert.equal(freshSection.nodes[0].subtitle, '37.7749, -122.4194');
        assert.equal(
            freshSection.nodes[0].typeLabel,
            'ALPR reader · Flock Safety',
        );

        assert.equal(olderSection.title, '21 Jun · 1 camera');
        assert.equal(olderSection.isFresh, false);
        assert.equal(olderSection.nodes[0].refLabel, 'node/11640217 · v3');

        assert.equal(model.cameraCount, 3);
        assert.equal(model.liveCount, 3);
        assert.equal(model.changesetCount, 2);
        assert.equal(model.livePillLabel, '3 live');
        assert.equal(model.countsLabel, '3 cameras · 2 changesets');
    });

    test('skips changesets without surveillance nodes or without data', () => {
        const model = buildYourEditsModel({
            changesets: [
                makeChangeset(1),
                makeChangeset(2),
                makeChangeset(3, { closedAt: null, open: true }),
            ],
            changesetNodesById: {
                1: emptyGroups({ created: [makeChangeNode(11)] }),
                2: emptyGroups({
                    modified: [
                        makeChangeNode(22, { tags: { highway: 'crossing' } }),
                    ],
                }),
                // Changeset 3 is still open and its download is unavailable.
            },
            currentNodesById: { 11: makeCurrentNode(11) },
            currentUser: USER,
            now: NOW,
        });

        assert.equal(model.changesetCount, 1);
        assert.equal(model.sections[0].id, 1);
        assert.equal(model.countsLabel, '1 camera · 1 changeset');
    });

    test('dedupes camera counts for nodes touched by several changesets', () => {
        const model = buildYourEditsModel({
            changesets: [
                makeChangeset(1, { closedAt: isoMinutesAgo(10) }),
                makeChangeset(2, { closedAt: isoMinutesAgo(2000) }),
            ],
            changesetNodesById: {
                1: emptyGroups({
                    modified: [makeChangeNode(11, { version: 2 })],
                }),
                2: emptyGroups({
                    created: [makeChangeNode(11), makeChangeNode(12)],
                }),
            },
            currentNodesById: {
                11: makeCurrentNode(11, { version: 2 }),
                12: makeCurrentNode(12),
            },
            currentUser: USER,
            now: NOW,
        });

        assert.equal(model.sections.length, 2);
        assert.equal(model.sections[0].nodes.length, 1);
        assert.equal(model.sections[1].nodes.length, 2);
        assert.equal(model.cameraCount, 2);
        assert.equal(model.liveCount, 2);
        assert.equal(model.countsLabel, '2 cameras · 2 changesets');
    });

    test('gives repeated nodes the same distinct marker color', () => {
        const model = buildYourEditsModel({
            changesets: [
                makeChangeset(1, { closedAt: isoMinutesAgo(10) }),
                makeChangeset(2, { closedAt: isoMinutesAgo(2000) }),
            ],
            changesetNodesById: {
                1: emptyGroups({
                    modified: [makeChangeNode(11, { version: 2 })],
                }),
                2: emptyGroups({
                    created: [makeChangeNode(11), makeChangeNode(12)],
                }),
            },
            currentNodesById: {
                11: makeCurrentNode(11, { version: 2 }),
                12: makeCurrentNode(12),
            },
            currentUser: USER,
            now: NOW,
        });

        const repeatedNode = model.sections[0].nodes[0];
        const originalNode = model.sections[1].nodes.find(
            (node) => node.id === 11,
        );
        const differentNode = model.sections[1].nodes.find(
            (node) => node.id === 12,
        );

        assert.deepEqual(repeatedNode.markerColor, originalNode.markerColor);
        assert.notDeepEqual(
            repeatedNode.markerColor,
            differentNode.markerColor,
        );
    });

    test('flags nodes whose latest version belongs to another mapper', () => {
        const model = buildYourEditsModel({
            changesets: [makeChangeset(1)],
            changesetNodesById: {
                1: emptyGroups({
                    created: [makeChangeNode(11), makeChangeNode(12)],
                }),
            },
            currentNodesById: {
                11: makeCurrentNode(11, {
                    uid: 777,
                    user: 'osm_sf',
                    version: 2,
                }),
                12: makeCurrentNode(12),
            },
            currentUser: USER,
            now: NOW,
        });

        const [editedByOther, untouched] = model.sections[0].nodes;

        assert.equal(editedByOther.updatedByLabel, 'Updated by @osm_sf');
        assert.equal(editedByOther.refLabel, 'node/11 · v2');
        assert.equal(untouched.updatedByLabel, null);
    });

    test('marks removed nodes and keeps them out of the live count', () => {
        const model = buildYourEditsModel({
            changesets: [makeChangeset(1)],
            changesetNodesById: {
                1: emptyGroups({
                    created: [makeChangeNode(11)],
                    deleted: [
                        makeChangeNode(12, {
                            latitude: 37.1234567,
                            longitude: -122.7654321,
                        }),
                    ],
                }),
            },
            currentNodesById: {
                11: makeCurrentNode(11),
                12: makeCurrentNode(12, {
                    latitude: null,
                    longitude: null,
                    tags: {},
                    uid: 777,
                    user: 'osm_sf',
                    version: 2,
                    visible: false,
                }),
            },
            currentUser: USER,
            now: NOW,
        });

        const removedNode = model.sections[0].nodes.find(
            (node) => node.id === 12,
        );

        assert.equal(removedNode.isRemoved, true);
        // The removed pill replaces the amber "Updated by" pill.
        assert.equal(removedNode.updatedByLabel, null);
        // Display data falls back to the changeset snapshot.
        assert.equal(removedNode.typeLabel, 'ALPR reader · Flock Safety');
        assert.equal(removedNode.subtitle, '37.1235, -122.7654');
        assert.equal(removedNode.refLabel, 'node/12 · v2');

        assert.equal(model.cameraCount, 2);
        assert.equal(model.liveCount, 1);
        assert.equal(model.livePillLabel, '1 live');
    });

    test('classifies tagless changeset entries by their current tags', () => {
        const model = buildYourEditsModel({
            changesets: [makeChangeset(1)],
            changesetNodesById: {
                1: emptyGroups({ deleted: [makeChangeNode(11, { tags: {} })] }),
            },
            currentNodesById: {
                11: makeCurrentNode(11, { visible: false }),
            },
            currentUser: USER,
            now: NOW,
        });

        assert.equal(model.sections.length, 1);
        assert.equal(model.sections[0].nodes[0].isRemoved, true);
    });

    test('returns an empty model when there are no changesets', () => {
        const model = buildYourEditsModel({
            changesets: [],
            changesetNodesById: {},
            currentNodesById: {},
            currentUser: USER,
            now: NOW,
        });

        assert.deepEqual(model.sections, []);
        assert.equal(model.cameraCount, 0);
        assert.equal(model.liveCount, 0);
        assert.equal(model.livePillLabel, '0 live');
        assert.equal(model.countsLabel, '0 cameras · 0 changesets');
    });
});
