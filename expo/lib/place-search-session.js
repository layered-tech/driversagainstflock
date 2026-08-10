const PLACE_SEARCH_SESSION_TOKEN_BYTE_LENGTH = 16;

function getRandomBytes(byteLength) {
    const bytes = new Uint8Array(byteLength);

    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);

        return bytes;
    }

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
    }

    return bytes;
}

export function createPlaceSearchSessionToken() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    const bytes = getRandomBytes(PLACE_SEARCH_SESSION_TOKEN_BYTE_LENGTH);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
}
