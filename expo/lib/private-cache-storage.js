import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PRIVATE_CACHE_MANIFEST_VERSION = 1;
const PRIVATE_CACHE_CHUNK_SIZE_BYTES = 1800;
const MAX_PRIVATE_CACHE_CHUNKS = 4096;
const PRIVATE_CACHE_KEY_PREFIX = 'daf.private-cache.';
const SECURE_STORE_OPTIONS =
    SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY === undefined
        ? {}
        : {
              keychainAccessible:
                  SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          };
const PRIVATE_CACHE_TEXT_ENCODER =
    typeof globalThis.TextEncoder === 'function'
        ? new globalThis.TextEncoder()
        : null;

const privateCacheWriteQueues = new Map();
let privateCacheGenerationSequence = 0;

function privateCacheUsesSecureStore() {
    return (
        Platform.OS !== 'web' &&
        typeof SecureStore.getItemAsync === 'function' &&
        typeof SecureStore.setItemAsync === 'function' &&
        typeof SecureStore.deleteItemAsync === 'function'
    );
}

export function privateCacheStorageIsEncrypted() {
    return privateCacheUsesSecureStore();
}

function normalizeStorageKey(storageKey) {
    if (typeof storageKey !== 'string' || !storageKey) {
        throw new TypeError(
            'Private cache storage keys must be non-empty strings.',
        );
    }

    return storageKey;
}

function getSecureStorageKey(storageKey) {
    return `${PRIVATE_CACHE_KEY_PREFIX}${Array.from(storageKey)
        .map((character) =>
            character.codePointAt(0).toString(16).padStart(4, '0'),
        )
        .join('')}`;
}

function getSecureChunkKey(manifestKey, generation, index) {
    return `${manifestKey}.${generation}.${index}`;
}

function getUtf8ByteLength(value) {
    if (PRIVATE_CACHE_TEXT_ENCODER) {
        return PRIVATE_CACHE_TEXT_ENCODER.encode(value).length;
    }

    try {
        return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, 'x').length;
    } catch {
        return value.length * 4;
    }
}

