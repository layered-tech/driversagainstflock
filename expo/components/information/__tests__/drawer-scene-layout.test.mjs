import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

test('drawer navigation keeps page coordinates stationary for iOS scroll indicators and tour targets', () => {
    const source = readFileSync(
        new URL('../../../app/_layout.js', import.meta.url),
        'utf8',
    );
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const elements = [];
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'JSXOpeningElement') elements.push(node);
        Object.values(node).forEach((value) => {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        });
    }
    visit(ast);
    const drawer = elements.find((node) => node.name.name === 'Drawer');
    const options = drawer.attributes.find(
        (attribute) => attribute.name?.name === 'screenOptions',
    ).value.expression.properties;
    assert.equal(
        options.find((property) => property.key.name === 'drawerType')?.value
            .value,
        'front',
        'A sliding scene moves window measurements and iOS automatic scroll indicator insets',
    );
});
