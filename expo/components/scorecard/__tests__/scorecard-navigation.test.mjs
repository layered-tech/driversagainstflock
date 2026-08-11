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
});
