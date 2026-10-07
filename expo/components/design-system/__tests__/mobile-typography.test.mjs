import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const {
    cssToReactNativeRuntime,
} = require('react-native-css-interop/css-to-rn');
const config = require('../../../tailwind.config.js');

// Sizes and weights from the mobile galleries, in native logical pixels.
const cases = [
    [
        '../../map/selected-place-sheet.js',
        'SelectedPlaceSheet',
        'selectedPlaceHeaderSubtitle',
        13,
        '400',
    ],
    [
        '../../map/selected-place-sheet.js',
        'SelectedPlaceSheet',
        'selectedPlaceAddress',
        13,
        '400',
    ],
    [
        '../../map/selected-place-sheet.js',
        'SelectedPlaceSheet',
        'Suggested for businesses',
        12.5,
        '400',
    ],
    ['../primitives.js', 'DafSectionLabel', 'children', 11, '400'],
    [
        '../../map/primary-location-cards.js',
        'PrimaryLocationCards',
        'subtitle',
        12.5,
        '400',
    ],
    [
        '../../map/saved-location-section.js',
        'SavedLocationSection',
        'label',
        11,
        '400',
    ],
    [
        '../../map/saved-location-section.js',
        'SavedLocationSection',
        'description',
        13,
        '400',
    ],
    [
        '../../map/map-full-screen-search.js',
        'SearchSection',
        'title',
        11,
        '400',
    ],
    ['../../map/map-layer-controls.js', 'SettingSwitchRow', 'label', 15, '400'],
    [
        '../../map/map-layer-controls.js',
        'MapLayerSheet',
        'Customize what you see',
        13,
        '400',
    ],
    [
        '../../map/place-search-result-row.js',
        'PlaceSearchResultRow',
        'result.primaryText',
        15,
        '600',
    ],
    [
        '../../map/place-search-result-row.js',
        'PlaceSearchResultRow',
        'subtitle',
        13,
        '400',
    ],
    [
        '../../scorecard/scorecard-screen-header.js',
        'ScorecardScreenHeader',
        'title',
        18,
        '700',
    ],
    [
        '../../scorecard/scorecard-screen-header.js',
        'ScorecardPrivacyFooter',
        'Computed and encrypted',
        12,
        '400',
    ],
    [
        '../../scorecard/scorecard-dashboard-screen.js',
        'StatTile',
        'value',
        24,
        '700',
    ],
    [
        '../../contribute/step-header.js',
        'ContributePageHeader',
        'title',
        18,
        '700',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeAccountCard',
        'subtitle',
        12,
        '400',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeAccountCard',
        'title',
        13,
        '600',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeStartSheet',
        'Add camera data to OpenStreetMap',
        13,
        '400',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeStartSheet',
        'Draft in progress',
        13,
        '600',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeStartSheet',
        'Your edits are public',
        13,
        '400',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeStartSheet',
        'stepIndex + 1',
        12,
        '700',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeStartSheet',
        '{step}',
        13,
        '400',
    ],
    [
        '../../contribute/contribute-start-sheet.js',
        'ContributeStartSheet',
        '{signInError}',
        13,
        '400',
    ],
];

function findNodes(node, predicate, matches = []) {
    if (!node || typeof node !== 'object') {
        return matches;
    }
    if (predicate(node)) {
        matches.push(node);
    }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            value.forEach((child) => findNodes(child, predicate, matches));
        } else if (value && typeof value === 'object') {
            findNodes(value, predicate, matches);
        }
    }
    return matches;
}

for (const [file, functionName, content, fontSize, fontWeight] of cases) {
    test(`${functionName}: ${content} compiles to the gallery typography`, async () => {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8');
        const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
        const component = findNodes(
            ast,
            (node) =>
                node.type === 'FunctionDeclaration' &&
                node.id?.name === functionName,
        )[0];
        assert.ok(component, `Missing component ${functionName}`);
        const text = findNodes(
            component,
            (node) =>
                node.type === 'JSXElement' &&
                ['Text', 'HighlightedSearchText'].includes(
                    node.openingElement.name.name,
                ) &&
                node.children.some((child) =>
                    source.slice(child.start, child.end).includes(content),
                ),
        )[0];
        assert.ok(text, `Missing text ${content}`);
        const attribute = text.openingElement.attributes.find(
            (node) => node.name?.name === 'className',
        );
        const value = attribute.value;
        const className =
            value.type === 'StringLiteral'
                ? value.value
                : value.expression.quasis
                      .map((part) => part.value.cooked)
                      .join(' ');
        const css = await postcss([
            tailwindcss({
                ...config,
                content: [{ raw: className }],
            }),
        ]).process('@tailwind utilities;', { from: undefined });
        const compiled = cssToReactNativeRuntime(css.css, { inlineRem: 14 });
        const style = {};
        for (const name of className.split(/\s+/)) {
            for (const rule of compiled.rules[name]?.n ?? []) {
                for (const declaration of rule.d ?? []) {
                    if (declaration.length === 1) {
                        Object.assign(style, declaration[0]);
                    }
                }
            }
        }
        assert.equal(style.fontSize, fontSize);
        assert.equal(style.fontWeight ?? '400', fontWeight);
    });
}
