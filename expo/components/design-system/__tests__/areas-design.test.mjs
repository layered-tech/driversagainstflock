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
const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const typography = source('../../areas/area-typography.js');
const { areaTextClassName } = await import(
    `data:text/javascript,${encodeURIComponent(typography)}`
);

function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    return [
        ...(predicate(node) ? [node] : []),
        ...Object.values(node).flatMap((value) =>
            Array.isArray(value)
                ? value.flatMap((child) => nodes(child, predicate))
                : nodes(value, predicate),
        ),
    ];
}

const files = [
    '../../areas/area-ui.js',
    '../../areas/add-area-screen.js',
    '../../areas/area-change-screen.js',
    '../../areas/area-alerts-screen.js',
    '../../areas/areas-screen.js',
];
const sources = files.map(source);
const css = await postcss([
    tailwindcss({
        ...config,
        content: [{ raw: [...sources, typography].join('\n') }],
    }),
]).process('@tailwind utilities;', { from: undefined });
const compiled = cssToReactNativeRuntime(css.css, { inlineRem: 14 });

function styleFor(className) {
    const style = {};
    for (const name of className.split(/\s+/)) {
        if (name.startsWith('dark:')) continue;
        for (const rule of compiled.rules[name]?.n ?? []) {
            for (const declaration of rule.d ?? []) {
                if (declaration.length === 1)
                    Object.assign(style, declaration[0]);
                else if (
                    declaration[1] === 'color' &&
                    declaration[0]?.[1] === 'rgba'
                ) {
                    style.color = `#${declaration[0][2]
                        .slice(0, 3)
                        .map((value) => value.toString(16).padStart(2, '0'))
                        .join('')}`;
                }
            }
        }
    }
    return style;
}

for (const [classes, family] of [
    ['text-xs', 'HankenGrotesk-Regular'],
    ['font-medium', 'HankenGrotesk-Medium'],
    ['font-semibold', 'HankenGrotesk-SemiBold'],
    ['font-bold', 'HankenGrotesk-Bold'],
    ['font-dafDisplay font-bold', 'Geist-Bold'],
    ['font-dafMono', 'JetBrainsMono-Regular'],
    ['font-dafMono font-semibold', 'JetBrainsMono-SemiBold'],
    ['font-dafMono font-bold', 'JetBrainsMono-Bold'],
]) {
    test(`Areas bundles a static ${family} font and emits its NativeWind utility`, () => {
        const style = styleFor(areaTextClassName(classes));
        assert.equal(style.fontFamily, family);
        assert.equal(
            style.fontWeight,
            undefined,
            'Use the actual weight file rather than synthetic native bold',
        );
        const font = readFileSync(
            new URL(`../../../assets/fonts/${family}.ttf`, import.meta.url),
        );
        assert.equal(font.readUInt32BE(0), 0x00010000);
        const tables = Array.from(
            { length: font.readUInt16BE(4) },
            (_, index) =>
                font.toString('ascii', 12 + index * 16, 16 + index * 16),
        );
        assert.ok(tables.includes('name'));
        assert.ok(!tables.includes('fvar'), 'Native fonts must be static');
        assert.ok(
            source('../../../app/areas/_layout.js').includes(
                `'${family}': require(`,
            ),
        );
    });
}

test('Area sheets fit their content, cap scrolling and keep 22px rounded top corners', () => {
    const ast = parse(sources[0], { sourceType: 'module', plugins: ['jsx'] });
    const sheet = nodes(
        ast,
        (node) =>
            node.type === 'FunctionDeclaration' &&
            node.id?.name === 'AreaSheet',
    )[0];
    const elements = nodes(sheet, (node) => node.type === 'JSXOpeningElement');
    const classFor = (name) =>
        elements
            .find((node) => node.name.name === name)
            ?.attributes.find((attr) => attr.name?.name === 'className')?.value
            .value;
    const sheetStyle = styleFor(classFor('View'));
    assert.equal(sheetStyle.borderTopLeftRadius, 22);
    assert.equal(sheetStyle.borderTopRightRadius, 22);
    assert.equal(sheetStyle.maxHeight, '75%');
    assert.equal(sheetStyle.overflow, 'hidden');
    assert.equal(styleFor(classFor('ScrollView')).flexGrow, 0);
    for (const screen of sources.slice(1, 3)) {
        assert.ok(
            screen.includes('-mb-[22px]'),
            'Map continues behind the sheet corners',
        );
        assert.ok(screen.includes('<AreaSheet'));
    }
});

test('Area search results keep subtitles on one line and use compact design spacing', () => {
    const ast = parse(sources[1], { sourceType: 'module', plugins: ['jsx'] });
    const subtitle = nodes(
        ast,
        (node) =>
            node.type === 'JSXElement' &&
            node.openingElement.name.name === 'Text' &&
            node.children.some((child) =>
                sources[1]
                    .slice(child.start, child.end)
                    .includes('result.definition'),
            ),
    )[0];
    const lines = subtitle.openingElement.attributes.find(
        (attr) => attr.name?.name === 'numberOfLines',
    );
    assert.equal(lines.value.expression.value, 1);
    assert.ok(sources[1].includes('min-h-[56px]'));
    assert.ok(sources[1].includes('py-[12px]'));
    assert.ok(sources[1].includes('w-[44px]'));
});

test('Alert frequency descriptions compile to secondary 13px text and medium labels', () => {
    const ast = parse(sources[3], { sourceType: 'module', plugins: ['jsx'] });
    for (const [content, size, family, color] of [
        ['mode.label', 15, 'HankenGrotesk-Medium', '#11151B'],
        ['mode.description', 13, 'HankenGrotesk-Regular', '#4A5562'],
    ]) {
        const element = nodes(
            ast,
            (node) =>
                node.type === 'JSXElement' &&
                node.openingElement.name.name === 'Text' &&
                node.children.some((child) =>
                    sources[3].slice(child.start, child.end).includes(content),
                ),
        )[0];
        const className = element.openingElement.attributes.find(
            (attr) => attr.name?.name === 'className',
        ).value.value;
        const style = styleFor(areaTextClassName(className));
        assert.equal(style.fontSize, size);
        assert.equal(style.fontFamily, family);
        assert.equal(style.color.toLowerCase(), color.toLowerCase());
    }
});
