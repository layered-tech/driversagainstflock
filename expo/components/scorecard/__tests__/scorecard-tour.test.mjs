import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createHookHarness,
    loadTourModule,
} from '../../map/__tests__/tour-test-helpers.mjs';
import { createE2EScorecardFixture } from '../scorecard-e2e-fixture.js';
import {
    createEmptyScorecardState,
    getScorecardFuelCostSettings,
    getScorecardLevel,
    getScorecardWindowStats,
    SCORECARD_BADGES,
    SCORECARD_FIXED_MPG,
    SCORECARD_STATS_WINDOW_DAYS,
    SCORECARD_XP_PER_AVOIDED_CAMERA,
} from '../scorecard-engine.js';
import { SCORECARD_TOUR } from '../scorecard-tour.js';

function allElements(element, predicate) {
    if (!element || typeof element !== 'object') {
        return [];
    }

    if (Array.isArray(element)) {
        return element.flatMap((child) => allElements(child, predicate));
    }

    return [
        ...(predicate(element) ? [element] : []),
        ...allElements(element.props?.children, predicate),
    ];
}

function findByTestID(tree, testID) {
    return allElements(tree, (element) => element.props?.testID === testID)[0];
}

function createDashboardHarness({
    focused = true,
    hydrated = true,
    state = createE2EScorecardFixture().state,
    tourProgress = { status: 'pending', dismissedSteps: [] },
} = {}) {
    const hooks = createHookHarness();
    const actions = [];
    const routes = [];
    let screenIsFocused = focused;
    const tour = {
        progress: tourProgress,
        start: () => actions.push('start-tour'),
        dismissStep: () => actions.push('dismiss-tour-step'),
        reopenStep: () => actions.push('back-tour-step'),
        skip: () => actions.push('skip-tour'),
        reset: () => actions.push('reset-tour'),
    };
    const scorecard = {
        backupFilesAreAvailable: true,
        badges: SCORECARD_BADGES.map((badge) => ({
            ...badge,
            earned: Boolean(state.badgeUnlocks[badge.id]),
        })),
        deleteHistory: () => actions.push('delete-history'),
        exportBackup: () => actions.push('export-backup'),
        isHydrated: hydrated,
        level: getScorecardLevel(state.lifetime.xp),
        pickBackupForImport: () => actions.push('pick-backup'),
        resetFuelCostSettings: () => actions.push('reset-fuel'),
        restoreBackup: () => actions.push('restore-backup'),
        scorecardState: state,
        secureStorageIsAvailable: true,
        setFuelCostSettings: () => actions.push('set-fuel'),
        setTrackingEnabled: () => actions.push('set-tracking'),
        windowStats: getScorecardWindowStats(state),
    };
    const { default: Dashboard } = loadTourModule(
        new URL('../scorecard-dashboard-screen.js', import.meta.url),
        {
            react: hooks.react,
            'expo-router': {
                router: { push: (route) => routes.push(route) },
                useIsFocused: () => screenIsFocused,
            },
            'react-native': {
                Alert: { alert: (...args) => actions.push(['alert', ...args]) },
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                Switch: 'Switch',
                Text: 'Text',
                View: 'View',
                useColorScheme: () => 'light',
            },
            'react-native-svg': { default: 'Svg', Circle: 'Circle' },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ top: 24, bottom: 28 }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/tokens': {
                dafSemanticColors: { brand: '#34D399' },
                getDafTheme: () => ({
                    border: { strong: '#333' },
                    text: { brand: '#34D399' },
                }),
            },
            '../tour-overlay': { TourOverlay: 'TourOverlay' },
            '../tour-target': { TourTarget: 'TourTarget' },
            '../user-tours': {
                useUserTour: (id) => {
                    assert.equal(id, 'scorecard');
                    return tour;
                },
            },
            './scorecard-context': { useScorecard: () => scorecard },
            './scorecard-engine': { getScorecardFuelCostSettings },
            './scorecard-fuel-settings-modal': {
                ScorecardFuelSettingsModal: 'FuelSettingsModal',
            },
            './scorecard-screen-header': {
                ScorecardPrivacyFooter: 'PrivacyFooter',
                ScorecardScreenHeader: 'Header',
            },
            './scorecard-tour': { SCORECARD_TOUR },
        },
    );

    return {
        actions,
        routes,
        scorecard,
        tour,
        render: () => hooks.render(Dashboard),
        setFocused: (value) => (screenIsFocused = value),
    };
}

