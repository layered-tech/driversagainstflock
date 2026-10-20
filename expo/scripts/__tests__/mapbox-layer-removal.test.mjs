import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const source = readFileSync(
    new URL(
        '../../node_modules/@rnmapbox/maps/ios/RNMBX/RNMBXLayer.swift',
        import.meta.url,
    ),
    'utf8',
);
const removal = source.match(
    /  private func removeFromMap\(_ style: Style\) \{[\s\S]*?\n  \}/,
)?.[0];
const layerExists = source.match(
    /func styleLayerExists\(_ style: Style, id: String\) -> Bool \{[\s\S]*?\n\}/,
)?.[0];
assert.ok(removal);
assert.ok(layerExists);

// Execute the installed Swift cleanup method against a fake Mapbox style.
const directory = mkdtempSync(path.join(tmpdir(), 'mapbox-layer-removal-'));
let scenarios;
try {
    const scriptPath = path.join(directory, 'main.swift');
    writeFileSync(
        scriptPath,
        `
import Foundation

extension String.StringInterpolation {
  mutating func appendInterpolation(optional value: String?) {
    appendInterpolation(value ?? "nil")
  }
}
enum Level { case warn, error }
enum Logger {
  static var errors = 0
  static func log(level: Level, message: String) {
    if level == .error { errors += 1 }
  }
}
final class Style {
  var exists: Bool
  var fails: Bool
  var removals = 0
  init(exists: Bool, fails: Bool = false) {
    self.exists = exists
    self.fails = fails
  }
  func layerExists(withId id: String) -> Bool { exists }
  func removeLayer(withId id: String) throws {
    removals += 1
    if !exists || fails { throw NSError(domain: "Mapbox", code: 1) }
    exists = false
  }
}
${layerExists}
final class Layer {
  var id: String! = "map-markers-clustered-cone-coneDirection0"
  var waitingForID: String? = nil
${removal}
  func remove(_ style: Style) { removeFromMap(style) }
}
var results: [[Int]] = []
for (exists, fails, repeats) in [
  (false, false, 1),
  (true, false, 1),
  (true, false, 2),
  (true, true, 1)
] {
  Logger.errors = 0
  let style = Style(exists: exists, fails: fails)
  let layer = Layer()
  for _ in 0..<repeats { layer.remove(style) }
  results.append([style.removals, Logger.errors])
}
print(String(data: try JSONSerialization.data(withJSONObject: results), encoding: .utf8)!)
`,
    );
    scenarios = JSON.parse(
        execFileSync(
            'swift',
            ['-module-cache-path', path.join(directory, 'cache'), scriptPath],
            { encoding: 'utf8', timeout: 60000 },
        ),
    );
} finally {
    rmSync(directory, { recursive: true, force: true });
}

test('iOS cleanup skips an already absent layer without logging an error', () => {
    assert.deepEqual(scenarios[0], [0, 0]);
});

test('iOS cleanup removes an existing layer', () => {
    assert.deepEqual(scenarios[1], [1, 0]);
});

test('iOS cleanup tolerates repeated removal of the same layer', () => {
    assert.deepEqual(scenarios[2], [1, 0]);
});

test('iOS cleanup still logs removal failures for existing layers', () => {
    assert.deepEqual(scenarios[3], [1, 1]);
});
