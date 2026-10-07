import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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

test('CarPlay opens saved destinations before starting voice input', async () => {
    const functionStart = autoPlaySource.indexOf(
        'function openSavedDestinationsTemplate(',
    );
    const functionEnd = autoPlaySource.indexOf(
        'function openSearchTemplate(',
        functionStart,
    );
    assert.ok(functionStart >= 0);
    assert.ok(functionEnd > functionStart);

    const selections = [];
    const opened = [];
    const saved = { places: [{ id: 'home', name: 'Home' }] };
    class ListTemplate {
        constructor(config) {
            this.config = config;
            opened.push(this);
        }

        push() {
            return Promise.resolve();
        }

        updateSections(section) {
            this.config.sections = section;
            return Promise.resolve();
        }
    }
    const openSavedDestinationsTemplate = vm.runInNewContext(
        `(${autoPlaySource.slice(functionStart, functionEnd)})`,
        {
            addSearchSavedLocationsListener: () => () => {},
            getBackHeaderAction: () => ({ ios: { backButton: {} } }),
            handleRootHeaderVoiceSearchPress: () => opened.push('voice'),
            handleSearchResultSelected: (...args) => selections.push(args),
            loadAutoPlayModule: () => ({ ListTemplate }),
            loadSearchSavedLocations: () => Promise.resolve(saved),
            logAutoPlayPlatformAction() {},
            makeAutoText: (text) => ({ text }),
            makeDisabledSearchRow: (title) => ({ title: { text: title } }),
            makeInitialSavedSearchRows: (locations, onPress) =>
                locations.places.map((place) => ({
                    onPress: () => onPress(place),
                    title: { text: place.name },
                })),
            openSearchTemplate: () => opened.push('keyboard'),
            updateSearchTemplateSection: (template, section) =>
                template.updateSections(section),
        },
    );

    const presentation = openSavedDestinationsTemplate();
    await presentation.pushPromise;
    await Promise.resolve();

    assert.equal(opened[0].config.sections.items[0].title.text, 'Home');
    assert.equal(selections.length, 0);
    opened[0].config.headerActions.ios.leadingNavigationBarButtons[0].onPress();
    assert.equal(opened[1], 'voice');
    opened[0].config.headerActions.ios.leadingNavigationBarButtons[1].onPress();
    assert.equal(opened[2], 'keyboard');
    opened[0].config.sections.items[0].onPress();
    assert.equal(selections[0][0].id, 'home');
});

