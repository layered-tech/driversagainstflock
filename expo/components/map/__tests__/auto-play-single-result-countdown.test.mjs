import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS,
    createAutoPlaySingleResultCountdown,
} from '../../auto-play-single-result-countdown.js';

function createManualTimer() {
    const scheduled = [];

    return {
        clearTimeoutFn(timeout) {
            timeout.cancelled = true;
        },
        runNext() {
            const timeout = scheduled.shift();

            if (timeout && !timeout.cancelled) {
                timeout.callback();
            }
        },
        setTimeoutFn(callback, delay) {
            const timeout = { callback, cancelled: false, delay };
            scheduled.push(timeout);

            return timeout;
        },
    };
}

describe('Auto Play single-result countdown', () => {
    test('shows three seconds before advancing the result', () => {
        const timer = createManualTimer();
        const ticks = [];
        let completions = 0;

        createAutoPlaySingleResultCountdown({
            ...timer,
            onComplete: () => {
                completions += 1;
            },
            onTick: (remainingSeconds) => {
                ticks.push(remainingSeconds);
            },
        });

        assert.equal(AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS, 3);
        assert.deepEqual(ticks, [3]);

        timer.runNext();
        timer.runNext();

        assert.deepEqual(ticks, [3, 2, 1]);
        assert.equal(completions, 0);

        timer.runNext();

        assert.equal(completions, 1);
    });

    test('cancels without advancing when the user acts first', () => {
        const timer = createManualTimer();
        let cancellations = 0;
        let completions = 0;
        const countdown = createAutoPlaySingleResultCountdown({
            ...timer,
            onCancel: () => {
                cancellations += 1;
            },
            onComplete: () => {
                completions += 1;
            },
        });

        countdown.cancel();
        timer.runNext();

        assert.equal(cancellations, 1);
        assert.equal(completions, 0);
    });

    test('cancels a stale voice request before advancing', () => {
        const timer = createManualTimer();
        let requestIsCurrent = true;
        let cancellations = 0;
        let completions = 0;

        createAutoPlaySingleResultCountdown({
            ...timer,
            onCancel: () => {
                cancellations += 1;
            },
            onComplete: () => {
                completions += 1;
            },
            requestIsCurrent: () => requestIsCurrent,
        });

        requestIsCurrent = false;
        timer.runNext();

        assert.equal(cancellations, 1);
        assert.equal(completions, 0);
    });
});
