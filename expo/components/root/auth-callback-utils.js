function getParam(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getCallbackParamsFromURL(url) {
  const parsedURL = new URL(url);

  return {
    code: parsedURL.searchParams.get("code"),
    error: parsedURL.searchParams.get("error"),
    errorDescription: parsedURL.searchParams.get("error_description"),
    state: parsedURL.searchParams.get("state"),
  };
}

export function getCallbackParams(callback) {
  if (typeof callback === "string") {
    return getCallbackParamsFromURL(callback);
  }

  return {
    code: getParam(callback?.code),
    error: getParam(callback?.error),
    errorDescription: getParam(
      callback?.errorDescription ?? callback?.error_description,
    ),
    state: getParam(callback?.state),
  };
}

export function isAuthCallbackURL(url) {
  try {
    const parsedURL = new URL(url);
    const hasCallbackPayload =
      parsedURL.searchParams.has("code") || parsedURL.searchParams.has("error");
    const path = [parsedURL.hostname, parsedURL.pathname]
      .filter(Boolean)
      .join("")
      .replace(/^\/+/, "");

    return (path === "" || path === "oauth") && hasCallbackPayload;
  } catch {
    return false;
  }
}