test('CarPlay keeps keyboard Search and voice input as separate header actions', () => {
    assert.match(
        iosPlatformSource,
        /opensSavedDestinationsBeforeSearch:\s*true/,
    );
    assert.match(
        autoPlaySource,
        /const handleRootHeaderSearchPress = \(\) => \{[\s\S]*?openSavedDestinationsTemplate\(\)/,
    );
    assert.match(
        autoPlaySource,
        /const handleRootHeaderVoiceSearchPress = \(\) => \{[\s\S]*?startSearchVoiceInput[\s\S]*?onFallback:[\s\S]*?handleRootHeaderSearchPress\(\)/,
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
        /createErrorTemplate\(\{[\s\S]*?MessageTemplate[\s\S]*?new MessageTemplate\(\{[\s\S]*?ios: \[recoverSearchAction\][\s\S]*?message: alertMessage/,
    );
    assert.doesNotMatch(iosPlatformSource, /InformationTemplate/);

    assert.match(
        autoPlaySource,
        /function showAutoPlayError[\s\S]*?alertMessage: makeAutoText\(`\$\{title\}\\n\$\{message\}`\)[\s\S]*?autoPlayModule/,
    );
});

test('CarPlay and Android Auto voice searches load on the map before presenting results', () => {
    const start = autoPlaySource.indexOf(
        'function openVoiceSearchResultsTemplate(',
    );
    const end = autoPlaySource.indexOf('function getRouteNumberDelta(', start);
    const source = autoPlaySource.slice(start, end);
    assert.match(source, /popToRootTemplate\(false\)/);
    assert.match(source, /runPlaceTextSearch/);
    assert.doesNotMatch(source, /new ListTemplate|new SearchTemplate/);
    assert.match(
        autoPlaySource,
        /presentAutoPlaySearchResults\(\{\s*includesMap: true/,
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

test('CarPlay returns to destinations during permission prompts and allows a retry', async () => {
    let permissionRequests = 0;
    let fallbackCalls = 0;
    let voiceStarts = 0;
    let permissionGranted = false;
    let resolvePermission;
    const queries = [];
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => permissionGranted,
            requestVoiceInputPermission: () => {
                permissionRequests += 1;
                return new Promise((resolve) => {
                    resolvePermission = resolve;
                });
            },
            startVoiceInput: async () => {
                voiceStarts += 1;
                return { transcription: 'Home' };
            },
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: (_coordinates, query) => queries.push(query),
    });
    const callbacks = {
        onFallback: () => {
            fallbackCalls += 1;
        },
        onUnavailable: () =>
            assert.fail('permission prompts must not show an error'),
    };

    controller.start(callbacks);
    await flushAsyncWork();
    assert.equal(fallbackCalls, 1);
    assert.equal(permissionRequests, 1);
    assert.equal(voiceStarts, 0);

    controller.start(callbacks);
    await flushAsyncWork();
    assert.equal(permissionRequests, 1);
    assert.equal(fallbackCalls, 1);

    permissionGranted = true;
    resolvePermission(true);
    await flushAsyncWork();
    assert.equal(voiceStarts, 0);
    controller.start(callbacks);
    await flushAsyncWork();
    assert.deepEqual(queries, ['Home']);
});

for (const outcome of ['denied', 'rejected', 'throws']) {
    test(`CarPlay keeps destinations usable when voice permissions are ${outcome}`, async () => {
        let fallbackCalls = 0;
        const controller = createCarPlayVoiceSearchController({
            getHybridVoice: () => ({
                hasVoiceInputPermission: () => false,
                requestVoiceInputPermission: () => {
                    if (outcome === 'throws') {
                        throw new Error('permission failed');
                    }
                    return outcome === 'rejected'
                        ? Promise.reject(new Error('permission failed'))
                        : Promise.resolve(false);
                },
                startVoiceInput: () =>
                    assert.fail('ungranted permission cannot start voice'),
                stopVoiceInput: () => {},
            }),
            onVoiceNavigation: () => assert.fail('permission is not a search'),
        });
        const callbacks = {
            onFallback: () => {
                fallbackCalls += 1;
            },
            onUnavailable: () =>
                assert.fail('permissions must leave destinations visible'),
        };
        controller.start(callbacks);
        await flushAsyncWork();
        controller.start(callbacks);
        await flushAsyncWork();
        assert.equal(fallbackCalls, 2);
    });
}

test('CarPlay permission completion after disconnect does not clear a newer voice attempt', async () => {
    let granted = false;
    let resolvePermission;
    let resolveVoice;
    let starts = 0;
    const queries = [];
    const controller = createCarPlayVoiceSearchController({
        getHybridVoice: () => ({
            hasVoiceInputPermission: () => granted,
            requestVoiceInputPermission: () =>
                new Promise((resolve) => {
                    resolvePermission = resolve;
                }),
            startVoiceInput: () => {
                starts += 1;
                return new Promise((resolve) => {
                    resolveVoice = resolve;
                });
            },
            stopVoiceInput: () => {},
        }),
        onVoiceNavigation: (_coordinates, query) => queries.push(query),
    });
    const callbacks = {
        onFallback() {},
        onUnavailable: () => assert.fail('unexpected error'),
    };
    controller.start(callbacks);
    await flushAsyncWork();
    controller.cancel();
    granted = true;
    controller.start(callbacks);
    await flushAsyncWork();
    resolvePermission(true);
    await flushAsyncWork();
    controller.start(callbacks);
    await flushAsyncWork();
    assert.equal(starts, 1);
    resolveVoice({ transcription: 'Work' });
    await flushAsyncWork();
    assert.deepEqual(queries, ['Work']);
});

test('CarPlay permission fallback opens recents and favorites', () => {
    const start = autoPlaySource.indexOf(
        'const handleRootHeaderVoiceSearchPress =',
    );
    const end = autoPlaySource.indexOf(
        'const handleRootHeaderDrivingMapViewPress',
        start,
    );
    let callbacks;
    let destinationsOpened = 0;
    const press = vm.runInNewContext(
        `${autoPlaySource.slice(start, end)}; handleRootHeaderVoiceSearchPress`,
        {
            autoPlayPlatform: {
                startSearchVoiceInput(value) {
                    callbacks = value;
                    return true;
                },
            },
            handleRootHeaderSearchPress: () => {
                destinationsOpened += 1;
            },
            openSearchTemplate: () =>
                assert.fail('expected saved destinations'),
            showAutoPlayError: () =>
                assert.fail('permission fallback must not present a modal'),
        },
    );
    press();
    callbacks.onFallback();
    assert.equal(destinationsOpened, 1);
});

test('CarPlay error Search action waits for modal dismissal before opening destinations', async () => {
    const start = iosPlatformSource.indexOf('    createErrorTemplate(');
    const end = iosPlatformSource.indexOf('    logAction(', start);
    const events = [];
    let resolveDismissal;
    const platform = vm.runInNewContext(
        `({${iosPlatformSource.slice(start, end)}})`,
    );
    const template = platform.createErrorTemplate({
        alertMessage: 'Voice unavailable',
        autoPlayModule: {
            HybridAutoPlay: {
                popTemplate: () => {
                    events.push('dismiss');
                    return new Promise((resolve) => {
                        resolveDismissal = resolve;
                    });
                },
            },
            MessageTemplate: class {
                constructor(config) {
                    this.config = config;
                }
            },
        },
        searchAction: {
            title: 'Search',
            onPress: () => events.push('destinations'),
        },
    });
    const recovery = template.config.actions.ios[0].onPress();
    assert.deepEqual(events, ['dismiss']);
    resolveDismissal();
    await recovery;
    assert.deepEqual(events, ['dismiss', 'destinations']);
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
