import assert from 'node:assert/strict';
import * as responsiveMapLayout from '../responsive-map-layout.js';
import { getContributeMapLayout } from '../../contribute/contribute-layout.js';
import {
    getDuoMapCenterPoint,
    getDuoPaneLayout,
} from '../duo-bottom-sheet-layout.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonjs = require('@babel/plugin-transform-modules-commonjs');
const jsx = require('@babel/plugin-transform-react-jsx');

export function loadTourModule(fileUrl, mocks, scheduler = {}) {
    const { code } = transformSync(readFileSync(fileUrl, 'utf8'), {
        babelrc: false,
        configFile: false,
        plugins: [[jsx, { runtime: 'automatic' }], commonjs],
    });
    const module = { exports: {} };
    const createElement = (type, props, key) =>
        type === 'PersistentMapScene'
            ? props.children
            : {
                  type,
                  props,
                  ...(key === undefined ? {} : { key }),
              };

    new Function(
        'require',
        'module',
        'exports',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        code,
    )(
        (specifier) => {
            if (specifier === 'react-native' && specifier in mocks) {
                return { Platform: { isPad: false }, ...mocks[specifier] };
            }
            if (
                specifier.endsWith('/persistent-map-host') &&
                !(specifier in mocks)
            )
                return {
                    usePersistentMapEnabled: () => false,
                    PersistentMapScene: 'PersistentMapScene',
                    PersistentDrawerStateContext: {},
                };
            if (specifier === './contribute-layout') {
                return { getContributeMapLayout };
            }
            if (specifier === 'react/jsx-runtime') {
                return { jsx: createElement, jsxs: createElement };
            }
            if (
                specifier.endsWith('/duo-typography') &&
                !(specifier in mocks)
            ) {
                return { DuoText: 'Text', DuoTextInput: 'TextInput' };
            }

            if (
                specifier.endsWith('/duo-pane-content-size') &&
                !(specifier in mocks)
            )
                return { useDuoPaneContentSize: () => ({}) };
            if (
                specifier.endsWith('/duo-device-context') &&
                !(specifier in mocks)
            ) {
                return {
                    useDuoDevice: () => false,
                    useDuoPaneContent: () => false,
                    DuoDeviceProvider: 'DuoDeviceProvider',
                };
            }
            if (
                specifier.endsWith('/duo-bottom-sheet-layout') &&
                !(specifier in mocks)
            )
                return { getDuoPaneLayout, getDuoMapCenterPoint };
            if (
                specifier.endsWith('/responsive-map-layout') &&
                !(specifier in mocks)
            )
                return responsiveMapLayout;
            assert.ok(specifier in mocks, `Missing mock: ${specifier}`);
            return mocks[specifier];
        },
        module,
        module.exports,
        scheduler.requestAnimationFrame,
        scheduler.cancelAnimationFrame,
    );

    return module.exports;
}

export function createHookHarness() {
    const slots = [];
    let cursor = 0;
    let effects = [];
    let needsRender = false;

    function dependenciesChanged(previous, next) {
        return (
            !previous ||
            next.some((value, index) => !Object.is(value, previous[index]))
        );
    }

    return {
        react: {
            useState(initial) {
                const index = cursor++;

                if (!(index in slots)) {
                    slots[index] =
                        typeof initial === 'function' ? initial() : initial;
                }

                return [
                    slots[index],
                    (next) => {
                        const value =
                            typeof next === 'function'
                                ? next(slots[index])
                                : next;

                        if (!Object.is(value, slots[index])) {
                            slots[index] = value;
                            needsRender = true;
                        }
                    },
                ];
            },
            useRef(initial) {
                return (slots[cursor++] ??= { current: initial });
            },
            useEffect(effect, dependencies) {
                const index = cursor++;
                const previous = slots[index];

                if (dependenciesChanged(previous?.dependencies, dependencies)) {
                    effects.push(() => {
                        previous?.cleanup?.();
                        slots[index] = { dependencies, cleanup: effect() };
                    });
                }
            },
            useCallback(callback, dependencies) {
                const index = cursor++;

                if (
                    dependenciesChanged(
                        slots[index]?.dependencies,
                        dependencies,
                    )
                ) {
                    slots[index] = { dependencies, value: callback };
                }

                return slots[index].value;
            },
            useMemo(factory, dependencies) {
                const index = cursor++;

                if (
                    dependenciesChanged(
                        slots[index]?.dependencies,
                        dependencies,
                    )
                ) {
                    slots[index] = { dependencies, value: factory() };
                }

                return slots[index].value;
            },
        },
        render(renderHook) {
            let result;
            let renders = 0;

            do {
                assert.ok(++renders < 20, 'Hook effects must settle');
                needsRender = false;
                cursor = 0;
                effects = [];
                result = renderHook();
                effects.forEach((effect) => effect());
            } while (needsRender);

            return result;
        },
        cleanup() {
            slots.forEach((slot) => slot?.cleanup?.());
        },
    };
}
