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

const parserSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/Parser.kt',
    ),
    'utf8',
);
const tripPreviewSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/TripPreviewTemplate.kt',
    ),
    'utf8',
);

test('Android Auto formats arrival time using the user clock and route timezone', () => {
    assert.doesNotMatch(parserSource, /SimpleDateFormat\("HH:mm"/);
    assert.match(parserSource, /DateFormat\.getTimeFormat\(context\)/);
    assert.match(parserSource, /Calendar\.getInstance\(timeZone\)/);
    assert.match(parserSource, /this\.timeZone = timeZone/);
    assert.match(
        tripPreviewSource,
        /Parser\.formatToTimestamp\(\s*carContext,/,
    );
});
