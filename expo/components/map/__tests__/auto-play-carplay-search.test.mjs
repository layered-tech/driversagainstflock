import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCarPlayVoiceSearchController } from '../../auto-play-carplay-voice-search.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const iosPlatformSource = readFileSync(
    new URL('../../auto-play-platform.ios.js', import.meta.url),
    'utf8',
);
const voiceSearchControllerSource = readFileSync(
    new URL('../../auto-play-carplay-voice-search.js', import.meta.url),
    'utf8',
);
const searchTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/SearchTemplate.swift',
        import.meta.url,
    ),
    'utf8',
);
const hybridAutoPlaySource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/hybrid/HybridAutoPlay.swift',
        import.meta.url,
    ),
    'utf8',
);
const voiceInputManagerSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/utils/VoiceInputManager.swift',
        import.meta.url,
    ),
    'utf8',
);
const voiceInputTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/VoiceInputTemplate.swift',
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

test('CarPlay keeps keyboard Search and voice input as separate header actions', () => {
    assert.match(
        autoPlaySource,
        /const handleRootHeaderSearchPress = \(\) => \{\s*openSearchTemplate\(\);\s*\};/,
    );
    assert.match(
        autoPlaySource,
        /const handleRootHeaderVoiceSearchPress = \(\) => \{[\s\S]*?startSearchVoiceInput[\s\S]*?onFallback:[\s\S]*?openSearchTemplate\(\)/,
    );
    assert.match(
        autoPlaySource,
        /ROOT_HEADER_VOICE_SEARCH_IMAGE = makeGlyphImage\('microphone'/,
    );
    assert.match(autoPlaySource, /microphone:\s*0xf130,/);
    assert.match(
        autoPlaySource,
        /leadingNavigationBarButtons:\s*\[searchButton, voiceSearchButton\]/,
    );
    assert.match(voiceSearchControllerSource, /hasVoiceInputPermission/);
    assert.match(voiceSearchControllerSource, /requestVoiceInputPermission/);
    assert.match(voiceSearchControllerSource, /startVoiceInput\(/);
    assert.match(
        iosPlatformSource,
        /addListenerVoiceInput[\s\S]*?handleNativeEvent\(/,
    );
    assert.match(
        voiceSearchControllerSource,
        /onVoiceNavigation\(coordinates, trimmedQuery, requestType\)/,
    );
    assert.match(
        hybridAutoPlaySource,
        /import Speech[\s\S]*?recordPermission == \.granted[\s\S]*?SFSpeechRecognizer\.authorizationStatus\(\) == \.authorized/,
    );
    assert.match(
        hybridAutoPlaySource,
        /onOutcome:[\s\S]*?emitVoiceInput\([\s\S]*?outcome: outcome[\s\S]*?listener\.callback\(nil, query, requestType\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /SFSpeechAudioBufferRecognitionRequest[\s\S]*?recognitionRequest\?\.append\(buffer\)[\s\S]*?bestTranscription\.formattedString/,
    );
    assert.match(
        voiceInputManagerSource,
        /scheduleCaptureTimeout[\s\S]*?DispatchQueue\.global\(qos: \.userInitiated\)\.asyncAfter/,
    );
    assert.match(
        voiceInputManagerSource,
        /CPVoiceControlState[\s\S]*?VoiceInputTemplate[\s\S]*?activateVoiceControlState/,
    );
    assert.match(
        voiceInputTemplateSource,
        /CPVoiceControlTemplate[\s\S]*?onDidDisappearCallback\(\)[\s\S]*?removeTemplate/,
    );
    assert.match(
        hybridAutoPlaySource,
        /clearVoiceInputManager\(ifCurrent: manager\)[\s\S]*?if voiceInputManager === manager[\s\S]*?voiceInputManager = nil/,
    );
    assert.match(
        voiceInputManagerSource,
        /id: "voice-input-\\\(UUID\(\)\.uuidString\)"/,
    );
    assert.match(
        voiceSearchControllerSource,
        /if \(!activeSearch\)[\s\S]*?requestType !== 'search' \|\| !trimmedQuery[\s\S]*?onVoiceNavigation\(coordinates, trimmedQuery, requestType\)/,
    );
});

test('CarPlay keeps keyboard Search as a no-voice fallback', () => {
    assert.match(iosPlatformSource, /supportsSearchAutocomplete:\s*false/);
    assert.match(
        autoPlaySource,
        /supportsSearchAutocomplete === false[\s\S]*?return;/,
    );
    assert.match(
        autoPlaySource,
        /Tap the search field, then use the keyboard or its microphone when available\./,
    );
    assert.match(
        autoPlaySource,
        /const runSubmittedSearch[\s\S]*?runPlaceTextSearch[\s\S]*?onSearchTextSubmitted:[\s\S]*?runSubmittedSearch\(searchText\)/,
    );
});

test('CarPlay presents voice results in a list without duplicating keyboard results', () => {
    assert.match(iosPlatformSource, /presentsVoiceSearchResultsInList:\s*true/);
    assert.match(
        autoPlaySource,
        /const presentsVoiceSearchResultsInList\s*=\s*autoAdvanceSingleResult[\s\S]*?presentsVoiceSearchResultsInList === true/,
    );
    assert.match(
        autoPlaySource,
        /presentAutoPlaySearchResults\(\{[\s\S]*?includesMap: showsSearchResultsOnMap/,
    );
});

test('CarPlay keeps cancellation and no-match states driving safe', () => {
    assert.match(
        hybridAutoPlaySource,
        /case \.cancelled:[\s\S]*?requestType = "searchCancelled"/,
    );
    assert.match(
        voiceSearchControllerSource,
        /requestType === 'searchCancelled'[\s\S]*?clearPendingSearch/,
    );
    assert.match(
        voiceSearchControllerSource,
        /requestType === 'searchNoMatch'[\s\S]*?finishSearch\(activeSearch\.generation, 'onNoMatch'\)/,
    );
    assert.match(
        autoPlaySource,
        /onNoMatch:[\s\S]*?No destination was heard\. Tap the microphone to try again, or Search to use the keyboard\./,
    );
});

const flushAsyncWork = () =>
    new Promise((resolve) => {
        setImmediate(resolve);
    });

test('CarPlay exposes a visible fallback while requesting voice permissions', async () => {
    let permissionRequests = 0;
    let unavailableCalls = 0;
    let voiceStarts = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => false,
            requestVoiceInputPermission: async () => {
                permissionRequests += 1;
                return true;
            },
            startVoiceInput: async () => {
                voiceStarts += 1;
            },
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: () => {},
    });

    assert.equal(
        controller.start({
            onFallback: () => {},
            onUnavailable: () => {
                unavailableCalls += 1;
            },
        }),
        true,
    );

    await flushAsyncWork();

    assert.equal(unavailableCalls, 1);
    assert.equal(permissionRequests, 1);
    assert.equal(voiceStarts, 0);
});

test('CarPlay falls back when native voice input resolves without an event', async () => {
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: () => {},
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: async () => new Uint8Array(),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: () => {},
        setTimeoutFn: () => 1,
    });

    controller.start({
        onFallback: () => {},
        onUnavailable: () => {
            unavailableCalls += 1;
        },
    });

    await flushAsyncWork();

    assert.equal(unavailableCalls, 1);
});

test('CarPlay listening acknowledgement keeps voice search active', async () => {
    let clearTimeoutCalls = 0;
    let resolveVoiceInput;
    let unavailableCalls = 0;
    let voiceNavigationQuery = null;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: () => {
            clearTimeoutCalls += 1;
        },
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () =>
                new Promise((resolve) => {
                    resolveVoiceInput = resolve;
                }),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: (_coordinates, query) => {
            voiceNavigationQuery = query;
        },
        setTimeoutFn: () => 1,
    });

    controller.start({
        onFallback: () => {},
        onUnavailable: () => {
            unavailableCalls += 1;
        },
    });
    await flushAsyncWork();

    controller.handleNativeEvent(undefined, undefined, 'searchListening');
    controller.handleNativeEvent(undefined, '  Milwaukee  ', 'search');
    resolveVoiceInput(new Uint8Array());
    await flushAsyncWork();

    assert.equal(clearTimeoutCalls, 1);
    assert.equal(voiceNavigationQuery, 'Milwaukee');
    assert.equal(unavailableCalls, 0);
});

test('CarPlay times out an invisible native voice startup', async () => {
    const timeouts = [];
    let stopCalls = 0;
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: () => {},
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () => new Promise(() => {}),
            stopVoiceInput: () => {
                stopCalls += 1;
            },
        }),
        onVoiceNavigation: () => {},
        setTimeoutFn: (callback) => {
            timeouts.push(callback);
            return timeouts.length;
        },
    });

    controller.start({
        onFallback: () => {},
        onUnavailable: () => {
            unavailableCalls += 1;
        },
    });
    await flushAsyncWork();
    timeouts[0]();

    assert.equal(unavailableCalls, 0);
    assert.equal(stopCalls, 2);

    controller.handleNativeEvent(undefined, undefined, 'searchCancelled');

    assert.equal(unavailableCalls, 1);
});

