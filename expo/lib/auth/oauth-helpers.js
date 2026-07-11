const PKCE_CODE_VERIFIER_BYTE_LENGTH = 64;
const OAUTH_STATE_BYTE_LENGTH = 32;
const BASE64_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

function bytesToBase64URL(bytes) {
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index];
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

    output += BASE64_CHARACTERS[(triplet >> 18) & 63];
    output += BASE64_CHARACTERS[(triplet >> 12) & 63];
    output +=
      index + 1 < bytes.length ? BASE64_CHARACTERS[(triplet >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_CHARACTERS[triplet & 63] : "=";
  }

  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createOAuthState() {
  return bytesToBase64URL(getRandomBytes(OAUTH_STATE_BYTE_LENGTH));
}

export function createPKCECodeVerifier() {
  return bytesToBase64URL(getRandomBytes(PKCE_CODE_VERIFIER_BYTE_LENGTH));
}

export async function createPKCEChallenge(codeVerifier) {
  if (globalThis.crypto?.subtle?.digest && typeof TextEncoder !== "undefined") {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifier),
    );

    return {
      codeChallenge: bytesToBase64URL(new Uint8Array(digest)),
      codeChallengeMethod: "S256",
    };
  }

  return {
    codeChallenge: codeVerifier,
    codeChallengeMethod: "plain",
  };
}

function getFirstParam(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function getCallbackParams(callback) {
  if (typeof callback !== "string") {
    return {
      code: getFirstParam(callback?.code),
      error: getFirstParam(callback?.error),
      errorDescription: getFirstParam(
        callback?.errorDescription ?? callback?.error_description,
      ),
      state: getFirstParam(callback?.state),
    };
  }

  const parsedUrl = new URL(callback);

  return {
    code: parsedUrl.searchParams.get("code"),
    error: parsedUrl.searchParams.get("error"),
    errorDescription: parsedUrl.searchParams.get("error_description"),
    state: parsedUrl.searchParams.get("state"),
  };
}
