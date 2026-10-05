import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createTourProgress,
    getVisibleTourStep,
    readTourProgress,
    updateTourProgress,
    writeTourProgress,
} from '../../tour-progress.js';
import { MAP_OPTIONS_TOUR } from '../map-options-tour.js';
import { SCORECARD_TOUR } from '../../scorecard/scorecard-tour.js';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

function createProviderHarness(saved = {}) {
    const hooks = createHookHarness();
    const values = new Map(Object.entries(saved));
    const removals = [];
    const storage = {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => values.set(key, value),
        removeItem: async (key) => {
            removals.push(key);
            values.delete(key);
        },
    };
    const persistence = loadTourModule(
        new URL('../../use-persistent-tour.js', import.meta.url),
        {
            react: hooks.react,
            '@react-native-async-storage/async-storage': storage,
        },
    );
    const { UserToursProvider } = loadTourModule(
        new URL('../../user-tours.js', import.meta.url),
        {
            react: {
                ...hooks.react,
                createContext: () => ({ Provider: 'Provider' }),
                useContext() {},
            },
            './map/map-options-tour': { MAP_OPTIONS_TOUR },
            './scorecard/scorecard-tour': { SCORECARD_TOUR },
            './tour-progress': {
                createTourProgress,
                getVisibleTourStep,
                readTourProgress,
                updateTourProgress,
                writeTourProgress,
            },
            './use-persistent-tour': persistence,
        },
    );
    const render = () => hooks.render(() => UserToursProvider({})).props.value;
    return {
        render,
        storage,
        removals,
        values,
        async settle() {
            for (let i = 0; i < 12; i++) {
                await Promise.resolve();
                render();
            }
            return render();
        },
    };
}

describe('shared feature tour progress', () => {
    test('waits for first feature entry, completes only after all tips, and never restarts completed or skipped tours', () => {
        for (const definition of [MAP_OPTIONS_TOUR, SCORECARD_TOUR]) {
            let progress = createTourProgress();
            assert.equal(
                getVisibleTourStep(progress, definition.steps[0]),
                null,
            );
            progress = updateTourProgress(
                progress,
                { type: 'start' },
                definition.steps,
            );
            for (const step of definition.steps) {
                assert.equal(progress.status, 'active');
                assert.equal(getVisibleTourStep(progress, step), step);
                progress = updateTourProgress(
                    progress,
                    { type: 'dismiss', step: step.id },
                    definition.steps,
                );
            }
            assert.equal(progress.status, 'completed');
            assert.equal(
                updateTourProgress(
                    progress,
                    { type: 'start' },
                    definition.steps,
                ),
                progress,
            );
            const skipped = updateTourProgress(
                { ...createTourProgress(), status: 'active' },
                { type: 'skip' },
                definition.steps,
            );
            assert.equal(
                getVisibleTourStep(skipped, definition.steps[0]),
                null,
            );
            assert.equal(
                updateTourProgress(
                    skipped,
                    { type: 'start' },
                    definition.steps,
                ),
                skipped,
            );
        }
    });

    test('Back reopens a recognized dismissed tip without losing later progress', () => {
        const steps = MAP_OPTIONS_TOUR.steps;
        let progress = {
            status: 'active',
            dismissedSteps: steps.slice(0, 2).map(({ id }) => id),
        };
        progress = updateTourProgress(
            progress,
            { type: 'reopen', step: steps[0].id },
            steps,
        );
        assert.deepEqual(progress.dismissedSteps, [steps[1].id]);
        assert.equal(getVisibleTourStep(progress, steps[0]), steps[0]);
        assert.equal(
            updateTourProgress(
                progress,
                { type: 'dismiss', step: 'unknown' },
                steps,
            ),
            progress,
        );
    });

    test('filters invalid and duplicate saved steps and handles missing, corrupt, incompatible, or unavailable storage', async () => {
        const definition = MAP_OPTIONS_TOUR;
        for (const saved of [
            null,
            '{',
            'null',
            '{}',
            JSON.stringify({
                version: 2,
                status: 'completed',
                dismissedSteps: [],
            }),
        ]) {
            assert.deepEqual(
                await readTourProgress(
                    { getItem: async () => saved },
                    definition,
                ),
                createTourProgress(),
            );
        }
        const restored = await readTourProgress(
            {
                getItem: async () =>
                    JSON.stringify({
                        version: 1,
                        status: 'active',
                        dismissedSteps: [
                            'police-reports',
                            'unknown',
                            null,
                            'police-reports',
                        ],
                    }),
            },
            definition,
        );
        assert.deepEqual(restored, {
            status: 'active',
            dismissedSteps: ['police-reports'],
        });
        assert.deepEqual(
            await readTourProgress(
                {
                    getItem: async () => {
                        throw new Error('offline');
                    },
                },
                definition,
            ),
            createTourProgress(),
        );
        assert.equal(
            await writeTourProgress(
                {
                    setItem: async () => {
                        throw new Error('offline');
                    },
                },
                definition,
                restored,
            ),
            false,
        );
    });

    test('each screen uses independent persistent history and reset removes only the selected tour', async () => {
        const harness = createProviderHarness({
            'scorecard-history': 'retained drive data',
        });
        let tours = await harness.settle();
        assert.equal(tours['map-options'].progress.status, 'pending');
        assert.equal(tours.scorecard.progress.status, 'pending');
        assert.equal(harness.values.size, 1);
        tours['map-options'].start();
        tours = harness.render();
        tours['map-options'].dismissStep('police-reports');
        tours = await harness.settle();
        assert.equal(tours.scorecard.progress.status, 'pending');
        tours.scorecard.start();
        tours = harness.render();
        tours.scorecard.skip();
        tours = await harness.settle();
        const scorecardSaved = harness.values.get(SCORECARD_TOUR.storageKey);
        await tours['map-options'].reset();
        tours = await harness.settle();
        assert.deepEqual(harness.removals, [MAP_OPTIONS_TOUR.storageKey]);
        assert.equal(tours['map-options'].progress.status, 'pending');
        assert.equal(tours.scorecard.progress.status, 'skipped');
        assert.equal(
            harness.values.get(SCORECARD_TOUR.storageKey),
            scorecardSaved,
        );
        assert.equal(
            harness.values.get('scorecard-history'),
            'retained drive data',
        );
        const restored = createProviderHarness(
            Object.fromEntries(harness.values),
        );
        assert.equal(
            (await restored.settle()).scorecard.progress.status,
            'skipped',
        );
    });

    test('reset failure preserves the selected tour and permits retry', async () => {
        const harness = createProviderHarness();
        let tours = await harness.settle();
        tours.scorecard.start();
        tours = harness.render();
        tours.scorecard.skip();
        tours = await harness.settle();
        const removeItem = harness.storage.removeItem;
        harness.storage.removeItem = async () => {
            throw new Error('storage unavailable');
        };
        await assert.rejects(tours.scorecard.reset(), /storage unavailable/);
        assert.equal(harness.render().scorecard.progress.status, 'skipped');
        harness.storage.removeItem = removeItem;
        await tours.scorecard.reset();
        assert.equal(
            (await harness.settle()).scorecard.progress.status,
            'pending',
        );
    });
});
