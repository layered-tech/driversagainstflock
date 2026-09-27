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

const useVoiceInputSource = readFileSync(
    join(autoPlayPackageRoot, 'src/hooks/useVoiceInput.ts'),
    'utf8',
);

test('useVoiceInput forwards the native request classification', () => {
    assert.match(
        useVoiceInputSource,
        /voiceInputResult[\s\S]*?requestType: string/,
    );
    assert.match(
        useVoiceInputSource,
        /addListenerVoiceInput\(\s*\(coordinates, query, requestType\) =>[\s\S]*?setVoiceInputResult\(\{ coordinates, query, requestType \}\)/,
    );
});
