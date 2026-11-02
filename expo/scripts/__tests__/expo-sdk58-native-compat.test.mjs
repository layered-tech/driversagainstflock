import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
    configureCompilerCompatPodfile,
    fixConsumingErrorPattern,
    fixMapboxLayoutMetrics,
} = require('../../plugins/withExpoSdk58Compat.js');

test('moves error type erasure out of the consuming result pattern', () => {
    const source = `        switch consume result {
        case .success(let value):
          promise.resolve(value)
        case .failure(let error as any Error):
          promise.reject(error)
        }`;
    const fixed = fixConsumingErrorPattern(source);
    assert.equal(
        fixed,
        `        switch consume result {
        case .success(let value):
          promise.resolve(value)
        case .failure(let error):
          promise.reject(error as any Error)
        }`,
    );
    assert.equal(fixConsumingErrorPattern(fixed), fixed);
});

test('leaves an upstream implementation without the affected pattern unchanged', () => {
    const source = 'case .failure(let error): promise.reject(error)';
    assert.equal(fixConsumingErrorPattern(source), source);
});

test('CocoaPods reapplies compatibility after a clean EAS dependency install', () => {
    const podfile = "prepare_react_native_project!\n\ntarget 'App' do\nend\n";
    const configured = configureCompilerCompatPodfile(podfile);
    assert.equal(configureCompilerCompatPodfile(configured), configured);
    assert.match(
        configured,
        /unless system\('node', File.expand_path\('\.\.\/plugins\/withExpoSdk58Compat.js', __dir__\)/,
    );
    assert.ok(
        configured.indexOf('unless system') <
            configured.indexOf("target 'App'"),
    );
});

test('Mapbox retains all layout metrics when React Native adds new fields', () => {
    const source = `LayoutMetrics newLayoutMetrics = LayoutMetrics{
        RCTRectFromCGRect(next),
        layoutMetrics.contentInsets,
        layoutMetrics.borderWidth,
        layoutMetrics.displayType,
        layoutMetrics.positionType,
        layoutMetrics.layoutDirection,
        layoutMetrics.wasLeftAndRightSwapped,
        layoutMetrics.pointScaleFactor,
        layoutMetrics.overflowInset
    };`;
    const fixed = fixMapboxLayoutMetrics(source);
    assert.equal(
        fixed,
        'LayoutMetrics newLayoutMetrics = layoutMetrics;\n    newLayoutMetrics.frame = RCTRectFromCGRect(next);',
    );
    assert.equal(fixMapboxLayoutMetrics(fixed), fixed);
});
