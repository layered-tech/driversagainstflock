import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function createHarness({
    navigating = true,
    ready = true,
    failPush = false,
} = {}) {
    const route = {};
    const location = { latitude: 41, longitude: -87 };
    const steps = Array.from({ length: 12 }, (_, index) => ({
        stepIndex: index,
        coordinate: [-87 + index / 100, 41],
        type: index === 11 ? 10 : index % 7,
        instruction: index === 11 ? 'Arrive at destination' : `Turn ${index}`,
        displayDistance: index * 100,
        isCurrent: index === 2,
    }));
    const opened = [];
    const errors = [];
    const focused = [];
    const events = [];
    const context = vm.createContext({
        activeNavigationRoute: navigating ? route : null,
        rootMapTemplate: {},
        rootMapTemplateIsReady: ready,
        lastNavigationGuidanceLocation: location,
        navigationProgressTracker: {
            update: () => ({ alongRouteDistance: 200 }),
        },
        getActiveDirectionsManeuver(candidate, userLocation, progress) {
            assert.equal(candidate, route);
            assert.equal(userLocation, location);
            assert.equal(progress.alongRouteDistance, 200);
            return { stepIndex: 2 };
        },
        getDirectionsSteps(candidate, activeManeuver) {
            assert.equal(candidate, route);
            assert.equal(activeManeuver.stepIndex, 2);
            return steps;
        },
        popTemplate: async () => {
            events.push('pop');
            opened.at(-1).config.onPopped();
        },
        getDirectionsStepHeading: (_route, stepIndex) => stepIndex * 10,
        getAutoPlayMapControlHandlers: () => ({
            handleManeuverFocus: async (coordinate, options) => {
                events.push('focus');
                focused.push({ coordinate, options });
                return true;
            },
        }),
        loadAutoPlayModule: () => ({
            HybridAutoPlay: { popTemplate: () => context.popTemplate() },
            ListTemplate: class {
                constructor(config) {
                    this.config = config;
                    opened.push(this);
                }
                push() {
                    return failPush
                        ? Promise.reject(new Error('Push failed'))
                        : Promise.resolve();
                }
                updateSections(sections) {
                    this.config.sections = sections;
                    return Promise.resolve();
                }
            },
        }),
        getAutoPlayManeuverImage: (step) => `maneuver-asset-${step.type}`,
        makeAutoText: (text) => ({ text }),
        getManeuverInstruction: (step) => step.instruction,
        formatDirectionsManeuverDistance: (distance) => `${distance} m`,
        makeDisabledSearchRow: (title) => ({
            title: { text: title },
            enabled: false,
        }),
        getBackHeaderAction: (onPress) => ({
            android: { startHeaderAction: { onPress } },
        }),
        updateSearchTemplateSection: (template, section) =>
            template.updateSections(section),
        showAutoPlayError: (...args) => errors.push(args),
    });
    const start = source.indexOf('function makeRouteStepsSection(');
    const end = source.indexOf('function openSearchTemplate(', start);
    assert.ok(start >= 0 && end > start);
    for (const name of ['getFiniteNumber', 'normalizeCoordinatePair']) {
        vm.runInContext(
            source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))[0],
            context,
        );
    }
    vm.runInContext(source.slice(start, end), context);
    return { context, opened, errors, steps, focused, events };
}

