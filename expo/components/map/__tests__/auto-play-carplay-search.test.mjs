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
const hybridListTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/hybrid/HybridListTemplate.swift',
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

test('CarPlay voice searches use a visible loading list instead of an empty search field', () => {
    assert.match(
        autoPlaySource,
        /function openVoiceSearchResultsTemplate\([\s\S]*?const \{ ListTemplate \} = loadAutoPlayModule\(\)[\s\S]*?getAutoPlaySearchLoadingCopy\(searchQuery\)[\s\S]*?new ListTemplate\([\s\S]*?loadingCopy\.title[\s\S]*?loadingCopy\.detailedText/,
    );
    assert.match(
        autoPlaySource,
        /openVoiceSearchResultsTemplate[\s\S]*?resultTemplateIsAlreadyPresented: true/,
    );
    assert.match(
        autoPlaySource,
        /searchTemplateWasUpdated[\s\S]*?!resultTemplateIsAlreadyPresented[\s\S]*?presentAutoPlaySearchResults/,
    );
    assert.match(
        autoPlaySource,
        /presentsVoiceSearchResultsInList === true[\s\S]*?openVoiceSearchResultsTemplate[\s\S]*?voiceSearchOptions[\s\S]*?: openSearchTemplate\(\s*searchQuery/,
    );
});

test('CarPlay voice search does not wait indefinitely for a locked-phone location lookup', () => {
    assert.match(
        autoPlaySource,
        /const AUTO_PLAY_SEARCH_LOCATION_TIMEOUT_MS = 1000;/,
    );
    assert.match(
        autoPlaySource,
        /async function getAutoPlaySearchLocation\(preferredLocation\)[\s\S]*?getLastRoadMatchedLocationAsync\(\)[\s\S]*?if \(roadMatchedLocation\)[\s\S]*?return roadMatchedLocation;[\s\S]*?withTimeout\([\s\S]*?getLastKnownLocation\(\)[\s\S]*?AUTO_PLAY_SEARCH_LOCATION_TIMEOUT_MS[\s\S]*?\.catch\(\(\) => null\)/,
    );
    assert.match(
        autoPlaySource,
        /function openVoiceSearchResultsTemplate[\s\S]*?runPlaceTextSearch\(/,
    );
    assert.match(
        autoPlaySource,
        /async function runPlaceTextSearch[\s\S]*?await getAutoPlaySearchLocation\(startLocation\)[\s\S]*?searchTextPlaces/,
    );
});

test('CarPlay keeps the completed result-list update alive while the phone is locked', () => {
    for (const source of [hybridListTemplateSource, autoPlayPatch]) {
        assert.match(source, /import UIKit/);
        assert.match(
            source,
            /MainActor\.run[\s\S]*?UIApplication\.shared\.beginBackgroundTask\([\s\S]*?CarPlay list update[\s\S]*?defer \{[\s\S]*?UIApplication\.shared\.endBackgroundTask\(backgroundTask\)[\s\S]*?template\.updateSections/,
        );
    }
});

test('CarPlay voice input shows a red mic, start cue, and search status', () => {
    for (const source of [voiceInputManagerSource, autoPlayPatch]) {
        assert.match(
            source,
            /UIImage\(systemName: "mic\.fill"\)[\s\S]*?\.systemRed/,
        );
        assert.match(
            source,
            /identifier: "searching"[\s\S]*?titleVariants: \["Searching for a destination\.\.\.", "Searching\.\.\."\]/,
        );
        assert.match(
            source,
            /voiceControlStates: \[listeningState, searchingState\]/,
        );
        assert.match(
            source,
            /activateVoiceControlState\(withIdentifier: "searching"\)[\s\S]*?Task\.sleep[\s\S]*?dismissTemplate/,
        );
        assert.match(
            source,
            /AVAudioPlayer\([\s\S]*?inputStartSoundData[\s\S]*?player\.play\(\)/,
        );
        assert.match(source, /makeInputStartSoundData[\s\S]*?"RIFF"/);
    }

    assert.match(
        voiceInputManagerSource,
        /withIdentifier: "listening"[\s\S]*?playInputStartSound\(\)[\s\S]*?reportListening\(\)/,
    );
});

test('CarPlay keeps cancellation and no-match states driving safe', () => {
    assert.match(
        hybridAutoPlaySource,
        /case \.cancelled:[\s\S]*?requestType = "searchCancelled"/,
    );
    assert.match(
        voiceSearchControllerSource,
        /requestType === 'searchCancelled'[\s\S]*?appInitiatedCancel[\s\S]*?finishSearch\(activeSearch\.generation, 'onCancelled'\)/,
    );
    assert.match(
        voiceSearchControllerSource,
        /requestType === 'searchNoMatch'[\s\S]*?finishSearch\(activeSearch\.generation, 'onNoMatch'\)/,
    );
    assert.match(
        autoPlaySource,
        /onCancelled:[\s\S]*?Voice search cancelled[\s\S]*?Tap the microphone to try again, or Search to use the keyboard\./,
    );
    assert.match(
        autoPlaySource,
        /onNoMatch:[\s\S]*?No destination was heard\. Tap the microphone to try again, or Search to use the keyboard\./,
    );
});

test('CarPlay voice recognition uses system transcript activity and slow finalization', () => {
    for (const source of [voiceInputManagerSource, autoPlayPatch]) {
        assert.match(
            source,
            /recognitionFinalizationTimeout:\s*TimeInterval\s*=\s*7/,
        );
        assert.match(source, /request\.shouldReportPartialResults = true/);
        assert.match(source, /request\.taskHint = \.search/);
        assert.match(
            source,
            /latestPartialTranscript[\s\S]*?partialTranscript[\s\S]*?finishRecognition\([\s\S]*?transcript: partialTranscript\.isEmpty \? nil : partialTranscript/,
        );
        assert.match(
            source,
            /previousPartialTranscript[\s\S]*?trimmedPartialTranscript != previousPartialTranscript[\s\S]*?scheduleRecognitionInactivityTimeout/,
        );
        assert.match(
            source,
            /scheduleRecognitionInactivityTimeout[\s\S]*?max\(silenceThresholdMs, 0\) \/ 1_000/,
        );
        assert.match(
            source,
            /recognitionActivityGeneration &\+= 1[\s\S]*?activityGeneration = self\.recognitionActivityGeneration[\s\S]*?scheduleRecognitionInactivityTimeout/,
        );
        assert.match(
            source,
            /expectedRecognitionActivityGeneration[\s\S]*?!= recognitionActivityGeneration[\s\S]*?return/,
        );
    }

    assert.doesNotMatch(
        voiceInputManagerSource,
        /silenceAmplitudeThreshold|noiseFloor|newSamples\.reduce\(0\)/,
    );
    assert.match(autoPlayPatch, /^-.*silenceAmplitudeThreshold/m);
    assert.doesNotMatch(autoPlayPatch, /^\+.*silenceAmplitudeThreshold/m);
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

test('CarPlay surfaces externally cancelled voice searches', async () => {
    let cancelledCalls = 0;
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: () => {},
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () => new Promise(() => {}),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: () => {},
        setTimeoutFn: () => 1,
    });

    controller.start({
        onCancelled: () => {
            cancelledCalls += 1;
        },
        onFallback: () => {},
        onUnavailable: () => {
            unavailableCalls += 1;
        },
    });
    await flushAsyncWork();

    controller.handleNativeEvent(undefined, undefined, 'searchCancelled');

    assert.equal(cancelledCalls, 1);
    assert.equal(unavailableCalls, 0);
});

test('CarPlay keeps app-initiated voice cancellations silent', async () => {
    let cancelledCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: () => {},
        getHybridAutoPlay: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () => new Promise(() => {}),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: () => {},
        setTimeoutFn: () => 1,
    });

    controller.start({
        onCancelled: () => {
            cancelledCalls += 1;
        },
        onFallback: () => {},
        onUnavailable: () => {},
    });
    await flushAsyncWork();

    controller.cancel();
    controller.handleNativeEvent(undefined, undefined, 'searchCancelled');

    assert.equal(cancelledCalls, 0);
});

test('CarPlay listening acknowledgement leaves the post-stop fallback timer armed', async () => {
    const clearedTimeouts = [];
    const timeouts = [];
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        clearTimeoutFn: (timeoutId) => {
            clearedTimeouts.push(timeoutId);
        },
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
    controller.handleNativeEvent(undefined, undefined, 'searchListening');

    assert.equal(clearedTimeouts.includes(2), false);

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
        /if isStopping \{[\s\S]*?cancelledByUser && continuation != nil[\s\S]*?self\.cancelledByUser = true[\s\S]*?activeRecognitionTask\?\.cancel\(\)[\s\S]*?finishRecognition\(/,
    );
    assert.match(
        voiceInputManagerSource,
        /guard !self\.isStopping[\s\S]*?recognitionRequest\?\.append\(buffer\)[\s\S]*?guard !self\.isStopping[\s\S]*?samples\.append/,
    );
});

test('CarPlay salvages a partial transcript when finalization errors', () => {
    assert.match(
        voiceInputManagerSource,
        /if let error \{[\s\S]*?partialTranscript[\s\S]*?self\.isStopping[\s\S]*?self\.continuation != nil[\s\S]*?self\.finishRecognition\(transcript: partialTranscript\)[\s\S]*?self\.fail\(error: error\)/,
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
