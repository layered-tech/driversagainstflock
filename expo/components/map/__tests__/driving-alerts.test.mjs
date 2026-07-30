import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    formatUpcomingAlertAge,
    formatUpcomingAlertDistance,
    getDrivingAlertsPresentation,
    getUpcomingAlertApproachProgress,
    getUpcomingAlertPassProgress,
    getVisibleUpcomingAlerts,
} from '../driving-alerts.js';
import { getUpcomingElectronicHorizonAlerts } from '../electronic-horizon.js';

describe('driving alert presentation', () => {
    test('formats short and long upcoming distances for the driving card', () => {
        assert.equal(formatUpcomingAlertDistance(244), '801 ft');
        assert.equal(formatUpcomingAlertDistance(1931), '1.2 mi');
        assert.equal(formatUpcomingAlertDistance(-1), null);
    });

    test('formats Waze report ages without exposing invalid timestamps', () => {
        const now = Date.parse('2026-07-12T12:00:00.000Z');

        assert.equal(
            formatUpcomingAlertAge('2026-07-12T11:56:00.000Z', now),
            '4 min ago',
        );
        assert.equal(
            formatUpcomingAlertAge('2026-07-12T10:00:00.000Z', now),
            '2 hrs ago',
        );
        assert.equal(formatUpcomingAlertAge('not-a-date', now), null);
    });

    test('maps the remaining alert distance to a two-mile pass timer', () => {
        assert.equal(getUpcomingAlertPassProgress(3218.688), 1);
        assert.equal(getUpcomingAlertPassProgress(1609.344), 0.5);
        assert.equal(getUpcomingAlertPassProgress(0), 0);
        assert.equal(getUpcomingAlertPassProgress(-1), 0);
        assert.equal(getUpcomingAlertPassProgress(4000), 1);
        assert.equal(getUpcomingAlertPassProgress('invalid'), 0);
    });

    test('maps the alert distance to a fill that grows while approaching', () => {
        assert.equal(getUpcomingAlertApproachProgress(3218.688), 0);
        assert.equal(getUpcomingAlertApproachProgress(1609.344), 0.5);
        assert.equal(getUpcomingAlertApproachProgress(0), 1);
        assert.equal(getUpcomingAlertApproachProgress(-1), 1);
        assert.equal(getUpcomingAlertApproachProgress(4000), 0);
        assert.equal(getUpcomingAlertApproachProgress('invalid'), 0);
    });

    test('keeps only known alert types and skips locally dismissed alerts', () => {
        const alerts = [
            { id: 'police', type: 'police' },
            { id: 'camera', type: 'alpr' },
            { id: 'other', type: 'construction' },
        ];

        assert.deepEqual(
            getVisibleUpcomingAlerts(alerts, new Set(['police'])),
            [{ id: 'camera', type: 'alpr' }],
        );
    });

    test('creates a compact police-only presentation from the normalized Waze source', () => {
        const presentation = getDrivingAlertsPresentation(
            [
                {
                    distanceMeters: 1609.344,
                    id: 'police',
                    source: {
                        publishedAt: '2026-07-12T11:56:00.000Z',
                    },
                    type: 'police',
                },
            ],
            new Set(),
            Date.parse('2026-07-12T12:00:00.000Z'),
        );

        assert.equal(presentation.variant, 'single');
        assert.deepEqual(presentation.dismissalAlertIds, ['police']);
        assert.deepEqual(
            presentation.alerts.map(
                ({ approachProgress, distance, subtitle, title, type }) => ({
                    approachProgress,
                    distance,
                    subtitle,
                    title,
                    type,
                }),
            ),
            [
                {
                    approachProgress: 0.5,
                    distance: '1 mi',
                    subtitle: 'Waze · 4 min ago',
                    title: 'Police reported',
                    type: 'police',
                },
            ],
        );
    });

    test('keeps the Waze source line safe when its normalized timestamp is invalid', () => {
        const presentation = getDrivingAlertsPresentation(
            [
                {
                    distanceMeters: 100,
                    id: 'police',
                    publishedAt: '2026-07-12T11:56:00.000Z',
                    source: {
                        publishedAt: 'not-a-date',
                    },
                    type: 'police',
                },
            ],
            undefined,
            Date.parse('2026-07-12T12:00:00.000Z'),
        );

        assert.equal(presentation.alerts[0].subtitle, 'Waze · 4 min ago');
    });

    test('creates an ALPR-only presentation from its existing source metadata', () => {
        const presentation = getDrivingAlertsPresentation([
            {
                distanceMeters: 483,
                id: 'camera',
                source: {
                    tags: {
                        manufacturer: 'Flock Safety',
                    },
                },
                type: 'alpr',
            },
        ]);

        assert.equal(presentation.variant, 'single');
        assert.deepEqual(presentation.dismissalAlertIds, ['camera']);
        assert.equal(presentation.alerts[0].distance, '0.3 mi');
        assert.equal(presentation.alerts[0].subtitle, 'Flock · on your route');
        assert.equal(presentation.alerts[0].title, 'ALPR camera');
    });

    test('selects the closest alert of each type and keeps police first in combined mode', () => {
        const policeFar = {
            distanceMeters: 1400,
            id: 'police-far',
            type: 'police',
        };
        const alprNear = {
            distanceMeters: 300,
            id: 'alpr-near',
            subtitle: 'Flock',
            type: 'alpr',
        };
        const policeNear = {
            distanceMeters: 800,
            id: 'police-near',
            type: 'police',
        };
        const alprFar = {
            distanceMeters: 1200,
            id: 'alpr-far',
            subtitle: 'Other camera',
            type: 'alpr',
        };
        const presentation = getDrivingAlertsPresentation([
            policeFar,
            alprNear,
            policeNear,
            alprFar,
        ]);

        assert.equal(presentation.variant, 'combined');
        assert.deepEqual(presentation.dismissalAlertIds, [
            'police-near',
            'alpr-near',
        ]);
        assert.deepEqual(
            presentation.alerts.map(({ alert, id, type }) => ({
                alert,
                id,
                type,
            })),
            [
                { alert: policeNear, id: 'police-near', type: 'police' },
                { alert: alprNear, id: 'alpr-near', type: 'alpr' },
            ],
        );
    });

    test('maps Electronic Horizon alert sources into the compact combined card', () => {
        const alerts = getUpcomingElectronicHorizonAlerts({
            alprNodes: [
                {
                    coordinate: [-97.7381, 30.2672],
                    id: 'flock-reader',
                    tags: { manufacturer: 'Flock Safety' },
                },
            ],
            pathCoordinates: [
                [-97.7431, 30.2672],
                [-97.7331, 30.2672],
            ],
            policeAlerts: [
                {
                    coordinate: [-97.735, 30.2672],
                    id: 'waze-police',
                    publishedAt: '2026-07-12T11:56:00.000Z',
                    street: 'West Sixth Street',
                },
            ],
        });
        const presentation = getDrivingAlertsPresentation(
            alerts,
            new Set(),
            Date.parse('2026-07-12T12:00:00.000Z'),
        );

        assert.deepEqual(
            alerts.map(({ source, type }) => ({
                source:
                    type === 'police'
                        ? source.publishedAt
                        : source.tags.manufacturer,
                type,
            })),
            [
                { source: 'Flock Safety', type: 'alpr' },
                { source: '2026-07-12T11:56:00.000Z', type: 'police' },
            ],
        );
        assert.equal(presentation.variant, 'combined');
        assert.deepEqual(
            presentation.alerts.map(({ subtitle, title, type }) => ({
                subtitle,
                title,
                type,
            })),
            [
                {
                    subtitle: 'Waze · 4 min ago',
                    title: 'Police reported',
                    type: 'police',
                },
                {
                    subtitle: 'Flock · on your route',
                    title: 'ALPR camera',
                    type: 'alpr',
                },
            ],
        );
    });

    test('replaces dismissed displayed alerts with the next eligible alert of that type', () => {
        const alerts = [
            { distanceMeters: 300, id: 'police-near', type: 'police' },
            { distanceMeters: 600, id: 'police-next', type: 'police' },
            { distanceMeters: 400, id: 'alpr-near', type: 'alpr' },
        ];
        const combinedPresentation = getDrivingAlertsPresentation(alerts);
        const replacementPresentation = getDrivingAlertsPresentation(
            alerts,
            new Set(['police-near', 'alpr-near']),
        );

        assert.deepEqual(combinedPresentation.dismissalAlertIds, [
            'police-near',
            'alpr-near',
        ]);
        assert.equal(replacementPresentation.variant, 'single');
        assert.deepEqual(replacementPresentation.dismissalAlertIds, [
            'police-next',
        ]);
    });
});
