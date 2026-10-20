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
        instruction: index === 11 ? 'Arrive at destination' : `Turn ${index}`,
        displayDistance: index * 100,
        isCurrent: index === 2,
    }));
    const opened = [];
    const errors = [];
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
        loadAutoPlayModule: () => ({
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
    vm.runInContext(source.slice(start, end), context);
    return { context, opened, errors, steps };
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
        titles.push(
            ...rows
                .filter((row) => row.type === 'text')
                .map((row) => row.title.text),
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
        template.config.sections.items.find((row) => row.type === 'text').title
            .text,
        /Turn 6$/,
    );
    assert.equal(
        template.config.sections.items.find((row) => row.type === 'text')
            .detailedText.text,
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
