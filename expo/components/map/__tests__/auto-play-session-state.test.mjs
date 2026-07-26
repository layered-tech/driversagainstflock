import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
    addAutoPlaySessionStateListener,
    autoPlaySessionOwnsForegroundLocation,
    getAutoPlaySessionState,
    setAutoPlaySessionConnected,
    setAutoPlaySessionRenderState,
} from '../../auto-play-session-state.js';

afterEach(() => {
    setAutoPlaySessionConnected(false);
});

describe('automotive session state', () => {
    test('lets a connected Android Auto session own foreground location', () => {
        setAutoPlaySessionConnected(true);
        setAutoPlaySessionRenderState('didDisappear');

        assert.equal(autoPlaySessionOwnsForegroundLocation('android'), true);
        assert.equal(autoPlaySessionOwnsForegroundLocation('ios'), false);
    });

    test('uses CarPlay scene visibility independently of phone state', () => {
        setAutoPlaySessionConnected(true);
        setAutoPlaySessionRenderState('didAppear');

        assert.equal(autoPlaySessionOwnsForegroundLocation('ios'), true);

        setAutoPlaySessionRenderState('didDisappear');

        assert.equal(autoPlaySessionOwnsForegroundLocation('ios'), false);
    });

    test('replays state and resets visibility on disconnect', () => {
        const observedStates = [];

        setAutoPlaySessionConnected(true);
        setAutoPlaySessionRenderState('didAppear');
        const unsubscribe = addAutoPlaySessionStateListener((state) => {
            observedStates.push(state);
        });

        setAutoPlaySessionConnected(false);
        unsubscribe();

        assert.equal(observedStates[0].isVisible, true);
        assert.deepEqual(getAutoPlaySessionState(), {
            isConnected: false,
            isVisible: false,
            renderState: 'didDisappear',
        });
    });
});