describe('scorecard first visit tour', () => {
    test('replays a debug reset while the hydrated dashboard stays mounted', () => {
        const harness = createDashboardHarness({
            tourProgress: { status: 'skipped', dismissedSteps: [] },
        });
        harness.render();
        harness.actions.length = 0;
        harness.tour.progress = { status: 'pending', dismissedSteps: [] };
        harness.render();
        assert.deepEqual(harness.actions, ['start-tour']);
    });

    test('starts only after both histories hydrate on the focused dashboard', () => {
        const harness = createDashboardHarness({
            focused: false,
            hydrated: false,
            tourProgress: null,
        });
        harness.render();
        assert.deepEqual(harness.actions, []);
        harness.setFocused(true);
        harness.render();
        assert.deepEqual(harness.actions, []);
        harness.scorecard.isHydrated = true;
        harness.render();
        assert.deepEqual(harness.actions, []);
        harness.tour.progress = { status: 'pending', dismissedSteps: [] };
        const tree = harness.render();
        assert.deepEqual(harness.actions, ['start-tour']);
        assert.equal(
            allElements(tree, (element) => element.type === 'TourOverlay')[0]
                .props.enabled,
            true,
        );
    });

    test('registers every section with the shared scrollable spotlight', () => {
        const harness = createDashboardHarness();
        const tree = harness.render();
        const overlay = allElements(
            tree,
            (element) => element.type === 'TourOverlay',
        )[0].props;
        const targets = allElements(
            tree,
            (element) => element.type === 'TourTarget',
        );
        assert.equal(SCORECARD_TOUR.steps.length, 13);
        assert.deepEqual(
            targets.map((element) => element.props.id),
            SCORECARD_TOUR.steps.map((step) => step.target),
        );
        assert.equal(new Set(targets.map(({ props }) => props.id)).size, 13);
        assert.ok(
            targets.every(({ props }) => props.targets === overlay.targets),
        );
        assert.ok(SCORECARD_TOUR.steps.every((step) => step.scroll));
        assert.equal(overlay.prefix, 'scorecard-tour');
        assert.equal(overlay.steps, SCORECARD_TOUR.steps);
        assert.equal(overlay.tour, harness.tour);
        assert.equal(overlay.restoreScrollOnFinish, true);
        const scroll = allElements(
            tree,
            (element) => element.type === 'ScrollView',
        )[0];
        assert.equal(scroll.props.ref, overlay.scrollRef);
        assert.equal(scroll.props.children.props.ref, overlay.contentRef);
        assert.equal(scroll.props.children.props.collapsable, false);
        for (const id of ['avoided', 'crossings', 'streak']) {
            assert.equal(
                targets.find(({ props }) => props.id === id).props.className,
                'flex-1',
            );
        }
    });

    test('opening and browsing the tour preserves scorecard data and settings', () => {
        const harness = createDashboardHarness();
        const previousState = structuredClone(harness.scorecard.scorecardState);
        const tree = harness.render();
        assert.deepEqual(harness.actions, ['start-tour']);
        const overlay = allElements(
            tree,
            (element) => element.type === 'TourOverlay',
        )[0].props;
        overlay.tour.dismissStep('privacy-score');
        overlay.tour.reopenStep('privacy-score');
        overlay.tour.skip();
        assert.deepEqual(harness.actions, [
            'start-tour',
            'dismiss-tour-step',
            'back-tour-step',
            'skip-tour',
        ]);
        assert.deepEqual(harness.scorecard.scorecardState, previousState);
        assert.deepEqual(harness.routes, []);
        assert.equal(
            findByTestID(tree, 'scorecard-tracking-toggle').props.value,
            true,
        );
        assert.equal(
            findByTestID(tree, 'scorecard-tracking-toggle').props.onValueChange,
            harness.scorecard.setTrackingEnabled,
        );
    });

    test('hides the tour while the dashboard is unfocused or fuel settings are open', () => {
        const harness = createDashboardHarness();
        const getOverlay = (tree) =>
            allElements(tree, (element) => element.type === 'TourOverlay')[0]
                .props;
        let tree = harness.render();
        harness.setFocused(false);
        assert.equal(getOverlay(harness.render()).enabled, false);
        harness.setFocused(true);
        tree = harness.render();
        findByTestID(tree, 'scorecard-privacy-costs').props.onPress();
        tree = harness.render();
        assert.equal(getOverlay(tree).enabled, false);
        const fuelModal = allElements(
            tree,
            (element) => element.type === 'FuelSettingsModal',
        )[0];
        assert.equal(fuelModal.props.visible, true);
        fuelModal.props.onDismiss();
        assert.equal(getOverlay(harness.render()).enabled, true);
        assert.ok(!harness.actions.includes('set-fuel'));
    });

    test('keeps every target available for a scorecard without trips', () => {
        const harness = createDashboardHarness({
            state: createEmptyScorecardState(),
        });
        const tree = harness.render();
        const targets = allElements(
            tree,
            (element) => element.type === 'TourTarget',
        );
        assert.equal(targets.length, SCORECARD_TOUR.steps.length);
        assert.equal(harness.scorecard.windowStats.privacyScore, null);
        assert.equal(harness.scorecard.level.xp, 0);
        assert.deepEqual(harness.actions, ['start-tour']);
    });
});

