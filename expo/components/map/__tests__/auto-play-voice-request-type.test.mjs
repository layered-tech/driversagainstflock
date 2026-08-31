import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveAutoPlayVoiceRequestType } from '../../auto-play-voice-request-type.js';

describe('Auto Play voice request type', () => {
    test('keeps current native request types distinct', () => {
        assert.equal(
            resolveAutoPlayVoiceRequestType({ requestType: 'navigation' }),
            'navigation',
        );
        assert.equal(
            resolveAutoPlayVoiceRequestType({ requestType: 'directions' }),
            'directions',
        );
        assert.equal(
            resolveAutoPlayVoiceRequestType({ requestType: 'search' }),
            'search',
        );
    });

    test('keeps lossy and unknown text-only requests results-only', () => {
        for (const requestType of ['query', undefined, null, 'unknown']) {
            assert.equal(
                resolveAutoPlayVoiceRequestType({ requestType }),
                'search',
                String(requestType),
            );
        }
    });

    test('does not treat obsolete boolean callbacks as navigation requests', () => {
        assert.equal(
            resolveAutoPlayVoiceRequestType({
                hasDestinationCoordinates: true,
                requestType: true,
            }),
            'directions',
        );
        assert.equal(
            resolveAutoPlayVoiceRequestType({ requestType: false }),
            'search',
        );
    });

    test('previews coordinate-backed requests when their type is unavailable', () => {
        assert.equal(
            resolveAutoPlayVoiceRequestType({
                hasDestinationCoordinates: true,
            }),
            'directions',
        );
    });
});
