import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    formatUpcomingAlertAge,
    formatUpcomingAlertDistance,
    getNextUpcomingAlert,
    getUpcomingAlertPassProgress,
    getUpcomingAlertPresentation,
    getVisibleUpcomingAlerts,
} from '../driving-alerts.js';

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

    test('maps the remaining alert distance to a one-mile pass timer', () => {
        assert.equal(getUpcomingAlertPassProgress(1609.344), 1);
        assert.equal(getUpcomingAlertPassProgress(804.672), 0.5);
        assert.equal(getUpcomingAlertPassProgress(0), 0);
        assert.equal(getUpcomingAlertPassProgress(-1), 0);
        assert.equal(getUpcomingAlertPassProgress(2000), 1);
        assert.equal(getUpcomingAlertPassProgress('invalid'), 0);
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

    test('surfaces an additional alert of the other type in the card subtitle', () => {
        const primaryAlert = {
            distanceMeters: 244,
            id: 'police',
            subtitle: 'Reported on Waze 4 min ago',
            type: 'police',
        };
        const followingAlert = {
            distanceMeters: 1931,
            id: 'camera',
            type: 'alpr',
        };
        const presentation = getUpcomingAlertPresentation(
            primaryAlert,
            followingAlert,
        );

        assert.equal(presentation.title, 'Police reported ahead');
        assert.equal(presentation.distance, '801 ft');
        assert.equal(
            presentation.subtitle,
            'Reported on Waze 4 min ago. ALPR camera 1.2 mi ahead',
        );
        assert.equal(
            getNextUpcomingAlert(primaryAlert, [
                primaryAlert,
                { id: 'another-police', type: 'police' },
                followingAlert,
            ]),
            followingAlert,
        );
    });
});
