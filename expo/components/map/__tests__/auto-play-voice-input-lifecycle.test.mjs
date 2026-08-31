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
const hybridVoiceSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridVoice.kt',
    ),
    'utf8',
);
const voiceInputManagerSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/VoiceInputManager.kt',
    ),
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

test('Android voice capture replaces sessions without surrendering newer ownership', () => {
    assert.match(
        hybridVoiceSource,
        /val manager = VoiceInputManager[\s\S]*?val previousManager = swapVoiceInputManager\(manager\)[\s\S]*?previousManager\?\.stop\(\)[\s\S]*?finally \{[\s\S]*?clearVoiceInputManager\(ifCurrent = manager\)[\s\S]*?manager\.dispose\(\)/,
    );
    assert.match(
        hybridVoiceSource,
        /override fun stopVoiceInput\(\) \{\s*swapVoiceInputManager\(null\)\?\.stop\(\)\s*\}/,
    );
    assert.match(
        hybridVoiceSource,
        /private fun swapVoiceInputManager\([\s\S]*?synchronized\(voiceInputManagerLock\)[\s\S]*?val previousManager = voiceInputManager[\s\S]*?voiceInputManager = manager[\s\S]*?previousManager/,
    );
    assert.match(
        hybridVoiceSource,
        /private fun clearVoiceInputManager\(ifCurrent: VoiceInputManager\)[\s\S]*?synchronized\(voiceInputManagerLock\)[\s\S]*?if \(voiceInputManager === ifCurrent\) \{\s*voiceInputManager = null\s*\}/,
    );
    assert.doesNotMatch(
        hybridVoiceSource,
        /finally \{\s*voiceInputManager = null/,
    );
});

test('Android speech recognition has bounded, identity-safe finalization', () => {
    assert.match(
        voiceInputManagerSource,
        /startSTT\(\s*context: Context,\s*maxDurationMs: Long,[\s\S]*?scheduleSpeechRecognitionDeadline\(session, maxDurationMs\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /scheduleSpeechRecognitionDeadline[\s\S]*?delay\(maxDurationMs\.coerceAtLeast\(0L\)\)[\s\S]*?requestSpeechRecognitionStop\(session\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /requestSpeechRecognitionStop[\s\S]*?delay\(SPEECH_FINALIZATION_TIMEOUT_MS\)[\s\S]*?finishSpeechRecognition\(session\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /deactivateSpeechRecognitionSession[\s\S]*?activeSpeechRecognitionSession !== session[\s\S]*?activeSpeechRecognitionSession = null/,
    );
});

test('Android speech recognition salvages partials and releases audio focus', () => {
    assert.match(
        voiceInputManagerSource,
        /updateLatestPartialTranscript\(session, text\)[\s\S]*?latestPartialTranscript = transcript/,
    );
    assert.match(
        voiceInputManagerSource,
        /resolvedTranscript = transcription\?\.takeIf \{ it\.isNotBlank\(\) \}[\s\S]*?session\.latestPartialTranscript\?\.takeIf \{ it\.isNotBlank\(\) \}/,
    );
    assert.match(
        voiceInputManagerSource,
        /try \{[\s\S]*?startSTT[\s\S]*?\} finally \{\s*abandonAudioFocus\(\)\s*\}/,
    );
    assert.match(
        voiceInputManagerSource,
        /cancelSpeechRecognition[\s\S]*?maxDurationJob\?\.cancel\(\)[\s\S]*?finalizationJob\?\.cancel\(\)[\s\S]*?recognizer\.cancel\(\)[\s\S]*?recognizer\.destroy\(\)/,
    );
});
