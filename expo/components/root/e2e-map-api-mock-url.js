function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

export function getE2EMockFlagsFromURL(value) {
    try {
        const url = new URL(value);
        const mocksAreEnabled =
            url.searchParams.get('e2eMapApiMocks') === '1' ||
            (url.protocol === 'driversagainstflock:' &&
                getDeepLinkPath(url) === 'e2e-mocks');
        const authMockValue =
            url.searchParams.get('auth') ?? url.searchParams.get('e2eAuthMock');
        const authMockIsEnabled = mocksAreEnabled && authMockValue === '1';

        return {
            authMockIsDisabled: mocksAreEnabled && !authMockIsEnabled,
            authMockIsEnabled,
            mocksAreEnabled,
        };
    } catch {
        return {
            authMockIsDisabled: false,
            authMockIsEnabled: false,
            mocksAreEnabled: false,
        };
    }
}
