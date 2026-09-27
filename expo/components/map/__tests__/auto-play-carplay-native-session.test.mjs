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
const autoPlayAppSource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function readAutoPlaySource(path) {
    return readFileSync(join(autoPlayPackageRoot, path), 'utf8');
}

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.notEqual(start, -1, `Missing source token: ${startToken}`);
    assert.notEqual(end, -1, `Missing source token: ${endToken}`);

    return source.slice(start, end);
}

const hybridMapTemplateSource = readAutoPlaySource(
    'ios/hybrid/HybridMapTemplate.swift',
);
const mapTemplateSource = readAutoPlaySource('ios/templates/MapTemplate.swift');

const mapTemplateWrapperSource = readAutoPlaySource(
    'src/templates/MapTemplate.ts',
);

test('CarPlay distinguishes arrival from cancellation', () => {
    assert.match(
        mapTemplateWrapperSource,
        /enum NavigationStopReason[\s\S]*?Arrived = 0[\s\S]*?Cancelled = 1/,
    );
    assert.match(
        mapTemplateWrapperSource,
        /stopNavigation\(reason = NavigationStopReason\.Cancelled\)[\s\S]*?HybridMapTemplate\.stopNavigation\(this\.id, reason\)/,
    );
    assert.match(
        hybridMapTemplateSource,
        /func stopNavigation\([\s\S]*?reason: NavigationStopReason[\s\S]*?template\.stopNavigation\(reason: reason\)/,
    );
    assert.match(
        mapTemplateSource,
        /func stopNavigation\(reason: NavigationStopReason = \.cancelled\)[\s\S]*?case \.arrived:[\s\S]*?finishTrip\(\)[\s\S]*?case \.cancelled:[\s\S]*?cancelTrip\(\)/,
    );

    assert.match(
        autoPlayAppSource,
        /navigationStopReason === 'arrived'[\s\S]*?NavigationStopReason\?\.Arrived[\s\S]*?NavigationStopReason\?\.Cancelled[\s\S]*?rootMapTemplate\.stopNavigation\(nativeStopReason\)/,
    );
    assert.equal(
        autoPlayAppSource.match(/navigationStopReason:\s*'arrived'/g)?.length,
        2,
    );
});

test('navigation setup failures cancel any native session that may have started', () => {
    const cancelNativeNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function cancelNativeAutoPlayNavigation(',
        'async function stopAutoPlayNavigation(',
    );
    const startNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function startAutoPlayNavigation(',
        'function handleRootHeaderPrimaryLocationPress(',
    );

    assert.match(
        cancelNativeNavigationSource,
        /mapTemplate\.stopNavigation\(NavigationStopReason\?\.Cancelled \?\? 1\)/,
    );
    assert.match(
        startNavigationSource,
        /let nativeNavigationMayBeActive = hostNavigationAlreadyStarted/,
    );
    assert.match(
        startNavigationSource,
        /const tripConfig = makeTripConfig\(route\);\s*nativeNavigationMayBeActive = true;\s*await rootMapTemplate\.startNavigation\(tripConfig\)/,
    );
    assert.match(
        startNavigationSource,
        /const rollbackNavigationStart =[\s\S]*?if \(nativeNavigationMayBeActive\) \{\s*cancelNativeAutoPlayNavigation\(rootMapTemplate\);\s*\}[\s\S]*?catch \(error\) \{\s*rollbackNavigationStart\(error\);\s*\}/,
    );
    assert.match(
        startNavigationSource,
        /stopAutoPlayNavigation\(\{\s*notifyTemplate: false,\s*publishSharedState,\s*\}\)[\s\S]*?showAutoPlayError/,
    );
});
