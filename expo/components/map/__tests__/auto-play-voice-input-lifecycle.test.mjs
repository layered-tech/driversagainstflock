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
const androidPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
    'utf8',
);

test('Android Auto uses the upstream two-argument voice callback', () => {
    assert.match(
        useVoiceInputSource,
        /voiceInputResult[\s\S]*?coordinates: Location \| undefined;[\s\S]*?query: string \| undefined;/,
    );
    assert.match(
        useVoiceInputSource,
        /addListenerVoiceInput\(\(coordinates, query\) =>[\s\S]*?setVoiceInputResult\(\{ coordinates, query \}\)/,
    );
    assert.match(
        androidPlatformSource,
        /addListenerVoiceInput\(\s*\(coordinates, query\) => onVoiceNavigation\(coordinates, query\)/,
    );
});
