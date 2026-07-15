import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const parserSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/Parser.kt',
        import.meta.url,
    ),
    'utf8',
);
const tripPreviewSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/TripPreviewTemplate.kt',
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

test('Android Auto formats arrival time with the user clock and route timezone', () => {
    assert.doesNotMatch(parserSource, /SimpleDateFormat\("HH:mm"/);
    assert.match(parserSource, /DateFormat\.getTimeFormat\(context\)/);
    assert.match(parserSource, /Calendar\.getInstance\(timeZone\)/);
    assert.match(parserSource, /this\.timeZone = timeZone/);
    assert.match(
        tripPreviewSource,
        /Parser\.formatToTimestamp\(\s*carContext,/,
    );

    assert.match(
        autoPlayPatch,
        /\+\s*val formatter = DateFormat\.getTimeFormat\(context\)/,
    );
    assert.match(
        autoPlayPatch,
        /\+\s*val calendar = Calendar\.getInstance\(timeZone\)/,
    );
});
