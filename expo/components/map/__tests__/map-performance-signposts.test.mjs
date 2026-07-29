import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const signpostSource = readSource('../map-performance-signposts.js');
const electronicHorizonAlertsApiSource = readSource(
    '../electronic-horizon-alerts-api.js',
);
const upcomingAlertsSource = readSource(
    '../use-upcoming-electronic-horizon-alerts.js',
);
const mapCanvasSource = readSource('../map-canvas.js');
const roadMatchingSessionSource = readSource('../road-matching-session.js');
const mapLocationPuckIOSSource = readSource(
    '../../../modules/map-location-puck/ios/MapLocationPuckModule.swift',
);

describe('iOS map performance signposts', () => {
    test('uses the local native module only on iOS', () => {
        assert.match(signpostSource, /Platform\.OS === 'ios'/);
        assert.match(
            signpostSource,
            /requireOptionalNativeModule\('MapLocationPuck'\)/,
        );
        assert.match(signpostSource, /slice\(0, 160\)/);
    });

    test('brackets ALPR requests and response decoding', () => {
        assert.match(
            electronicHorizonAlertsApiSource,
            /import \{ fetch as expoFetch \} from 'expo\/fetch'/,
        );
        assert.match(electronicHorizonAlertsApiSource, /await expoFetch\(/);
        assert.match(
            electronicHorizonAlertsApiSource,
            /beginMapPerformanceSignpost\('alpr\.request'/,
        );
        assert.match(
            electronicHorizonAlertsApiSource,
            /endMapPerformanceSignpost\('alpr\.request'/,
        );
        assert.match(
            electronicHorizonAlertsApiSource,
            /beginMapPerformanceSignpost\(\s*'alpr\.response\.decode'/,
        );
        assert.match(
            electronicHorizonAlertsApiSource,
            /recordMapPerformanceSignpost\('alpr\.response\.normalized'/,
        );
    });

    test('records alert computation and committed ShapeSource changes', () => {
        assert.match(
            upcomingAlertsSource,
            /recordMapPerformanceSignpost\('alerts\.compute\.completed'/,
        );
        assert.match(upcomingAlertsSource, /pathSource,/);
        assert.match(mapCanvasSource, /useMapboxShapeSourceSignpost\(/);
        assert.match(mapCanvasSource, /'mapbox\.shape-source\.committed'/);
        assert.match(
            mapCanvasSource,
            /markerClustersEnabled \? 'markers-clustered' : 'markers'/,
        );
        assert.match(mapCanvasSource, /source: 'directions-route'/);
    });

    test('records slow road work and brackets graph refresh work', () => {
        assert.match(
            roadMatchingSessionSource,
            /SLOW_MAP_PIPELINE_OPERATION_THRESHOLD_MS = 8/,
        );
        assert.match(
            roadMatchingSessionSource,
            /matcherDurationMs >= SLOW_MAP_PIPELINE_OPERATION_THRESHOLD_MS/,
        );
        assert.match(
            roadMatchingSessionSource,
            /recordMapPerformanceSignpost\('road\.matcher\.slow'/,
        );
        assert.match(
            roadMatchingSessionSource,
            /beginMapPerformanceSignpost\(\s*'road\.graph\.request'/,
        );
        assert.match(
            roadMatchingSessionSource,
            /beginMapPerformanceSignpost\(\s*'road\.graph\.build'/,
        );
        assert.match(
            roadMatchingSessionSource,
            /beginMapPerformanceSignpost\(\s*'road\.matcher\.history_replay'/,
        );
        assert.match(
            roadMatchingSessionSource,
            /predictionDurationMs >= SLOW_MAP_PIPELINE_OPERATION_THRESHOLD_MS/,
        );
        assert.match(
            roadMatchingSessionSource,
            /recordMapPerformanceSignpost\('road\.look_ahead\.slow'/,
        );
        assert.match(
            roadMatchingSessionSource,
            /const handleRequestAbort = \(\) => \{[\s\S]*?endRequestSignpost/,
        );
        assert.match(
            roadMatchingSessionSource,
            /requestAbortController\.signal\.addEventListener\([\s\S]*?handleRequestAbort/,
        );
    });

    test('emits Instruments Points of Interest signposts natively', () => {
        assert.match(mapLocationPuckIOSSource, /category: "PointsOfInterest"/);
        assert.match(
            mapLocationPuckIOSSource,
            /Function\("beginMapPerformanceSignpost"\)/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /Function\("endMapPerformanceSignpost"\)/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /Function\("recordMapPerformanceSignpost"\)/,
        );
        assert.match(mapLocationPuckIOSSource, /os_signpost\(/);
    });
});
