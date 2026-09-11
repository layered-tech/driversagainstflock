import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getScorecardExposureDriveGroup,
    getScorecardExposureDriveGroups,
} from '../scorecard-drive-exposures.js';

function makeExposure({ certainty = 'confirmed', id, occurredAt, sessionId }) {
    return {
        cameraCoordinate: [-97.75 + (occurredAt % 10_000) / 10_000_000, 30.26],
        certainty,
        id,
        occurredAt,
        sessionId,
    };
}

describe('scorecard exposure drive groups', () => {
    test('keeps same-day drives distinct and isolates either selected drive', () => {
        const day = new Date(2026, 7, 29).getTime();
        const firstDriveExposures = [
            makeExposure({
                id: 'first-confirmed',
                occurredAt: day + 8 * 60 * 60 * 1000,
                sessionId: 'drive-one',
            }),
            makeExposure({
                certainty: 'possible',
                id: 'first-possible',
                occurredAt: day + 8.5 * 60 * 60 * 1000,
                sessionId: 'drive-one',
            }),
        ];
        const secondDriveExposures = [
            makeExposure({
                id: 'second-later',
                occurredAt: day + 18.5 * 60 * 60 * 1000,
                sessionId: 'drive-two',
            }),
            makeExposure({
                id: 'second-earlier',
                occurredAt: day + 18 * 60 * 60 * 1000,
                sessionId: 'stale-session-id',
            }),
        ];
        const trips = [
            {
                endedAt: day + 9 * 60 * 60 * 1000,
                exposureEventIds: firstDriveExposures.map(({ id }) => id),
                id: 'drive-one',
                mode: 'free',
                startedAt: day + 7.5 * 60 * 60 * 1000,
            },
            {
                endedAt: day + 19 * 60 * 60 * 1000,
                exposureEventIds: secondDriveExposures.map(({ id }) => id),
                id: 'drive-two',
                mode: 'guided',
                startedAt: day + 17.5 * 60 * 60 * 1000,
            },
        ];
        const state = {
            activeSession: null,
            exposures: [
                secondDriveExposures[0],
                firstDriveExposures[1],
                secondDriveExposures[1],
                firstDriveExposures[0],
            ],
            trips,
        };

        const groups = getScorecardExposureDriveGroups(state);

        assert.deepEqual(
            groups.map(({ driveId }) => driveId),
            ['drive-two', 'drive-one'],
        );
        assert.deepEqual(
            groups[0].exposures.map(({ id }) => id),
            ['second-earlier', 'second-later'],
        );
        assert.equal(groups[0].confirmedCount, 2);
        assert.equal(groups[0].possibleCount, 0);
        assert.equal(groups[1].confirmedCount, 1);
        assert.equal(groups[1].possibleCount, 1);

        const firstSelection = getScorecardExposureDriveGroup(
            state,
            'drive-one',
        );
        const secondSelection = getScorecardExposureDriveGroup(
            state,
            'drive-two',
        );

        assert.deepEqual(
            firstSelection.exposures.map(({ id }) => id),
            ['first-confirmed', 'first-possible'],
        );
        assert.deepEqual(
            secondSelection.exposures.map(({ id }) => id),
            ['second-earlier', 'second-later'],
        );
    });

    test('keeps possible-only and unfinished sessions visible', () => {
        const exposures = [
            makeExposure({
                certainty: 'possible',
                id: 'active-possible',
                occurredAt: 3_000,
                sessionId: 'active-drive',
            }),
            makeExposure({
                id: 'interrupted-confirmed',
                occurredAt: 2_000,
                sessionId: 'interrupted-drive',
            }),
        ];
        const groups = getScorecardExposureDriveGroups({
            activeSession: {
                id: 'active-drive',
                mode: 'free',
                startedAt: 1_000,
            },
            exposures,
            trips: [],
        });

        assert.equal(groups.length, 2);
        assert.equal(groups[0].driveId, 'active-drive');
        assert.equal(groups[0].active, true);
        assert.equal(groups[0].possibleCount, 1);
        assert.equal(groups[0].confirmedCount, 0);
        assert.equal(groups[1].driveId, 'interrupted-drive');
        assert.equal(groups[1].active, false);
        assert.equal(groups[1].trip, null);
    });
});
