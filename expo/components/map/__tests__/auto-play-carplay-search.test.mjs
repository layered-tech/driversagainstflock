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
        /HybridVoice[\s\S]*?isVoiceInputCanceledError/,
    );
    assert.doesNotMatch(iosPlatformSource, /addListenerVoiceInput/);
    assert.match(
        voiceSearchControllerSource,
        /preferSpeechToText:\s*true[\s\S]*?result\?\.transcription[\s\S]*?onVoiceNavigation\(undefined, query, 'search'\)/,
    );

    assert.match(
        voiceSearchControllerSource,
        /pendingSearch\?\.generation !== searchGeneration[\s\S]*?result\?\.transcription[\s\S]*?onVoiceNavigation\(undefined, query, 'search'\)/,
    );
});

test('CarPlay keeps keyboard Search as a no-voice fallback', () => {
    assert.doesNotMatch(iosPlatformSource, /supportsSearchAutocomplete/);
    assert.match(
        autoPlaySource,
        /Tap the search field, then use the keyboard or its microphone when available\./,
    );
    assert.match(
        autoPlaySource,
        /const runSubmittedSearch[\s\S]*?runPlaceTextSearch[\s\S]*?onSearchTextSubmitted:[\s\S]*?runSubmittedSearch\(searchText\)/,
    );
});

test('CarPlay presents errors with an alert-compatible message template', () => {
    assert.match(
        iosPlatformSource,
        /createErrorTemplate\(\{[\s\S]*?MessageTemplate[\s\S]*?new MessageTemplate\(\{[\s\S]*?ios: \[searchAction\][\s\S]*?message: alertMessage/,
    );
    assert.doesNotMatch(iosPlatformSource, /InformationTemplate/);

    assert.match(
        autoPlaySource,
        /function showAutoPlayError[\s\S]*?alertMessage: makeAutoText\(`\$\{title\}\\n\$\{message\}`\)[\s\S]*?autoPlayModule/,
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

test('CarPlay keeps cancellation and no-match states driving safe', () => {
    assert.match(
        voiceSearchControllerSource,
        /isVoiceInputCanceledError\(error\)[\s\S]*?'onCancelled'[\s\S]*?: 'onUnavailable'/,
    );
    assert.match(
        voiceSearchControllerSource,
        /result\?\.transcription[\s\S]*?if \(!query\)[\s\S]*?finishSearch\(searchGeneration, 'onNoMatch'\)/,
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

const flushAsyncWork = () =>
    new Promise((resolve) => {
        setImmediate(resolve);
    });

test('CarPlay exposes a visible fallback while requesting voice permissions', async () => {
    let permissionRequests = 0;
    let unavailableCalls = 0;
    let voiceStarts = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
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

test('CarPlay submits the HybridVoice transcription as a search', async () => {
    const starts = [];
    const searches = [];
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: async (options) => {
                starts.push(options);
                return { transcription: '  Milwaukee  ' };
            },
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: (...args) => {
            searches.push(args);
        },
    });

    controller.start({
        onFallback: () => {},
        onUnavailable: () => assert.fail('voice input should be available'),
    });

    await flushAsyncWork();

    assert.deepEqual(starts, [
        {
            listeningText: 'Where would you like to go?',
            maxDurationMs: 10000,
            preferSpeechToText: true,
            silenceThresholdMs: 1500,
        },
    ]);
    assert.deepEqual(searches, [[undefined, 'Milwaukee', 'search']]);
});

test('CarPlay reports an empty HybridVoice transcript as no match', async () => {
    let noMatchCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: async () => ({ transcription: '   ' }),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: () => assert.fail('empty input is not a search'),
    });

    controller.start({
        onFallback: () => {},
        onNoMatch: () => {
            noMatchCalls += 1;
        },
        onUnavailable: () => assert.fail('empty input is not unavailable'),
    });
    await flushAsyncWork();

    assert.equal(noMatchCalls, 1);
});

test('CarPlay distinguishes user cancellation from voice failures', async () => {
    let cancelledCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: async () => {
                throw new Error('voiceInputCancelled by host');
            },
            stopVoiceInput: () => {},
        }),
        isVoiceInputCanceledError: (error) =>
            error.message.startsWith('voiceInputCancelled'),
        onVoiceNavigation: () => {},
    });

    controller.start({
        onCancelled: () => {
            cancelledCalls += 1;
        },
        onFallback: () => {},
        onUnavailable: () => assert.fail('cancellation is not unavailable'),
    });
    await flushAsyncWork();

    assert.equal(cancelledCalls, 1);
});

test('CarPlay reports non-cancellation voice errors as unavailable', async () => {
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: async () => {
                throw new Error('audio unavailable');
            },
            stopVoiceInput: () => {},
        }),
        isVoiceInputCanceledError: () => false,
        onVoiceNavigation: () => {},
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

test('CarPlay ignores repeated Search presses while voice input is active', async () => {
    let stopCalls = 0;
    let voiceStarts = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
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
    assert.equal(stopCalls, 0);
    controller.cancel();
    assert.equal(stopCalls, 1);
});

test('CarPlay keeps app-initiated voice cancellations silent', async () => {
    let cancelledCalls = 0;
    let rejectVoiceInput;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () =>
                new Promise((_resolve, reject) => {
                    rejectVoiceInput = reject;
                }),
            stopVoiceInput: () => {
                rejectVoiceInput(new Error('voiceInputCancelled by app'));
            },
        }),
        isVoiceInputCanceledError: () => true,
        onVoiceNavigation: () => {},
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
    await flushAsyncWork();

    assert.equal(cancelledCalls, 0);
});

test('CarPlay disconnect cannot let pending voice work finish into a reconnected session', async () => {
    const voiceInputResolvers = [];
    const voiceNavigationQueries = [];
    let unavailableCalls = 0;
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => true,
            startVoiceInput: () =>
                new Promise((resolve) => {
                    voiceInputResolvers.push(resolve);
                }),
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: (_coordinates, query) => {
            voiceNavigationQueries.push(query);
        },
    });
    const callbacks = {
        onFallback: () => {},
        onUnavailable: () => {
            unavailableCalls += 1;
        },
    };

    controller.start(callbacks);
    await flushAsyncWork();

    controller.cancel();
    controller.start(callbacks);
    await flushAsyncWork();

    voiceInputResolvers[0]({ transcription: 'Stale result' });
    await flushAsyncWork();

    assert.equal(unavailableCalls, 0);
    assert.deepEqual(voiceNavigationQueries, []);

    voiceInputResolvers[1]({ transcription: '  Madison  ' });
    await flushAsyncWork();

    assert.deepEqual(voiceNavigationQueries, ['Madison']);
    assert.equal(unavailableCalls, 0);
});
