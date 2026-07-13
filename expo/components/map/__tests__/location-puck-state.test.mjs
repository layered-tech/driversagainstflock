import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    shouldShowNavigationPuck,
    shouldUseAutoPlayNavigationPuckImages,
} from '../location-puck-state.js';

describe('location puck state', () => {
    test('always uses the navigation arrow on Auto Play surfaces', () => {
        assert.equal(
            shouldShowNavigationPuck({
                isFollowing: false,
                navigationPuckVariant: 'auto-play',
            }),
            true,
        );
        assert.equal(shouldUseAutoPlayNavigationPuckImages('auto-play'), true);
    });

    test('keeps the phone navigation arrow tied to follow state', () => {
        assert.equal(
            shouldShowNavigationPuck({
                isFollowing: false,
                navigationPuckVariant: 'default',
            }),
            false,
        );
        assert.equal(
            shouldShowNavigationPuck({
                isFollowing: true,
                navigationPuckVariant: 'default',
            }),
            true,
        );
        assert.equal(shouldUseAutoPlayNavigationPuckImages('default'), false);
    });
});
