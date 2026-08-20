import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('scorecard navigation', () => {
    test('returns detail and trail subpages to the exposure timeline', () => {
        const headerSource = readSource('../scorecard-screen-header.js');
        const detailSource = readSource('../scorecard-event-detail-screen.js');
        const timelineSource = readSource('../scorecard-timeline-screen.js');
        const trailSource = readSource('../scorecard-trail-screen.js');

        assert.match(
            headerSource,
            /backRoute[\s\S]*?navigation\.popTo\(backRoute\)/,
        );
        assert.match(detailSource, /backRoute="timeline"/);
        assert.match(timelineSource, /backRoute="index"/);
        assert.match(trailSource, /backRoute="timeline"/);
    });

    test('gives timeline events platform-stable accessibility labels', () => {
        const timelineSource = readSource('../scorecard-timeline-screen.js');

        assert.match(
            timelineSource,
            /accessibilityLabel=\{`\$\{event\.label\}, \$\{eventSummary\}`\}/,
        );
        assert.match(
            timelineSource,
            /accessibilityLabel=\{`\$\{event\.label\}, \$\{getEventSummary\(event\)\}`\}/,
        );
    });

    test('uses real camera maps without linking exposure detail back to Hotlist', () => {
        const detailSource = readSource('../scorecard-event-detail-screen.js');
        const mapSource = readSource('../scorecard-map.js');
        const trailSource = readSource('../scorecard-trail-screen.js');

        assert.match(detailSource, /ScorecardExposureMap/);
        assert.doesNotMatch(
            detailSource,
            /Open Hotlist|router\.push\('\/hotlist'/,
        );
        assert.match(trailSource, /ScorecardExposureMap/);
        assert.match(trailSource, /getDirections/);
        assert.match(trailSource, /lineCollection={trailLineCollection}/);
        assert.match(mapSource, /NativeWindMapView/);
        assert.match(mapSource, /Mapbox\.FillLayer/);
        assert.match(mapSource, /Mapbox\.LineLayer/);
        assert.match(mapSource, /Mapbox\.CircleLayer/);
        assert.match(mapSource, /fillEmissiveStrength/);
        assert.match(mapSource, /lineEmissiveStrength/);
        assert.match(mapSource, /circleEmissiveStrength/);
        assert.match(mapSource, /textEmissiveStrength/);
        assert.match(detailSource, /showCones/);
    });

    test('mounts the arrival recap above every app route', () => {
        const mapScreenSource = readSource('../../map-screen.js');
        const rootLayoutSource = readSource('../../../app/_layout.js');

        assert.doesNotMatch(mapScreenSource, /<ScorecardArrivalRecap/);
        assert.match(
            rootLayoutSource,
            /<Drawer[\s\S]*?<ScorecardArrivalRecap \/>/,
        );
    });
});
