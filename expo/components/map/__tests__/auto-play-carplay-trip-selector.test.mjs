import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );

const mapTemplateSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/templates/MapTemplate.swift'),
    'utf8',
);
const parserSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/templates/Parser.swift'),
    'utf8',
);

test('CarPlay republishes trip selection when its route changes', () => {
    assert.match(mapTemplateSource, /var currentRouteId: String\?/);
    assert.match(
        mapTemplateSource,
        /currentTripId == tripId && currentRouteId == routeId/,
    );
    assert.match(mapTemplateSource, /currentRouteId = routeId/);
    assert.match(mapTemplateSource, /currentRouteId = nil/);
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
});
