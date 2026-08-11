import { Platform } from 'react-native';
import {
    getPrivateCacheItem,
    privateCacheStorageIsEncrypted,
    removePrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import {
    createEmptyScorecardState,
    parseScorecardState,
    serializeScorecardState,
} from './scorecard-engine';

export const SCORECARD_STORAGE_KEY = 'driversagainstflock.deviceScorecard.v1';

export function scorecardSecureStorageIsAvailable() {
    return (
        (Platform.OS === 'ios' || Platform.OS === 'android') &&
        privateCacheStorageIsEncrypted()
    );
}

export async function loadEncryptedScorecardState(now = Date.now()) {
    if (!scorecardSecureStorageIsAvailable()) {
        return createEmptyScorecardState();
    }

    try {
        return parseScorecardState(
            await getPrivateCacheItem(SCORECARD_STORAGE_KEY),
            now,
        );
    } catch {
        return createEmptyScorecardState();
    }
}

export async function saveEncryptedScorecardState(state, now = Date.now()) {
    if (!scorecardSecureStorageIsAvailable()) {
        return false;
    }

    const serializedState = serializeScorecardState(state, now);

    if (!serializedState) {
        return false;
    }

    await setPrivateCacheItem(SCORECARD_STORAGE_KEY, serializedState);

    return true;
}

export async function deleteEncryptedScorecardState() {
    if (!scorecardSecureStorageIsAvailable()) {
        return;
    }

    await removePrivateCacheItem(SCORECARD_STORAGE_KEY);
}
