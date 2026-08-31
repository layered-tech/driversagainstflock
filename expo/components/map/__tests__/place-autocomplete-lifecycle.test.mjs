import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const placeAutocompleteSource = readFileSync(
    new URL('../use-place-autocomplete.js', import.meta.url),
    'utf8',
);
const voiceSearchSource = readFileSync(
    new URL('../use-voice-search.js', import.meta.url),
    'utf8',
);

test('debounces autocomplete requests while a search value is changing', () => {
    assert.match(
        placeAutocompleteSource,
        /PLACE_AUTOCOMPLETE_DEBOUNCE_MS = 250/,
    );
    assert.match(
        placeAutocompleteSource,
        /const debounceTimeout = setTimeout\([\s\S]*?searchPlaces\([\s\S]*?PLACE_AUTOCOMPLETE_DEBOUNCE_MS/,
    );
    assert.match(placeAutocompleteSource, /clearTimeout\(debounceTimeout\)/);
});

test('waits for final voice transcription before changing autocomplete input', () => {
    assert.match(
        voiceSearchSource,
        /const resultIsFinal =[\s\S]*?event\?\.isFinal \?\? event\?\.results\?\.\[0\]\?\.isFinal;[\s\S]*?if \(!transcript \|\| resultIsFinal === false\) \{\s+return;\s+\}[\s\S]*?handleSearchChange\(transcript\);/,
    );
});
