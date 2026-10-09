import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createBottomSheetModalLifecycle } from '../bottom-sheet-modal-lifecycle.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { default: generate } = require('@babel/generator');

function createDismissAction(ref, mountedRef, programmaticRef) {
    const { ast } = transformSync(
        readFileSync(new URL('../use-map-search.js', import.meta.url), 'utf8'),
        { ast: true, babelrc: false, configFile: false },
    );
    const hook = ast.program.body.find(
        (node) => node.declaration?.id?.name === 'useMapSearch',
    ).declaration;
    const action = hook.body.body
        .flatMap((node) => node.declarations ?? [])
        .find((node) => node.id.name === 'dismissDirectionsRouteSheet');

    return new Function(
        'useCallback',
        'directionsRouteSheetRef',
        'directionsRouteSheetHasMountedRef',
        'directionsRouteSheetProgrammaticDismissRef',
        `return ${generate(action.init).code};`,
    )((fn) => fn, ref, mountedRef, programmaticRef);
}

function createInstalledModal() {
    const source = readFileSync(
        new URL(
            '../../../node_modules/@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal.tsx',
            import.meta.url,
        ),
        'utf8',
    );
    const methods = source.slice(
        source.indexOf('  const handlePresent ='),
        source.indexOf('  const handleMinimize ='),
    );
    const portal = source.slice(
        source.indexOf('  const handlePortalRender ='),
        source.indexOf('  const handleBottomSheetOnChange ='),
    );
    const { code } = transformSync(methods + portal, {
        filename: 'modal.ts',
        babelrc: false,
        configFile: false,
        plugins: ['@babel/plugin-transform-typescript'],
    });
    const statuses = Object.fromEntries(
        [
            'INITIAL',
            'PRESENTED',
            'CLOSED',
            'MINIMIZED',
            'MINIMIZING',
            'ANIMATING',
            'DISMISSING',
            'DISMISSED',
        ].map((name, index) => [name, index]),
    );
    const bindings = {
        __DEV__: false,
        useCallback: (fn) => fn,
        requestAnimationFrame: (fn) => fn(),
        MODAL_STATUS: statuses,
        statusRef: { current: statuses.INITIAL },
        currentIndexRef: { current: -1 },
        bottomSheetRef: { current: null },
        mount: false,
        index: 0,
        key: 'route-sheet',
        stackBehavior: 'switch',
        ref: {},
        setState() {},
        mountSheet() {},
        willUnmountSheet() {},
        unmount() {},
    };
    const nativeModal = new Function(
        ...Object.keys(bindings),
        `${code}\nreturn { present: handlePresent, dismiss: handleDismiss, render: handlePortalRender };`,
    )(...Object.values(bindings));
    const frames = [];
    const lifecycle = createBottomSheetModalLifecycle({
        requestFrame: (callback) => {
            frames.push(callback);
            return frames.length;
        },
        cancelFrame() {},
    });
    lifecycle.setModal(nativeModal);
    return {
        ...lifecycle,
        render(callback) {
            frames.splice(0).forEach((frame) => frame());
            nativeModal.render(callback);
        },
    };
}

function createTrackingHandlers(mountedRef, programmaticRef, userClose) {
    const { code } = transformSync(
        readFileSync(
            new URL(
                '../use-map-bottom-sheet-tracking-handlers.js',
                import.meta.url,
            ),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: ['@babel/plugin-transform-modules-commonjs'],
        },
    );
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (name) => {
            if (name === 'react') {
                return {
                    useCallback: (fn) => fn,
                    useMemo: (fn) => fn(),
                    useState: (value) => [value, () => {}],
                };
            }
            assert.equal(name, './camera-focus-padding');
            return {
                getBottomSheetCoverageRatio: () => 0,
                roundCoverageRatio: (value) => value,
            };
        },
        module,
        module.exports,
    );
    return module.exports.useMapBottomSheetTrackingHandlers({
        bottomSheetAnimatedPosition: { value: 800 },
        directionsRouteSheetHasMountedRef: mountedRef,
        directionsRouteSheetProgrammaticDismissRef: programmaticRef,
        directionsRouteUserCloseRef: { current: userClose },
        markerDetailsIsOpenRef: { current: false },
        pendingMarkerSelectionRef: { current: null },
        setSelectedMarker() {},
        windowHeight: 800,
    }).directionsRouteSheetTrackingHandlers;
}

