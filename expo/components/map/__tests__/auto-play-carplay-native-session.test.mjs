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

test('CarPlay app stops through the upstream no-argument API', () => {
    assert.match(
        mapTemplateWrapperSource,
        /stopNavigation\(\)[\s\S]*?HybridMapTemplate\.stopNavigation\(this\.id\)/,
    );
    assert.match(
        hybridMapTemplateSource,
        /func stopNavigation\(templateId: String\)[\s\S]*?template\.stopNavigation\(\)/,
    );
    assert.match(
        mapTemplateSource,
        /func stopNavigation\(\)[\s\S]*?navigationSession\?\.finishTrip\(\)/,
    );

    assert.match(
        autoPlayAppSource,
        /if \(notifyTemplate && rootMapTemplate\)[\s\S]*?rootMapTemplate\.stopNavigation\(\)/,
    );
    assert.equal(autoPlayAppSource.match(/statusLabel: 'Arrived'/g)?.length, 2);
});

test('navigation setup failures stop any native session that may have started', () => {
    const cancelNativeNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function stopNativeAutoPlayNavigation(',
        'async function stopAutoPlayNavigation(',
    );
    const startNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function startAutoPlayNavigation(',
        'function handleRootHeaderPrimaryLocationPress(',
    );

    assert.match(
        cancelNativeNavigationSource,
        /mapTemplate\.stopNavigation\(\)/,
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
        /const rollbackNavigationStart =[\s\S]*?if \(nativeNavigationMayBeActive\) \{\s*stopNativeAutoPlayNavigation\(rootMapTemplate\);\s*\}[\s\S]*?catch \(error\) \{\s*rollbackNavigationStart\(error\);\s*\}/,
    );
    assert.match(
        startNavigationSource,
        /stopAutoPlayNavigation\(\{\s*notifyTemplate: false,\s*publishSharedState,\s*\}\)[\s\S]*?showAutoPlayError/,
    );
});