describe('scorecard tour explanations', () => {
    const step = (id) => SCORECARD_TOUR.steps.find((entry) => entry.id === id);

    test('uses the scorecard calculation constants and distinguishes lifetime awards', () => {
        const fixture = createE2EScorecardFixture().state;
        const stats = getScorecardWindowStats(fixture);
        assert.equal(
            stats.privacyScore,
            Math.round(
                (100 * stats.avoidedCameraCount) /
                    (stats.avoidedCameraCount +
                        1.5 * stats.cameraCrossingCount),
            ),
        );
        assert.match(step('privacy-score').description, /1\.5 × crossings/);
        assert.ok(
            step('privacy-score').description.includes(
                `${SCORECARD_STATS_WINDOW_DAYS} days`,
            ),
        );
        assert.ok(
            step('level').description.includes(
                `${SCORECARD_XP_PER_AVOIDED_CAMERA} XP`,
            ),
        );
        assert.match(step('level').description, /do not subtract XP/);
        assert.match(step('level').description, /XP stays after/);
        assert.match(
            step('badges').description,
            /seven consecutive clean drives/,
        );
        assert.match(step('streak').description, /counts drives/);
        assert.match(step('weekly-crossings').description, /still in progress/);
    });

    test('explains estimates and exported files without claiming all app data stays local', () => {
        assert.ok(
            step('privacy-costs').description.includes(
                `${SCORECARD_FIXED_MPG} MPG`,
            ),
        );
        assert.match(step('privacy-costs').description, /extra miles ÷ MPG/);
        assert.match(
            step('privacy-costs').description,
            /Missing prices stay unavailable/,
        );
        assert.match(
            step('crossings').description,
            /does not receive a plate image/,
        );
        assert.match(step('timeline').description, /simulation/);
        assert.match(step('backup').description, /file is not encrypted/);
        assert.match(step('backup').description, /replaces the scorecard/);
        assert.match(
            step('delete-history').description,
            /does not remove backup files/,
        );
        assert.match(step('data-handling').description, /expire after 30 days/);
        assert.match(step('data-handling').description, /normal services/);
        assert.doesNotMatch(
            SCORECARD_TOUR.steps.map((entry) => entry.description).join(' '),
            /no data leaves|never uses the network|all data stays on your device/i,
        );
    });
});