test('dismissing an unopened route sheet preserves its first presentation', () => {
    const modal = createInstalledModal();
    const mountedRef = { current: false };
    const programmaticRef = { current: false };
    const dismiss = createDismissAction(
        { current: modal },
        mountedRef,
        programmaticRef,
    );

    dismiss();
    modal.present();
    let rendered = false;
    modal.render(() => {
        rendered = true;
    });

    assert.equal(rendered, true, 'The installed modal must still render');
    assert.equal(programmaticRef.current, true);
});

test('a mounted sheet dismisses programmatically and resets before reopening', () => {
    const mountedRef = { current: false };
    const programmaticRef = { current: false };
    let dismissals = 0;
    let userCloses = 0;
    const handlers = createTrackingHandlers(mountedRef, programmaticRef, () => {
        userCloses++;
    });
    const dismiss = createDismissAction(
        { current: { dismiss: () => dismissals++ } },
        mountedRef,
        programmaticRef,
    );

    handlers.onAnimate(-1, 0, 800, 400);
    dismiss();
    assert.equal(dismissals, 1);
    assert.equal(programmaticRef.current, true);
    handlers.onDismiss();
    assert.equal(mountedRef.current, false);
    assert.equal(userCloses, 0);
    assert.equal(programmaticRef.current, false);

    handlers.onChange(0, 400);
    dismiss();
    assert.equal(dismissals, 2);
});

test('dragging the route sheet closed still exits route choice', () => {
    const mountedRef = { current: false };
    const programmaticRef = { current: false };
    let userCloses = 0;
    const handlers = createTrackingHandlers(mountedRef, programmaticRef, () => {
        userCloses++;
    });

    handlers.onChange(0, 400);
    handlers.onDismiss();
    assert.equal(userCloses, 1);
    assert.equal(mountedRef.current, false);
});

test('unmounting for driving mode resets the guard before the sheet remounts', () => {
    const { ast } = transformSync(
        readFileSync(
            new URL('../directions-route-sheet.js', import.meta.url),
            'utf8',
        ),
        {
            ast: true,
            babelrc: false,
            configFile: false,
            parserOpts: { plugins: ['jsx'] },
        },
    );
    const component = ast.program.body.find(
        (node) => node.declaration?.id?.name === 'DirectionsRouteSheet',
    ).declaration;
    const effect = component.body.body.find(
        (node) =>
            node.expression?.callee?.name === 'useEffect' &&
            node.expression.arguments[1]?.elements?.some(
                (dependency) =>
                    dependency.name === 'directionsRouteSheetHasMountedRef',
            ),
    );
    assert.ok(effect, 'The sheet must reset its mounted guard on unmount');
    const mountedRef = { current: true };
    const cleanup = new Function(
        'directionsRouteSheetHasMountedRef',
        `return (${generate(effect.expression.arguments[0]).code})();`,
    )(mountedRef);

    cleanup();
    assert.equal(mountedRef.current, false);

    const modal = createInstalledModal();
    createDismissAction({ current: modal }, mountedRef, { current: false })();
    modal.present();
    let rendered = false;
    modal.render(() => {
        rendered = true;
    });
    assert.equal(rendered, true);
});

test('a deferred programmatic dismissal does not exit route choice after the opening animation clears its old flag', () => {
    const mountedRef = { current: false };
    const programmaticRef = { current: true };
    let userCloses = 0;
    const handlers = createTrackingHandlers(
        mountedRef,
        programmaticRef,
        () => userCloses++,
    );
    handlers.onAnimate(-1, 0, 800, 400);
    assert.equal(programmaticRef.current, false);
    handlers.onDismiss({ programmatic: true });
    assert.equal(userCloses, 0);
    handlers.onDismiss({ programmatic: false });
    assert.equal(userCloses, 1);
});
