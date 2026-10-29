import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const place = (id) => ({ id, name: id });

function createHarness({
    warm = null,
    load = Promise.resolve({ places: [] }),
} = {}) {
    let finishPush;
    let listener;
    let snapshot = warm;
    let pushed = false;
    let unsubscribed = false;
    const templates = [];
    const updates = [];
    const selections = [];
    const push = new Promise((resolve) => {
        finishPush = resolve;
    });
    class ListTemplate {
        constructor(config) {
            this.config = config;
            templates.push(this);
        }
        push() {
            return push.then(() => {
                pushed = true;
            });
        }
    }
    const context = {
        loadAutoPlayModule: () => ({ ListTemplate }),
        getSearchSavedLocationsSnapshot: () => snapshot,
        addSearchSavedLocationsListener: (callback) => {
            listener = callback;
            return () => {
                unsubscribed = true;
            };
        },
        loadSearchSavedLocations: () => load,
        getBackHeaderAction: (dismiss) => ({ dismiss, ios: {} }),
        makeAutoText: (text) => ({ text }),
        makeDisabledSearchRow: (title) => ({ title: { text: title } }),
        makeSavedSearchCategoryRows: (saved, _category, _page, onPress) =>
            saved.places.map((result) => ({
                title: { text: result.name },
                onPress: () => onPress(result),
            })),
        makeInitialSavedSearchRows: (saved, onPress) =>
            saved.places.map((result) => ({
                title: { text: result.name },
                onPress: () => onPress(result),
            })),
        updateSearchTemplateSection: (template, section) => {
            updates.push({ pushed, section });
            if (pushed) {
                template.config.sections = section;
            }
            return Promise.resolve(pushed);
        },
        handleSearchResultSelected: (result) => selections.push(result.id),
        handleRootHeaderVoiceSearchPress() {},
        openSearchTemplate() {},
        logAutoPlayPlatformAction() {},
        showAutoPlayError() {},
    };
    const start = source.indexOf('function openSavedSearchCategoryTemplate(');
    const end = source.indexOf('function makeRouteStepsSection(', start);
    const open = vm.runInNewContext(
        `(() => { ${source.slice(start, end)}; return { openSavedSearchCategoryTemplate, openSavedDestinationsTemplate }; })()`,
        context,
    );
    return {
        ...open,
        templates,
        updates,
        selections,
        finishPush,
        changed(saved) {
            snapshot = saved;
            listener(saved);
        },
        get unsubscribed() {
            return unsubscribed;
        },
    };
}

for (const category of ['Recents', 'Favorites']) {
    test(`${category} opens with warm rows and syncs changes after push and appearance`, async () => {
        const harness = createHarness({ warm: { places: [place('saved')] } });
        const pushed = harness.openSavedSearchCategoryTemplate(
            category,
            (result) => harness.selections.push(result.id),
        );
        const template = harness.templates[0];
        assert.equal(template.config.sections.items[0].title.text, 'saved');
        harness.changed({ places: [place('changed-before-push')] });
        assert.equal(harness.updates.length, 0);
        harness.finishPush();
        await pushed;
        assert.equal(
            template.config.sections.items[0].title.text,
            'changed-before-push',
        );
        harness.changed({ places: [place('changed-on-phone')] });
        assert.equal(
            template.config.sections.items[0].title.text,
            'changed-on-phone',
        );
        template.config.onDidAppear();
        template.config.sections.items[0].onPress();
        assert.deepEqual(harness.selections, ['changed-on-phone']);
        const countAfterSelection = harness.updates.length;
        harness.changed({ places: [place('recently-selected')] });
        template.config.onDidAppear();
        assert.equal(harness.updates.length, countAfterSelection);
        template.config.headerActions.dismiss();
        assert.equal(harness.unsubscribed, true);
        const count = harness.updates.length;
        harness.changed({ places: [place('late')] });
        assert.equal(harness.updates.length, count);
        template.config.sections.items[0].onPress();
        assert.deepEqual(harness.selections, ['changed-on-phone']);
    });
}

test('a category loaded during a slow push is reapplied after the host is ready', async () => {
    const saved = { places: [place('hydrated')] };
    const harness = createHarness({ load: Promise.resolve(saved) });
    const pushed = harness.openSavedSearchCategoryTemplate('Recents', () => {});
    await Promise.resolve();
    harness.finishPush();
    await pushed;
    assert.equal(
        harness.templates[0].config.sections.items[0].title.text,
        'hydrated',
    );
    assert.equal(
        harness.updates.every((update) => update.pushed),
        true,
    );
});

test('CarPlay destinations use warmed rows without waiting for unrelated storage', async () => {
    const harness = createHarness({
        warm: { places: [place('home')] },
        load: new Promise(() => {}),
    });
    const opened = harness.openSavedDestinationsTemplate();
    assert.equal(opened.template.config.sections.items[0].title.text, 'home');
    harness.changed({ places: [place('work')] });
    assert.equal(harness.updates.length, 0);
    harness.finishPush();
    await opened.pushPromise;
    assert.equal(opened.template.config.sections.items[0].title.text, 'work');
});

test('unrelated storage failure does not replace an available category with an error', async () => {
    const harness = createHarness({
        warm: { places: [place('favorite')] },
        load: Promise.reject(new Error('primary read failed')),
    });
    const pushed = harness.openSavedSearchCategoryTemplate(
        'Favorites',
        () => {},
    );
    await Promise.resolve();
    harness.finishPush();
    await pushed;
    assert.equal(
        harness.templates[0].config.sections.items[0].title.text,
        'favorite',
    );
});

test('saved destinations hydrate from the app entry before Auto Play registration', () => {
    const entry = readFileSync(
        new URL('../../../index.js', import.meta.url),
        'utf8',
    );
    assert.match(entry, /void loadSearchSavedLocations\(\)\.catch/);
    assert.ok(
        entry.indexOf('void loadSearchSavedLocations()') <
            entry.indexOf('registerAutoPlay();'),
    );
});
