import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCarPlayVoiceSearchController } from '../../auto-play-carplay-voice-search.js';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );
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
    join(autoPlayPackageRoot, 'ios/templates/SearchTemplate.swift'),
    'utf8',
);
const messageTemplateSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/templates/MessageTemplate.swift'),
    'utf8',
);
const hybridVoiceSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/hybrid/HybridVoice.swift'),
    'utf8',
);
const voiceInputManagerSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/utils/VoiceInputManager.swift'),
    'utf8',
);
const voiceInputTemplateSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/templates/VoiceInputTemplate.swift'),
    'utf8',
);
const hybridListTemplateSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/hybrid/HybridListTemplate.swift'),
    'utf8',
);
const hybridSearchTemplateSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/hybrid/HybridSearchTemplate.swift'),
    'utf8',
);
const hybridAutoPlaySource = readFileSync(
    join(autoPlayPackageRoot, 'ios/hybrid/HybridAutoPlay.swift'),
    'utf8',
);
const autoPlayInterfaceControllerSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/scenes/AutoPlayInterfaceController.swift'),
    'utf8',
);
const rootModuleSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/utils/RootModule.swift'),
    'utf8',
);
const templateStoreSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/templates/TemplateStore.swift'),
    'utf8',
);
const carPlayTemplateFactories = [
    ['Grid', 'createGridTemplate'],
    ['Information', 'createInformationTemplate'],
    ['List', 'createListTemplate'],
    ['Message', 'createMessageTemplate'],
    ['Search', 'createSearchTemplate'],
].map(([templateName, createMethod]) => ({
    createMethod,
    source: readFileSync(
        join(
            autoPlayPackageRoot,
            `ios/hybrid/Hybrid${templateName}Template.swift`,
        ),
        'utf8',
    ),
    templateName,
}));

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
        hybridVoiceSource,
        /import Speech[\s\S]*?recordPermission == \.granted[\s\S]*?SFSpeechRecognizer\.authorizationStatus\(\) == \.authorized/,
    );
    assert.match(
        voiceInputManagerSource,
        /SFSpeechAudioBufferRecognitionRequest[\s\S]*?request\.shouldReportPartialResults = true/,
    );
    assert.match(
        voiceInputManagerSource,
        /activeRecognitionRequest\?\.append\(buffer\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /result\.bestTranscription\.formattedString/,
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
        hybridVoiceSource,
        /clearVoiceInputManager\(ifCurrent: manager\)[\s\S]*?if voiceInputManager === manager[\s\S]*?voiceInputManager = nil/,
    );
    assert.match(
        voiceInputManagerSource,
        /id: "voice-input-\\\(UUID\(\)\.uuidString\)"/,
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
    assert.match(messageTemplateSource, /let template: CPAlertTemplate/);
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

test('CarPlay keeps the completed result-list update alive while the phone is locked', () => {
    assert.match(hybridListTemplateSource, /import UIKit/);
    assert.match(
        hybridListTemplateSource,
        /MainActor\.run[\s\S]*?UIApplication\.shared\.beginBackgroundTask\([\s\S]*?CarPlay list update[\s\S]*?defer \{[\s\S]*?UIApplication\.shared\.endBackgroundTask\(backgroundTask\)[\s\S]*?template\.updateSections/,
    );
});

test('CarPlay keeps keyboard search-result updates alive while the phone is locked', () => {
    assert.match(hybridSearchTemplateSource, /import UIKit/);
    assert.match(
        hybridSearchTemplateSource,
        /func updateSearchResults[\s\S]*?MainActor\.run[\s\S]*?UIApplication\.shared\.beginBackgroundTask\([\s\S]*?defer \{[\s\S]*?UIApplication\.shared\.endBackgroundTask\(backgroundTask\)[\s\S]*?template\.updateSearchResults/,
    );
});

test('CarPlay owns a stable loading result list before submitting and pushing it', () => {
    const submissionStart = searchTemplateSource.indexOf(
        'func searchTemplateSearchButtonPressed',
    );
    const submissionSource = searchTemplateSource.slice(submissionStart);
    const loadingSectionDeclaration = submissionSource.match(
        /let\s+([A-Za-z_]\w*loading\w*)\s*=/i,
    );

    assert.ok(submissionStart >= 0, 'expected the native submission handler');
    assert.ok(
        loadingSectionDeclaration,
        'expected a stable native loading section for the result list',
    );

    const loadingSectionName = loadingSectionDeclaration[1];

    assert.match(
        submissionSource,
        new RegExp(`sections:\\s*\\[${loadingSectionName}\\]`),
    );
    assert.doesNotMatch(submissionSource, /sections:\s*\[results\]/);

    const retainedIndex = submissionSource.indexOf(
        'self.pushedListTemplate = listTemplate',
    );
    const registeredIndex = submissionSource.indexOf(
        'scene.templateStore.addTemplate',
    );
    const submittedIndex = submissionSource.indexOf(
        'self.config.onSearchTextSubmitted(self.searchText)',
    );
    const pushedIndex = submissionSource.indexOf(
        'interfaceController.pushTemplate',
    );

    assert.ok(retainedIndex >= 0, 'expected SearchTemplate to retain the list');
    assert.ok(
        registeredIndex >= 0,
        'expected the template store to own the list',
    );
    assert.ok(submittedIndex >= 0, 'expected the JS submission callback');
    assert.ok(pushedIndex >= 0, 'expected the CarPlay list push');
    assert.ok(
        retainedIndex < submittedIndex,
        'the native list must be retained before search work can update it',
    );
    assert.ok(
        registeredIndex < submittedIndex,
        'the template store must own the list before search work can update it',
    );
    assert.ok(
        submittedIndex < pushedIndex,
        'search work must start only after the stable list is owned',
    );
});

test('CarPlay pop-to-template retires only templates above its target', () => {
    const popToTemplateStart =
        autoPlayInterfaceControllerSource.indexOf('func popToTemplate');
    const popToTemplateSource = autoPlayInterfaceControllerSource.slice(
        popToTemplateStart,
        autoPlayInterfaceControllerSource.indexOf(
            'func presentTemplate',
            popToTemplateStart,
        ),
    );

    assert.match(
        popToTemplateSource,
        /let templates = interfaceController\.templates[\s\S]*?let targetIndex[\s\S]*?targetIndex < templates\.index\(before: templates\.endIndex\)[\s\S]*?templates\[\s*templates\.index\(after: targetIndex\)\.\.<templates\.endIndex\s*\]/,
    );
    assert.doesNotMatch(popToTemplateSource, /\[\(startIndex\)\.\.<endIndex\]/);
    assert.match(
        popToTemplateSource,
        /interfaceController\.pop\([\s\S]*?RootModule\.withTemplateStore[\s\S]*?removeTemplates\(templateIds: templateIds\)/,
    );
});

test('CarPlay template pops consistently honor the requested animation', () => {
    const popTemplateStart = hybridAutoPlaySource.indexOf('func popTemplate');
    const popTemplateSource = hybridAutoPlaySource.slice(
        popTemplateStart,
        hybridAutoPlaySource.indexOf(
            'func popToRootTemplate',
            popTemplateStart,
        ),
    );
    const popToTemplateStart =
        hybridAutoPlaySource.indexOf('func popToTemplate');
    const popToTemplateSource = hybridAutoPlaySource.slice(
        popToTemplateStart,
        hybridAutoPlaySource.indexOf(
            '// MARK: generic template updates',
            popToTemplateStart,
        ),
    );

    assert.match(
        popTemplateSource,
        /let animated = animate \?\? true[\s\S]*?dismissTemplate\(\s*animated: animated[\s\S]*?popTemplate\(\s*animated: animated/,
    );
    assert.match(
        popToTemplateSource,
        /let hasPresentedTemplate[\s\S]*?dismissTemplate\(\s*animated: false[\s\S]*?popToTemplate\([\s\S]*?animated: !hasPresentedTemplate && \(animate \?\? true\)/,
    );
});

test('CarPlay releases a failed search-result list without clearing a replacement', () => {
    const submissionStart = searchTemplateSource.indexOf(
        'func searchTemplateSearchButtonPressed',
    );
    const submissionSource = searchTemplateSource.slice(submissionStart);

    assert.match(
        submissionSource,
        /catch[\s\S]*?self\.pushedListTemplate === listTemplate[\s\S]*?self\.pushedListTemplate = nil/,
    );
    assert.match(
        submissionSource,
        /catch[\s\S]*?RootModule\.withTemplateStore[\s\S]*?storedTemplate === listTemplate[\s\S]*?removeTemplate\(templateId: listConfig\.id\)/,
    );
});

test('CarPlay creates and stores every template on the main actor', () => {
    assert.match(
        rootModuleSource,
        /static func performOnMainActor[\s\S]*?Thread\.isMainThread[\s\S]*?DispatchQueue\.main\.sync/,
    );
    assert.match(
        rootModuleSource,
        /@MainActor\s+static func withTemplateStore[\s\S]*?@MainActor\s+static func withAutoPlayTemplate/,
    );

    for (const methodName of [
        'getCPTemplate',
        'getTemplate',
        'addTemplate',
        'removeTemplate',
        'removeTemplates',
        'purge',
        'disconnect',
    ]) {
        assert.match(
            templateStoreSource,
            new RegExp(`@MainActor\\s+func ${methodName}\\b`),
        );
    }

    for (const {
        createMethod,
        source,
        templateName,
    } of carPlayTemplateFactories) {
        const createStart = source.indexOf(`func ${createMethod}`);
        const createEnd = source.indexOf('\n    func ', createStart + 1);
        const createSource = source.slice(
            createStart,
            createEnd >= 0 ? createEnd : undefined,
        );

        assert.ok(createStart >= 0, `expected ${createMethod}`);
        assert.match(
            createSource,
            new RegExp(
                `RootModule\\.performOnMainActor[\\s\\S]*?${templateName}Template\\(config: config\\)[\\s\\S]*?RootModule\\.withTemplateStore[\\s\\S]*?templateStore\\.addTemplate`,
            ),
        );
    }
});

test('CarPlay voice input uses configured listening UI and sounds', () => {
    assert.match(
        voiceInputManagerSource,
        /presentVoiceTemplate\([\s\S]*?listeningText: listeningText[\s\S]*?listeningImage: listeningImage[\s\S]*?listeningImageRepeats: listeningImageRepeats/,
    );
    assert.match(
        voiceInputManagerSource,
        /loadVoiceImage\([\s\S]*?image: listeningImage[\s\S]*?CPVoiceControlState\([\s\S]*?identifier: "listening"[\s\S]*?titleVariants: \[listeningText\][\s\S]*?repeats: repeats/,
    );
    assert.match(
        voiceInputManagerSource,
        /VoiceInputTemplate\([\s\S]*?voiceControlStates: \[listeningState\]/,
    );
    assert.match(
        voiceInputManagerSource,
        /if let uri = startSoundUri \{[\s\S]*?playSound\(uri: uri\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /if let uri = endSoundUri \{[\s\S]*?await playSound\(uri: uri\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /AVAudioPlayer\(data: data\)[\s\S]*?player\.play\(\)/,
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

test('CarPlay voice recognition uses system transcript activity and slow finalization', () => {
    assert.match(
        voiceInputManagerSource,
        /recognitionFinalizationTimeout:\s*TimeInterval\s*=\s*7/,
    );
    assert.match(
        voiceInputManagerSource,
        /request\.shouldReportPartialResults = true/,
    );
    assert.match(voiceInputManagerSource, /request\.taskHint = \.search/);
    assert.match(
        voiceInputManagerSource,
        /latestPartialTranscript[\s\S]*?partialTranscript[\s\S]*?finishSpeechRecognition\([\s\S]*?transcription: nil/,
    );
    assert.match(
        voiceInputManagerSource,
        /previousPartialTranscript[\s\S]*?trimmedPartialTranscript != previousPartialTranscript[\s\S]*?scheduleRecognitionInactivityTimeout/,
    );
    assert.match(
        voiceInputManagerSource,
        /scheduleRecognitionInactivityTimeout[\s\S]*?max\(silenceThresholdMs, 0\) \/ 1_000/,
    );
    assert.match(
        voiceInputManagerSource,
        /recognitionActivityGeneration &\+= 1[\s\S]*?return \(!self\.isStopping, self\.recognitionActivityGeneration\)[\s\S]*?scheduleRecognitionInactivityTimeout/,
    );
    assert.match(
        voiceInputManagerSource,
        /expectedRecognitionActivityGeneration[\s\S]*?!= recognitionActivityGeneration[\s\S]*?return/,
    );

    assert.match(
        voiceInputManagerSource,
        /if activeRecognitionRequest == nil,[\s\S]*?silenceAmplitudeThreshold/,
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

test('CarPlay voice sessions cannot be revived after cancellation', () => {
    assert.match(
        hybridVoiceSource,
        /let manager = VoiceInputManager\(\)[\s\S]*?swapVoiceInputManager\(manager\)[\s\S]*?return Promise\.async/,
    );
    assert.match(
        hybridVoiceSource,
        /stopVoiceInput\(\)[\s\S]*?swapVoiceInputManager\(nil\)\?\.stop/,
    );
    assert.match(
        hybridVoiceSource,
        /voiceInputManagerIsCurrent\(manager\)[\s\S]*?withInterfaceController[\s\S]*?voiceInputManagerIsCurrent\(manager\)[\s\S]*?manager\.start/,
    );
    assert.match(
        voiceInputManagerSource,
        /let canBeginCapture = self\.stopLock\.withLock \{[\s\S]*?guard !self\.isStopping[\s\S]*?guard canBeginCapture else \{[\s\S]*?box\.resume\(throwing: VoiceInputError\.noActiveSession\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /let shouldWaitForBuffer = self\.stopLock\.withLock \{[\s\S]*?guard !self\.isStopping[\s\S]*?firstBufferContinuation = cont[\s\S]*?if !shouldWaitForBuffer \{[\s\S]*?cont\.resume\(\)/,
    );
    assert.match(
        voiceInputManagerSource,
        /private func stop\([\s\S]*?expectedRecognitionActivityGeneration[\s\S]*?guard !isStopping else \{[\s\S]*?isStopping = true[\s\S]*?capturedRequest\?\.endAudio\(\)[\s\S]*?scheduleRecognitionFinalization/,
    );
    assert.match(
        voiceInputManagerSource,
        /captureIsActive = self\.stopLock\.withLock \{[\s\S]*?guard !self\.isStopping[\s\S]*?activeRecognitionRequest\?\.append\(buffer\)[\s\S]*?samplesWereAppended = self\.stopLock\.withLock \{[\s\S]*?guard !self\.isStopping[\s\S]*?samples\.append/,
    );
});

test('CarPlay salvages a partial transcript when finalization errors', () => {
    assert.match(
        voiceInputManagerSource,
        /if error != nil \{[\s\S]*?finishSpeechRecognition\([\s\S]*?transcription: nil/,
    );
    assert.match(
        voiceInputManagerSource,
        /let resolvedTranscript =[\s\S]*?transcription \?\? latestPartialTranscript[\s\S]*?if let transcript, !transcript\.isEmpty \{[\s\S]*?VoiceInputResult\([\s\S]*?transcription: transcript/,
    );
});

test('CarPlay preserves current results while resolving transient search callbacks', () => {
    assert.match(searchTemplateSource, /completePendingSearchResults/);

    assert.match(
        searchTemplateSource,
        /searchTemplateSearchButtonPressed[\s\S]*?completePendingSearchResults\(\)/,
    );
    assert.match(
        searchTemplateSource,
        /if !isInitialized \{[\s\S]*?self\.searchText = searchText/,
    );

    assert.doesNotMatch(
        searchTemplateSource,
        /if searchText == self\.searchText/,
    );

    const updatedSearchStart = searchTemplateSource.indexOf(
        'updatedSearchText searchText: String',
    );
    const selectedResultStart = searchTemplateSource.indexOf(
        'selectedResult item: CPListItem',
        updatedSearchStart,
    );
    const updatedSearchSource = searchTemplateSource.slice(
        updatedSearchStart,
        selectedResultStart,
    );
    const firstSearchTextAssignment = updatedSearchSource.indexOf(
        'self.searchText = searchText',
    );
    const transientSearchTextAssignment = updatedSearchSource.indexOf(
        'self.searchText = searchText',
        firstSearchTextAssignment + 1,
    );
    const transientUpdateSource = updatedSearchSource.slice(
        transientSearchTextAssignment,
    );
    const storesAndInvalidatesCurrentResults =
        /self\.completionHandler\s*=\s*completionHandler[\s\S]*?invalidate\(\)/.test(
            transientUpdateSource,
        );
    const parsesAndCompletesCurrentResults =
        /let\s+([A-Za-z_]\w*)\s*=\s*Parser\.parseSearchResults\([\s\S]*?section:\s*results[\s\S]*?(?:completionHandler|completePendingSearchResults)\(\1\)/.test(
            transientUpdateSource,
        ) ||
        /completionHandler\(\s*Parser\.parseSearchResults\([\s\S]*?section:\s*results/.test(
            transientUpdateSource,
        );

    assert.ok(updatedSearchStart >= 0, 'expected the text-update delegate');
    assert.ok(
        selectedResultStart > updatedSearchStart,
        'expected the text-update delegate boundary',
    );
    assert.ok(
        transientSearchTextAssignment > firstSearchTextAssignment,
        'expected the post-initialization text-update path',
    );
    assert.doesNotMatch(transientUpdateSource, /completionHandler\(\[\]\)/);
    assert.ok(
        storesAndInvalidatesCurrentResults || parsesAndCompletesCurrentResults,
        'transient callbacks must resolve with the currently visible results',
    );
});
