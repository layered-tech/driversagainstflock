import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonJs = require.resolve('@babel/plugin-transform-modules-commonjs');
const typescript = require.resolve('@babel/plugin-transform-typescript');
const packageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : new URL(
          '../../../node_modules/@iternio/react-native-auto-play/',
          import.meta.url,
      ).pathname;

for (const path of [
    'src/utils/NitroMapButton.ts',
    'lib/utils/NitroMapButton.js',
    'lib-cjs/utils/NitroMapButton.js',
]) {
    test(`${path} forwards map-button flags without changing callbacks or images`, () => {
        const source = readFileSync(resolve(packageRoot, path), 'utf8');
        const { code } = transformSync(source, {
            babelrc: false,
            configFile: false,
            filename: path,
            plugins: [typescript, commonJs],
        });
        const context = vm.createContext({
            exports: {},
            require(name) {
                if (name === 'react-native') {
                    return { Platform: { OS: 'android' } };
                }
                if (name === './NitroImage') {
                    return { NitroImageUtil: { convert: (image) => image } };
                }
                throw new Error(`Unexpected import ${name}`);
            },
        });
        vm.runInContext(code, context);
        const { convert } = context.exports.NitroMapButton;
        const template = {};
        let presses = 0;
        for (const flags of [undefined, 0, 2, 3]) {
            for (const type of ['pan', 'custom']) {
                for (const image of [
                    { type: 'glyph', name: 'location' },
                    { type: 'asset', image: 7 },
                ]) {
                    const [button] = convert(template, [
                        {
                            flags,
                            image,
                            type,
                            onPress(value) {
                                assert.equal(value, template);
                                presses++;
                            },
                        },
                    ]);
                    assert.equal(button.flags, flags);
                    assert.equal(button.type, type);
                    assert.equal(button.image.name, image.name);
                    assert.equal(button.image.image, image.image);
                    if (type === 'custom') {
                        button.onPress();
                    } else {
                        assert.equal(button.onPress, undefined);
                    }
                }
            }
        }
        assert.equal(presses, 8);
        assert.equal(convert(template), undefined);
    });
}
