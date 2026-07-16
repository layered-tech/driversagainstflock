import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const iosPlatformSource = readFileSync(
    new URL('../../auto-play-platform.ios.js', import.meta.url),
    'utf8',
);
const searchTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/SearchTemplate.swift',
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

test('CarPlay waits for keyboard Search instead of issuing autocomplete requests', () => {
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
        /onSearchTextSubmitted:[\s\S]*?runPlaceTextSearch/,
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