function splitIntoSecureChunks(value) {
    const chunks = [];
    let currentChunk = '';
    let currentChunkBytes = 0;

    for (const character of Array.from(value)) {
        const characterBytes = getUtf8ByteLength(character);

        if (
            currentChunk &&
            currentChunkBytes + characterBytes > PRIVATE_CACHE_CHUNK_SIZE_BYTES
        ) {
            chunks.push(currentChunk);
            currentChunk = '';
            currentChunkBytes = 0;
        }

        currentChunk += character;
        currentChunkBytes += characterBytes;
    }

    if (currentChunk || chunks.length === 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

function getNextGeneration() {
    privateCacheGenerationSequence += 1;

    return `${Date.now().toString(36)}-${privateCacheGenerationSequence.toString(36)}`;
}

function parseManifest(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }

    try {
        const manifest = JSON.parse(value);

        if (
            manifest?.version !== PRIVATE_CACHE_MANIFEST_VERSION ||
            typeof manifest.generation !== 'string' ||
            !manifest.generation ||
            !Number.isInteger(manifest.chunks) ||
            manifest.chunks < 1 ||
            manifest.chunks > MAX_PRIVATE_CACHE_CHUNKS
        ) {
            return null;
        }

        return manifest;
    } catch {
        return null;
    }
}

async function readSecureManifest(manifestKey) {
    return parseManifest(
        await SecureStore.getItemAsync(manifestKey, SECURE_STORE_OPTIONS),
    );
}

async function readSecureCacheValue(storageKey) {
    const manifestKey = getSecureStorageKey(storageKey);
    const manifest = await readSecureManifest(manifestKey);

    if (!manifest) {
        return null;
    }

    const chunks = [];

    for (let index = 0; index < manifest.chunks; index += 1) {
        const chunk = await SecureStore.getItemAsync(
            getSecureChunkKey(manifestKey, manifest.generation, index),
            SECURE_STORE_OPTIONS,
        );

        if (typeof chunk !== 'string') {
            return null;
        }

        chunks.push(chunk);
    }

    return chunks.join('');
}

async function deleteSecureCacheValue(storageKey) {
    const manifestKey = getSecureStorageKey(storageKey);
    const manifest = await readSecureManifest(manifestKey);

    if (!manifest) {
        await SecureStore.deleteItemAsync(manifestKey, SECURE_STORE_OPTIONS);
        return;
    }

    for (let index = 0; index < manifest.chunks; index += 1) {
        await SecureStore.deleteItemAsync(
            getSecureChunkKey(manifestKey, manifest.generation, index),
            SECURE_STORE_OPTIONS,
        );
    }

    await SecureStore.deleteItemAsync(manifestKey, SECURE_STORE_OPTIONS);
}

async function writeSecureCacheValue(storageKey, value) {
    const manifestKey = getSecureStorageKey(storageKey);
    const previousManifest = await readSecureManifest(manifestKey);
    const generation = getNextGeneration();
    const chunks = splitIntoSecureChunks(value);

    if (chunks.length > MAX_PRIVATE_CACHE_CHUNKS) {
        throw new Error('Private cache value is too large to store securely.');
    }

    for (const [index, chunk] of chunks.entries()) {
        await SecureStore.setItemAsync(
            getSecureChunkKey(manifestKey, generation, index),
            chunk,
            SECURE_STORE_OPTIONS,
        );
    }

    await SecureStore.setItemAsync(
        manifestKey,
        JSON.stringify({
            chunks: chunks.length,
            generation,
            version: PRIVATE_CACHE_MANIFEST_VERSION,
        }),
        SECURE_STORE_OPTIONS,
    );

    if (previousManifest && previousManifest.generation !== generation) {
        for (let index = 0; index < previousManifest.chunks; index += 1) {
            await SecureStore.deleteItemAsync(
                getSecureChunkKey(
                    manifestKey,
                    previousManifest.generation,
                    index,
                ),
                SECURE_STORE_OPTIONS,
            );
        }
    }
}

function migrateLegacyCacheValue(storageKey) {
    return queuePrivateCacheWrite(storageKey, async () => {
        const secureValue = await readSecureCacheValue(storageKey);

        if (secureValue !== null) {
            await AsyncStorage.removeItem(storageKey);

            return secureValue;
        }

        const legacyValue = await AsyncStorage.getItem(storageKey);

        if (legacyValue === null) {
            return null;
        }

        await writeSecureCacheValue(storageKey, legacyValue);
        await AsyncStorage.removeItem(storageKey);

        return legacyValue;
    });
}

function queuePrivateCacheWrite(storageKey, operation) {
    const previousOperation =
        privateCacheWriteQueues.get(storageKey) ?? Promise.resolve();
    const queuedOperation = previousOperation.catch(() => {}).then(operation);

    privateCacheWriteQueues.set(storageKey, queuedOperation);
    queuedOperation.then(
        () => {
            if (privateCacheWriteQueues.get(storageKey) === queuedOperation) {
                privateCacheWriteQueues.delete(storageKey);
            }
        },
        () => {
            if (privateCacheWriteQueues.get(storageKey) === queuedOperation) {
                privateCacheWriteQueues.delete(storageKey);
            }
        },
    );

    return queuedOperation;
}

export async function getPrivateCacheItem(storageKey) {
    const normalizedStorageKey = normalizeStorageKey(storageKey);

    if (!privateCacheUsesSecureStore()) {
        return AsyncStorage.getItem(normalizedStorageKey);
    }

    const secureValue = await readSecureCacheValue(normalizedStorageKey);

    if (secureValue !== null) {
        await AsyncStorage.removeItem(normalizedStorageKey).catch(() => {});

        return secureValue;
    }

    try {
        return await migrateLegacyCacheValue(normalizedStorageKey);
    } catch {
        return null;
    }
}

export function setPrivateCacheItem(storageKey, value) {
    const normalizedStorageKey = normalizeStorageKey(storageKey);

    if (value === null || value === undefined) {
        return removePrivateCacheItem(normalizedStorageKey);
    }

    if (typeof value !== 'string') {
        throw new TypeError('Private cache values must be strings.');
    }

    if (!privateCacheUsesSecureStore()) {
        return AsyncStorage.setItem(normalizedStorageKey, value);
    }

    return queuePrivateCacheWrite(normalizedStorageKey, async () => {
        await writeSecureCacheValue(normalizedStorageKey, value);
        await AsyncStorage.removeItem(normalizedStorageKey);
    });
}

export function removePrivateCacheItem(storageKey) {
    const normalizedStorageKey = normalizeStorageKey(storageKey);

    if (!privateCacheUsesSecureStore()) {
        return AsyncStorage.removeItem(normalizedStorageKey);
    }

    return queuePrivateCacheWrite(normalizedStorageKey, async () => {
        await deleteSecureCacheValue(normalizedStorageKey);
        await AsyncStorage.removeItem(normalizedStorageKey);
    });
}
