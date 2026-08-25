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

    test('describes every exposure-tracked drive source accurately', () => {
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');
        const timelineSource = readSource('../scorecard-timeline-screen.js');

        assert.match(dashboardSource, /Record DAF drives/);
        assert.match(dashboardSource, /Exposure tracking runs during guided/);
        assert.match(dashboardSource, /phone-started Free Drive/);
        assert.match(
            dashboardSource,
            /Android\s+Auto or CarPlay[\s\S]*?vehicle\s+is moving/,
        );
        assert.match(
            dashboardSource,
            /Parked-only connections[\s\S]*?not\s+saved/,
        );
        assert.match(timelineSource, /your recorded DAF drives/);
        assert.match(timelineSource, /only during recorded DAF drives/);
        assert.match(timelineSource, /expire after 30 days/);
        assert.doesNotMatch(
            `${dashboardSource}\n${timelineSource}`,
            /explicit DAF drives|Guided and user-started free drives only/,
        );
    });

    test('opens the exposure timeline from the crossings tile', () => {
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');

        assert.match(
            dashboardSource,
            /label="crossings"[\s\S]*?onPress=\{\(\) => router\.push\('\/scorecard\/timeline'\)\}/,
        );
    });

    test('keeps camera inventory diagnostics out of the game UI', () => {
        const arrivalSource = readSource('../scorecard-arrival-recap.js');
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');

        assert.doesNotMatch(dashboardSource, /coverage|inventory/i);
        assert.doesNotMatch(arrivalSource, /coverage|inventory/i);
        assert.doesNotMatch(dashboardSource, /debugOverlayIsVisible/);
        assert.doesNotMatch(arrivalSource, /debugOverlayIsVisible/);
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

    test('offers explicit scorecard backup and destructive restore actions', () => {
        const dashboardSource = readSource('../scorecard-dashboard-screen.js');
        const iconPathsSource = readSource('../../design-system/icon-paths.js');

        assert.match(dashboardSource, /scorecard-export-backup/);
        assert.match(dashboardSource, /scorecard-import-backup/);
        assert.match(iconPathsSource, /download:/);
        assert.match(dashboardSource, /Import and replace/);
        assert.match(dashboardSource, /currently stored on this device/);
        assert.match(
            dashboardSource,
            /Backup files are not encrypted after export/,
        );
        assert.match(dashboardSource, /DAF never uploads the/);
        assert.match(
            dashboardSource,
            /Boolean\(scorecardState\.activeSession\)/,
        );
    });
});