test('the route steps icon uses the Font Awesome 4.7 list-ul glyph', () => {
    assert.match(source, /'list-ul': 0xf0ca/);
    assert.match(
        source,
        /ROOT_HEADER_ROUTE_STEPS_IMAGE = makeButtonGlyphImage\('list-ul'/,
    );
});

test('opens a ListTemplate with only current and upcoming steps, including arrival', async () => {
    const { context, opened } = createHarness();
    await vm.runInContext('openRouteStepsTemplate()', context);
    const template = opened[0];
    assert.equal(template.config.title.text, 'Route steps');
    const titles = [];
    while (true) {
        const rows = template.config.sections.items;
        assert.ok(rows.length <= 6);
        for (const row of rows.filter((row) => row.image)) {
            const stepIndex = Number(row.title.text.split('.')[0]) + 1;
            assert.equal(row.image.type, 'asset');
            assert.equal(row.image.color, 'default');
            assert.equal(
                row.image.image,
                `maneuver-asset-${stepIndex === 11 ? 10 : stepIndex % 7}`,
            );
            assert.equal(row.imageType, 'icon');
        }
        for (const row of rows.filter((row) => !row.image)) {
            assert.equal(row.image, undefined);
        }
        titles.push(
            ...rows.filter((row) => row.image).map((row) => row.title.text),
        );
        const more = rows.find((row) => row.title.text === 'More steps');
        if (!more) break;
        await more.onPress();
    }
    assert.equal(titles.length, 10);
    assert.match(titles[0], /Turn 2$/);
    assert.match(titles.at(-1), /Arrive at destination$/);
    assert.equal(
        titles.some((title) => /Turn [01]$/.test(title)),
        false,
    );
    const previous = template.config.sections.items.find(
        (row) => row.title.text === 'Previous steps',
    );
    await previous.onPress();
    assert.match(
        template.config.sections.items.find((row) => row.image).title.text,
        /Turn 6$/,
    );
    assert.equal(
        template.config.sections.items.find((row) => row.image).detailedText
            .text,
        '600 m',
    );
    assert.equal(
        typeof template.config.headerActions.android.startHeaderAction.onPress,
        'function',
    );
});

test('stale route-step button taps do nothing after navigation stops or before the root is ready', async () => {
    for (const options of [{ navigating: false }, { ready: false }]) {
        const { context, opened } = createHarness(options);
        await vm.runInContext('openRouteStepsTemplate()', context);
        assert.equal(opened.length, 0);
    }
});

test('dismissed or stale route-step pages cannot update the template', async () => {
    for (const reason of ['popped', 'route-ended', 'reconnected']) {
        const { context, opened } = createHarness();
        await vm.runInContext('openRouteStepsTemplate()', context);
        const template = opened[0];
        const section = template.config.sections;
        const more = section.items.find(
            (row) => row.title.text === 'More steps',
        );
        if (reason === 'popped') template.config.onPopped();
        if (reason === 'route-ended') context.activeNavigationRoute = null;
        if (reason === 'reconnected') context.rootMapTemplate = {};
        await more.onPress();
        assert.equal(template.config.sections, section);
    }
});

test('a rejected list push reports an error without stopping navigation', async () => {
    const { context, errors } = createHarness({ failPush: true });
    await vm.runInContext('openRouteStepsTemplate()', context);
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], 'Route steps unavailable');
    assert.ok(context.activeNavigationRoute);
});

test('routes without maneuver data show an informative empty row', async () => {
    const { context, opened, steps } = createHarness();
    steps.length = 0;
    await vm.runInContext('openRouteStepsTemplate()', context);
    assert.equal(
        opened[0].config.sections.items[0].title.text,
        'No upcoming steps',
    );
});

test('selecting a maneuver closes the list and previews its coordinate and heading', async () => {
    const { context, opened, steps, focused, events } = createHarness();
    await vm.runInContext('openRouteStepsTemplate()', context);
    const row = opened[0].config.sections.items[0];
    assert.equal(row.type, 'default');
    await row.onPress();
    assert.deepEqual(events, ['pop', 'focus']);
    assert.deepEqual(
        JSON.parse(JSON.stringify(focused[0].coordinate)),
        steps[2].coordinate,
    );
    assert.equal(focused[0].options.heading, 20);
    assert.equal(focused[0].options.shouldApply(), true);
    assert.ok(context.activeNavigationRoute);
    context.activeNavigationRoute = null;
    assert.equal(focused[0].options.shouldApply(), false);
});

test('stale and coordinate-less steps cannot pop the list or move the map', async () => {
    for (const reason of [
        'popped',
        'route-ended',
        'reconnected',
        'not-ready',
        'no-coordinate',
    ]) {
        const { context, opened, steps, events } = createHarness();
        if (reason === 'no-coordinate') steps[2].coordinate = null;
        await vm.runInContext('openRouteStepsTemplate()', context);
        const row = opened[0].config.sections.items[0];
        if (reason === 'popped') opened[0].config.onPopped();
        if (reason === 'route-ended') context.activeNavigationRoute = null;
        if (reason === 'reconnected') context.rootMapTemplate = {};
        if (reason === 'not-ready') context.rootMapTemplateIsReady = false;
        if (reason === 'no-coordinate') assert.equal(row.enabled, false);
        await row.onPress();
        assert.deepEqual(events, []);
    }
});

test('a pending pop ignores duplicate taps and cancels focus after route replacement', async () => {
    const { context, opened, focused } = createHarness();
    await vm.runInContext('openRouteStepsTemplate()', context);
    let finishPop;
    let pops = 0;
    context.popTemplate = () => {
        pops += 1;
        return new Promise((resolve) => {
            finishPop = resolve;
        });
    };
    const row = opened[0].config.sections.items[0];
    const pending = row.onPress();
    await row.onPress();
    assert.equal(pops, 1);
    context.activeNavigationRoute = {};
    finishPop();
    await pending;
    assert.equal(focused.length, 0);
});

test('a failed pop keeps the map untouched and reports the preview error', async () => {
    const { context, opened, focused, errors } = createHarness();
    await vm.runInContext('openRouteStepsTemplate()', context);
    context.popTemplate = async () => {
        throw new Error('Pop failed');
    };
    await opened[0].config.sections.items[0].onPress();
    assert.equal(focused.length, 0);
    assert.equal(errors[0][0], 'Step preview unavailable');
    assert.ok(context.activeNavigationRoute);
});
