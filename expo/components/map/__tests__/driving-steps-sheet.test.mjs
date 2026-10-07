import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const element = (type, props) => ({ type, props });
const getStepList = (sheet) => sheet.props.children.props.children[0];

function loadSheet(expanded = false) {
    const snaps = [];
    const scrolls = [];
    const effects = [];
    const refs = [];
    const states = [expanded, true];
    let refIndex = 0;
    let stateIndex = 0;
    const module = { exports: {} };
    const source = transformSync(
        readFileSync(
            new URL('../driving-steps-sheet.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                [
                    require('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    ).code;
    const mocks = {
        react: {
            useCallback: (fn) => fn,
            useMemo: (fn) => fn(),
            useEffect: (fn) => effects.push(fn),
            useRef: (initial) => {
                const index = refIndex++;
                refs[index] ??= { current: initial };
                return refs[index];
            },
            useState: () => {
                const index = stateIndex++;
                return [
                    states[index],
                    (value) => {
                        states[index] = value;
                    },
                ];
            },
        },
        'react/jsx-runtime': { jsx: element, jsxs: element },
        'react-native': {
            View: 'View',
            Text: 'Text',
            Pressable: 'Pressable',
            useColorScheme: () => 'dark',
        },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': { DafButton: 'Button' },
        '../design-system/tokens': {
            getDafTheme: () => ({ text: { brand: 'green', primary: 'white' } }),
        },
        './directions': {
            formatDirectionsArrivalTime: () => '6:15',
            getDirectionsSteps: (route) => route?.steps ?? [{ stepIndex: 2 }],
            formatDirectionsDistance: () => '4 mi',
            formatDirectionsManeuverDistance: (distance) => `${distance} ft`,
        },
        './driving-guidance-cards': {
            DestinationCard: 'DestinationCard',
            getManeuverIcon: () => 'corner-up-right',
        },
        './native-components': {
            NativeWindBottomSheet: 'BottomSheet',
            NativeWindBottomSheetFlatList: 'FlatList',
        },
        './roundabout-guidance': {
            getRoundaboutExitNumber: (step) => step.exit_number ?? null,
        },
    };
    new Function('require', 'module', 'exports', source)(
        (name) => mocks[name],
        module,
        module.exports,
    );
    return {
        ...module.exports,
        DrivingStepsSheet(props) {
            refIndex = 0;
            stateIndex = 0;
            effects.length = 0;
            const sheet = module.exports.DrivingStepsSheet(props);
            refs[0].current = { snapToIndex: (index) => snaps.push(index) };
            refs[1].current = {
                scrollToIndex: (options) => scrolls.push(['index', options]),
                scrollToOffset: (options) => scrolls.push(['offset', options]),
            };
            return sheet;
        },
        snaps,
        scrolls,
        effects,
    };
}

test('the drawer snaps between its measured summary and two-thirds of the map', () => {
    const { DrivingStepsSheet, snaps } = loadSheet();
    const cancel = () => {};
    let measuredHeight;
    const sheet = DrivingStepsSheet({
        containerHeight: 900,
        collapsedHeight: 170,
        bottomInset: 34,
        onCollapsedHeightChange: (height) => {
            measuredHeight = height;
        },
        onCancelRoute: cancel,
        remainingValues: { distanceRemaining: 1000 },
    });
    assert.deepEqual(sheet.props.snapPoints, [170, 600]);
    assert.equal(sheet.props.enablePanDownToClose, false);
    assert.equal(sheet.props.enableDynamicSizing, false);
    assert.equal(sheet.props.enableOverDrag, false);
    const handle = sheet.props.handleComponent();
    handle.props.onLayout({ nativeEvent: { layout: { height: 180 } } });
    assert.equal(measuredHeight, 180);
    const [toggle, summary] = handle.props.children;
    toggle.props.onPress();
    assert.deepEqual(snaps, [1]);
    assert.equal(toggle.props.accessibilityState.expanded, false);
    assert.equal(summary.props.onCancelRoute, cancel);
    const list = getStepList(sheet);
    assert.equal(list.type, 'FlatList');
    assert.equal(list.props.contentContainerStyle.paddingBottom, 50);
    assert.equal(list.props.keyExtractor({ stepIndex: 2 }), '2');
});

test('the accessible toggle collapses an expanded drawer', () => {
    const { DrivingStepsSheet, snaps } = loadSheet(true);
    const sheet = DrivingStepsSheet({
        containerHeight: 400,
        collapsedHeight: 160,
        onCollapsedHeightChange() {},
    });
    const toggle = sheet.props.handleComponent().props.children[0];
    toggle.props.onPress();
    assert.deepEqual(snaps, [0]);
    assert.equal(toggle.props.accessibilityLabel, 'Hide direction steps');
});

test('rows show live distance, current-step emphasis and roundabout exit numbers', () => {
    const { DrivingStepRow } = loadSheet();
    const row = DrivingStepRow({
        item: {
            stepIndex: 2,
            isCurrent: true,
            instruction: 'Turn right',
            displayDistance: 75,
        },
    });
    const [tile, instruction, distance] = row.props.children;
    assert.equal(tile.props.children.props.name, 'corner-up-right');
    assert.equal(tile.props.children.props.color, 'green');
    assert.equal(instruction.props.children[0].props.children, 'Turn right');
    assert.equal(instruction.props.children[1].props.children, 'Now');
    assert.equal(distance.props.children, '75 ft');
    const roundabout = DrivingStepRow({
        item: { stepIndex: 3, exit_number: 3 },
    });
    assert.equal(
        roundabout.props.children[0].props.children.props.accessibilityLabel,
        'Roundabout exit 3',
    );
    const arrival = DrivingStepRow({
        item: { type: 10, displayDistance: 0 },
        arrivalLabel: '6:15',
    });
    assert.equal(arrival.props.children[2].props.children, '6:15');
});

test('tapping a past step delegates its coordinate to the shared preview action', () => {
    const { DrivingStepsSheet, DrivingStepRow, snaps } = loadSheet(true);
    const focused = [];
    const sheet = DrivingStepsSheet({
        containerHeight: 900,
        collapsedHeight: 170,
        onStepFocus: (coordinate, stepIndex) =>
            focused.push({ coordinate, stepIndex }),
    });
    const item = {
        stepIndex: 0,
        instruction: 'Depart',
        coordinate: [-87, 41],
        isCurrent: false,
    };
    const rowElement = getStepList(sheet).props.renderItem({ item });
    const row = DrivingStepRow(rowElement.props);
    assert.equal(row.props.accessibilityRole, 'button');
    row.props.onPress();
    assert.deepEqual(snaps, []);
    assert.deepEqual(focused, [{ coordinate: [-87, 41], stepIndex: 0 }]);
    assert.equal(
        DrivingStepRow({ item: { stepIndex: 1 } }).props.disabled,
        true,
    );
});

test('opening the list after lag scrolls directly to the current step and retries unmeasured rows', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { DrivingStepsSheet, scrolls, effects } = loadSheet(true);
    const steps = Array.from({ length: 60 }, (_, index) => ({
        stepIndex: index,
        isCurrent: index === 45,
    }));
    const sheet = DrivingStepsSheet({
        containerHeight: 900,
        collapsedHeight: 170,
        directionsRoute: { steps },
    });
    const cleanup = effects[0]();
    assert.deepEqual(scrolls, [['index', { index: 45, animated: false }]]);
    assert.equal(getStepList(sheet).props.data.length, 60);
    getStepList(sheet).props.onScrollToIndexFailed({
        index: 45,
        averageItemLength: 70,
    });
    assert.deepEqual(scrolls.at(-1), [
        'offset',
        { offset: 3150, animated: false },
    ]);
    t.mock.timers.tick(100);
    assert.deepEqual(scrolls.at(-1), ['index', { index: 45, animated: false }]);
    getStepList(sheet).props.onScrollToIndexFailed({
        index: 45,
        averageItemLength: 70,
    });
    const beforeCleanup = scrolls.length;
    cleanup();
    t.mock.timers.tick(100);
    assert.equal(scrolls.length, beforeCleanup);
});

test('the closed list waits to scroll until it is expanded', () => {
    const { DrivingStepsSheet, scrolls, effects } = loadSheet(false);
    DrivingStepsSheet({
        containerHeight: 900,
        collapsedHeight: 170,
        directionsRoute: { steps: [{ stepIndex: 0, isCurrent: true }] },
    });
    effects[0]();
    assert.deepEqual(scrolls, []);
});

test('manual list scrolling pauses synchronization until the floating Sync button is pressed', () => {
    const { DrivingStepsSheet, scrolls, effects } = loadSheet(true);
    const props = {
        containerHeight: 900,
        collapsedHeight: 170,
        bottomInset: 34,
        directionsRoute: {
            steps: [{ stepIndex: 0 }, { stepIndex: 1, isCurrent: true }],
        },
    };
    let sheet = DrivingStepsSheet(props);
    effects[0]();
    assert.equal(scrolls.at(-1)[1].index, 1);
    getStepList(sheet).props.onScrollBeginDrag();
    const beforeManualScroll = scrolls.length;
    props.directionsRoute = {
        steps: [
            { stepIndex: 0 },
            { stepIndex: 1 },
            { stepIndex: 2, isCurrent: true },
        ],
    };
    sheet = DrivingStepsSheet(props);
    effects[0]();
    getStepList(sheet).props.onLayout();
    assert.equal(scrolls.length, beforeManualScroll);
    const floatingControl = sheet.props.children.props.children[1];
    assert.equal(floatingControl.props.style.bottom, 46);
    const syncButton = floatingControl.props.children;
    assert.equal(syncButton.props.children, 'Sync');
    syncButton.props.onPress();
    sheet = DrivingStepsSheet(props);
    effects[0]();
    assert.deepEqual(scrolls.at(-1), ['index', { index: 2, animated: false }]);
    assert.equal(sheet.props.children.props.children[1], null);
});
