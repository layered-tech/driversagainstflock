import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runChangesetUpload } from '../changeset-lifecycle.js';

describe('runChangesetUpload', () => {
    test('closes a created changeset after a successful upload', async () => {
        const progress = [];
        const closedChangesets = [];
        const result = await runChangesetUpload({
            close: async (changesetId) => {
                closedChangesets.push(changesetId);
                return false;
            },
            create: async () => 42,
            onProgress: (step) => progress.push(step),
            upload: async (changesetId) => [`uploaded-${changesetId}`],
        });

        assert.deepEqual(result, {
            changesetId: 42,
            closeFailed: false,
            uploadResult: ['uploaded-42'],
        });
        assert.deepEqual(closedChangesets, [42]);
        assert.deepEqual(progress, [
            'creating-changeset',
            'uploading',
            'closing',
        ]);
    });

    test('best-effort closes after upload failure and preserves that error', async () => {
        const uploadError = new Error('upload failed');
        const closedChangesets = [];

        await assert.rejects(
            runChangesetUpload({
                close: async (changesetId) => {
                    closedChangesets.push(changesetId);
                    throw new Error('close failed too');
                },
                create: async () => 99,
                upload: async () => {
                    throw uploadError;
                },
            }),
            (error) => error === uploadError,
        );
        assert.deepEqual(closedChangesets, [99]);
    });

    test('does not close when changeset creation itself fails', async () => {
        let closeCount = 0;

        await assert.rejects(
            runChangesetUpload({
                close: async () => {
                    closeCount += 1;
                },
                create: async () => {
                    throw new Error('create failed');
                },
                upload: async () => null,
            }),
            /create failed/,
        );
        assert.equal(closeCount, 0);
    });
});
