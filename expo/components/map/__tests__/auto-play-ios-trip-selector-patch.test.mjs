import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/MapTemplate.swift',
        import.meta.url,
    ),
    'utf8',
);
const parserSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/Parser.swift',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayPatch = readFileSync(
    new URL(
        '../../../patches/@iternio+react-native-auto-play+0.4.7.patch',
        import.meta.url,
    ),
    'utf8',
);

test('CarPlay republishes selection when a route changes within one trip', () => {
    for (const source of [mapTemplateSource, autoPlayPatch]) {
        assert.match(source, /var currentRouteId: String\?/);
        assert.match(
            source,
            /currentTripId == tripId && currentRouteId == routeId/,
        );
        assert.match(source, /currentRouteId = routeId/);
        assert.match(source, /currentRouteId = nil/);
    }
});

test('CarPlay leaves route estimates in the dedicated preview fields', () => {
    assert.doesNotMatch(parserSource, /let travelEstimate = parseText/);
    assert.doesNotMatch(parserSource, /text \+ "\\n " \+ travelEstimate/);
    assert.match(
        parserSource,
        /additionalInformationVariants\.flatMap[\s\S]*?summary \+ "\\n" \+ selection/,
    );
    assert.match(
        parserSource,
        /additionalInformationVariants: additionalInformationVariants/,
    );
    assert.match(
        parserSource,
        /selectionSummaryVariants: routeChoice\.selectionSummaryVariants/,
    );

    assert.match(autoPlayPatch, /-\s*let travelEstimate = parseText/);
    assert.match(
        autoPlayPatch,
        /\+\s*selectionSummaryVariants: routeChoice\.selectionSummaryVariants/,
    );
});
