import assert from 'node:assert/strict';
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
    const createElement = (type, props) => ({ type, props });

    new Function(
        'require',
        'module',
        'exports',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        code,
    )(
        (specifier) => {
            if (specifier === 'react/jsx-runtime') {
                return { jsx: createElement, jsxs: createElement };
            }

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
