import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('scorecard dashboard interactions', () => {
    test('keeps the XP panel concise and labels the drive streak', () => {
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');

        assert.doesNotMatch(dashboardSource, /Score = 100/);
        assert.doesNotMatch(dashboardSource, /on this device only/);
        assert.match(dashboardSource, /subtitle="Last 30 days"/);
        assert.match(dashboardSource, /label="drive streak"/);
        assert.match(dashboardSource, /windowStats\.cleanDriveStreak/);
    });

    test('opens the exposure timeline from the reads tile', () => {
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');

        assert.match(
            dashboardSource,
            /label="reads"[\s\S]*?onPress=\{\(\) => router\.push\('\/scorecard\/timeline'\)\}/,
        );
    });

    test('shows an edit handle and opens custom fuel inputs from the privacy cost card', () => {
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');
        const modalSource = readSource('../scorecard-fuel-settings-modal.js');

        assert.match(dashboardSource, /onLongPress=/);
        assert.match(dashboardSource, /onPress=/);
        assert.match(
            dashboardSource,
            /scorecard-privacy-costs-edit-handle[\s\S]*?name="pencil"/,
        );
        assert.doesNotMatch(
            dashboardSource,
            /recalculate retained estimates|Each trip uses the Regular average/,
        );
        assert.match(dashboardSource, /ScorecardFuelSettingsModal/);
        assert.match(modalSource, /scorecard-fuel-mpg-input/);
        assert.match(modalSource, /scorecard-fuel-price-input/);
        assert.match(modalSource, /scorecard-fuel-settings-reset/);
    });
});