test('CarPlay ignores repeated Search presses while voice input is active', async () => {
    let stopCalls = 0;
    let voiceStarts = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () => {
                voiceStarts += 1;
                return new Promise(() => {});
            },
            stopVoiceInput: () => {
                stopCalls += 1;
            },
        }),
        onVoiceNavigation: () => {},
    });
    const callbacks = {
        onFallback: () => {},
        onUnavailable: () => {},
    };

    assert.equal(controller.start(callbacks), true);
    assert.equal(controller.start(callbacks), true);
    await flushAsyncWork();

    assert.equal(voiceStarts, 1);
    assert.equal(stopCalls, 1);
    controller.cancel();
});

test('CarPlay exposes a fallback if native voice stop never acknowledges', async () => {
    const timeouts = [];
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: () => {},
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () => new Promise(() => {}),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: () => {},
        setTimeoutFn: (callback) => {
            timeouts.push(callback);
            return timeouts.length;
        },
    });

    controller.start({
        onFallback: () => {},
        onUnavailable: () => {
            unavailableCalls += 1;
        },
    });
    await flushAsyncWork();

    timeouts[0]();
    assert.equal(unavailableCalls, 0);
    timeouts[1]();
    assert.equal(unavailableCalls, 1);
});

test('CarPlay voice sessions cannot be revived after cancellation', () => {
    assert.match(
        hybridAutoPlaySource,
        /let manager = VoiceInputManager\(\)[\s\S]*?swapVoiceInputManager\(manager\)[\s\S]*?return Promise\.async/,
    );
    assert.match(
        hybridAutoPlaySource,
        /stopVoiceInput\(\)[\s\S]*?swapVoiceInputManager\(nil\)\?\.stop/,
    );
    assert.match(
        hybridAutoPlaySource,
        /voiceInputManagerIsCurrent\(manager\)[\s\S]*?withInterfaceController[\s\S]*?voiceInputManagerIsCurrent\(manager\)[\s\S]*?manager\.start/,
    );
    assert.match(
        voiceInputManagerSource,
        /guard !isStopping else \{[\s\S]*?cont\.resume\(throwing: VoiceInputError\.noActiveSession\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /recognitionRequest\?\.append\(buffer\)[\s\S]*?stopLock\.unlock\(\)[\s\S]*?guard !self\.isStopping[\s\S]*?hasDetectedSpeech = true/,
    );
});

test('CarPlay resolves every transient search callback before a submitted search', () => {
    for (const source of [searchTemplateSource, autoPlayPatch]) {
        assert.match(source, /completePendingSearchResults/);
        assert.match(source, /completionHandler\(\[\]\)/);
    }

    assert.match(
        searchTemplateSource,
        /searchTemplateSearchButtonPressed[\s\S]*?completePendingSearchResults\(\)/,
    );
    assert.match(
        searchTemplateSource,
        /if !isInitialized \{[\s\S]*?self\.searchText = searchText/,
    );
    assert.match(autoPlayPatch, /\+        completePendingSearchResults\(\)/);

    assert.doesNotMatch(
        searchTemplateSource,
        /if searchText == self\.searchText/,
    );
});
