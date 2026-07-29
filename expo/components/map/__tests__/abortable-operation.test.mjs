import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runAbortableOperation } from '../abortable-operation.js';

function createDeferred() {
    let reject;
    let resolve;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });

    return { promise, reject, resolve };
}

describe('abortable operation', () => {
    test('does not start an operation for an already-aborted signal', async () => {
        const abortController = new AbortController();
        let operationWasStarted = false;

        abortController.abort();

        await assert.rejects(
            runAbortableOperation(() => {
                operationWasStarted = true;

                return Promise.resolve('unexpected');
            }, abortController.signal),
            { name: 'AbortError' },
        );
        assert.equal(operationWasStarted, false);
    });

    test('rejects when response body work remains pending after abort', async () => {
        const abortController = new AbortController();
        const body = createDeferred();
        const events = [];
        const operation = runAbortableOperation(() => {
            abortController.signal.addEventListener('abort', () => {
                events.push('transport-canceled');
            });

            return Promise.resolve().then(() => body.promise);
        }, abortController.signal);

        abortController.abort();

        await assert.rejects(operation, { name: 'AbortError' });
        assert.deepEqual(events, ['transport-canceled']);

        body.resolve('late-body');
        await new Promise((resolve) => setImmediate(resolve));
    });

    test('preserves successful values and operation failures', async () => {
        await assert.doesNotReject(
            runAbortableOperation(() => Promise.resolve('result')),
        );
        await assert.rejects(
            runAbortableOperation(() => Promise.reject(new Error('failed'))),
            /failed/,
        );
    });
});
