import * as WebBrowser from 'expo-web-browser';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { setAnalyticsUser } from './analytics';
import { APP_ENVIRONMENT, AUTH_CALLBACK_URL } from './auth/constants';
import {
    createOAuthState,
    createPKCEChallenge,
    createPKCECodeVerifier,
    getCallbackParams,
} from './auth/oauth-helpers';
import {
    buildOpenStreetMapAuthorizationURL,
    exchangeOpenStreetMapAuthorizationCode,
    fetchOpenStreetMapUser,
    OPENSTREETMAP_DEFAULT_SCOPES,
} from './auth/openstreetmap';
import {
    forgetStoredOAuthRequest,
    getStoredAuth,
    getStoredOAuthRequest,
    setStoredAuth,
    setStoredOAuthRequest,
} from './auth/storage';
import { fetchOSMPermissions } from './osm/client';
import { OSM_ERROR_CODES } from './osm/errors';
import { addSentryBreadcrumb, setSentryUser } from './sentry';

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

const OSM_WRITE_SCOPE = 'write_api';

let e2eMockSessionHandler = null;

export function injectE2EMockSession(session) {
    if (APP_ENVIRONMENT !== 'development' && APP_ENVIRONMENT !== 'e2e') {
        return;
    }

    e2eMockSessionHandler?.(session);
}

function parseGrantedScopes(tokenData, requestedScopes) {
    if (typeof tokenData?.scope === 'string' && tokenData.scope.trim()) {
        return tokenData.scope.trim().split(/\s+/);
    }

    return requestedScopes ?? OPENSTREETMAP_DEFAULT_SCOPES;
}

export function AuthProvider({ children }) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [grantedScopes, setGrantedScopes] = useState([]);
    const [permissions, setPermissions] = useState(null);
    const authLoadGenerationRef = useRef(0);
    const oauthCompletionRef = useRef(null);
    const completedOAuthKeyRef = useRef(null);
    const pendingOAuthRequestRef = useRef(null);

    const clearSession = useCallback(async () => {
        addSentryBreadcrumb({
            category: 'auth',
            message: 'User session cleared',
        });
        authLoadGenerationRef.current += 1;
        setToken(null);
        setUser(null);
        setGrantedScopes([]);
        setPermissions(null);
        setIsSigningIn(false);
        setIsLoading(false);
        pendingOAuthRequestRef.current = null;
        await setStoredAuth(null);
        await forgetStoredOAuthRequest();
    }, []);

    const loadUser = useCallback(
        async (nextToken = token, options = {}) => {
            if (!nextToken) {
                return null;
            }

            const data = await fetchOpenStreetMapUser(nextToken);

            if (options.apply !== false) {
                setUser(data.user ?? null);
                setPermissions(null);
            }

            return {
                ...data,
                permissions: null,
            };
        },
        [token],
    );

    const completeOpenStreetMapLogin = useCallback(
        async (callback, options = {}) => {
            const params = getCallbackParams(callback);

            if (params.error) {
                throw new Error(params.errorDescription || params.error);
            }

            if (!params.code) {
                throw new Error('OpenStreetMap did not return a login code.');
            }

            const completionKey = `${params.state}:${params.code}`;

            if (completedOAuthKeyRef.current === completionKey) {
                return null;
            }

            if (oauthCompletionRef.current?.key === completionKey) {
                return oauthCompletionRef.current.promise;
            }

            const completionGeneration = authLoadGenerationRef.current + 1;

            authLoadGenerationRef.current = completionGeneration;

            const completionPromise = (async () => {
                const expectedRequest =
                    options.expectedRequest ??
                    pendingOAuthRequestRef.current ??
                    (await getStoredOAuthRequest());

                if (
                    !expectedRequest?.state ||
                    params.state !== expectedRequest.state
                ) {
                    throw new Error(
                        'The login response could not be verified.',
                    );
                }

                if (!expectedRequest.codeVerifier) {
                    throw new Error(
                        'The saved login request expired. Please try again.',
                    );
                }

                setIsLoading(false);
                setIsSigningIn(true);

                const tokenData = await exchangeOpenStreetMapAuthorizationCode({
                    code: params.code,
                    codeVerifier: expectedRequest.codeVerifier,
                });
                const nextGrantedScopes = parseGrantedScopes(
                    tokenData,
                    expectedRequest.scopes,
                );
                const data = await fetchOpenStreetMapUser(
                    tokenData.access_token,
                );

                if (authLoadGenerationRef.current !== completionGeneration) {
                    return data;
                }

                completedOAuthKeyRef.current = completionKey;
                pendingOAuthRequestRef.current = null;

                setToken(tokenData.access_token);
                setUser(data.user ?? null);
                setGrantedScopes(nextGrantedScopes);
                setPermissions(null);
                addSentryBreadcrumb({
                    category: 'auth',
                    data: {
                        provider: data.user?.provider,
                    },
                    message: 'OpenStreetMap sign-in completed',
                });

                await setStoredAuth({
                    accessToken: tokenData.access_token,
                    obtainedAt: Date.now(),
                    scopes: nextGrantedScopes,
                });
                await forgetStoredOAuthRequest();

                return {
                    ...data,
                    permissions: null,
                    scopes: nextGrantedScopes,
                    token: tokenData.access_token,
                };
            })();

            oauthCompletionRef.current = {
                key: completionKey,
                promise: completionPromise,
            };

            try {
                return await completionPromise;
            } finally {
                if (oauthCompletionRef.current?.key === completionKey) {
                    oauthCompletionRef.current = null;
                }

                setIsSigningIn(false);
                setIsLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        let isMounted = true;
        const loadGeneration = authLoadGenerationRef.current;

        getStoredAuth()
            .then(async (storedAuth) => {
                if (
                    !isMounted ||
                    authLoadGenerationRef.current !== loadGeneration
                ) {
                    return;
                }

                setToken(storedAuth?.accessToken ?? null);
                setGrantedScopes(storedAuth?.scopes ?? []);

                if (storedAuth?.accessToken) {
                    const data = await loadUser(storedAuth.accessToken, {
                        apply: false,
                    });

                    if (
                        isMounted &&
                        authLoadGenerationRef.current === loadGeneration
                    ) {
                        setUser(data.user ?? null);
                        setPermissions(data.permissions ?? null);
                    }
                }
            })
            .catch(async () => {
                if (
                    isMounted &&
                    authLoadGenerationRef.current === loadGeneration
                ) {
                    setToken(null);
                    setUser(null);
                    setGrantedScopes([]);
                    setPermissions(null);
                    await setStoredAuth(null).catch(() => {});
                }
            })
            .finally(() => {
                if (
                    isMounted &&
                    authLoadGenerationRef.current === loadGeneration
                ) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
        // Hydrate from storage on mount only: the effect always passes an
        // explicit token to loadUser, and re-running on token changes would
        // wipe sessions that exist only in memory (e2e mock injection).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        e2eMockSessionHandler = (session) => {
            authLoadGenerationRef.current += 1;
            setToken(session?.accessToken ?? null);
            setUser(session?.user ?? null);
            setGrantedScopes(session?.scopes ?? []);
            setPermissions(null);
            setIsLoading(false);
        };

        return () => {
            e2eMockSessionHandler = null;
        };
    }, []);

    useEffect(() => {
        setSentryUser(user);
        setAnalyticsUser(user);
    }, [user]);

    const signInWithOpenStreetMap = useCallback(async () => {
        if (isSigningIn) {
            return null;
        }

        const state = createOAuthState();
        const codeVerifier = createPKCECodeVerifier();
        const { codeChallenge, codeChallengeMethod } =
            await createPKCEChallenge(codeVerifier);
        const authURL = buildOpenStreetMapAuthorizationURL({
            codeChallenge,
            codeChallengeMethod,
            scopes: OPENSTREETMAP_DEFAULT_SCOPES,
            state,
        });
        const oauthRequest = {
            codeVerifier,
            scopes: OPENSTREETMAP_DEFAULT_SCOPES,
            state,
        };

        setIsSigningIn(true);
        addSentryBreadcrumb({
            category: 'auth',
            message: 'OpenStreetMap sign-in started',
        });

        try {
            pendingOAuthRequestRef.current = oauthRequest;
            await setStoredOAuthRequest(oauthRequest);

            const result = await WebBrowser.openAuthSessionAsync(
                authURL,
                AUTH_CALLBACK_URL,
            );

            if (result.type !== 'success' || !result.url) {
                pendingOAuthRequestRef.current = null;
                forgetStoredOAuthRequest();
                addSentryBreadcrumb({
                    category: 'auth',
                    data: {
                        resultType: result.type,
                    },
                    message: 'OpenStreetMap sign-in canceled',
                });
                return null;
            }

            return completeOpenStreetMapLogin(result.url, {
                expectedRequest: oauthRequest,
            });
        } finally {
            setIsSigningIn(false);
        }
    }, [completeOpenStreetMapLogin, isSigningIn]);

    const hasWriteScope = grantedScopes.includes(OSM_WRITE_SCOPE);

    const ensureWriteAccess = useCallback(
        async ({ verifyWithServer = false } = {}) => {
            if (token && grantedScopes.includes(OSM_WRITE_SCOPE)) {
                const currentSession = {
                    accessToken: token,
                    scopes: grantedScopes,
                    user,
                };

                if (!verifyWithServer) {
                    return currentSession;
                }

                try {
                    const serverPermissions = await fetchOSMPermissions({
                        accessToken: token,
                    });

                    if (serverPermissions?.includes('allow_write_api')) {
                        return currentSession;
                    }
                } catch (error) {
                    // Only auth failures mean the token lost write access;
                    // transient errors must not trigger a surprise re-auth.
                    if (
                        error?.code !== OSM_ERROR_CODES.unauthorized &&
                        error?.code !== OSM_ERROR_CODES.forbidden
                    ) {
                        throw error;
                    }
                }
            }

            const freshSession = await signInWithOpenStreetMap();

            if (!freshSession?.token) {
                return null;
            }

            return {
                accessToken: freshSession.token,
                scopes: freshSession.scopes ?? OPENSTREETMAP_DEFAULT_SCOPES,
                user: freshSession.user ?? null,
            };
        },
        [grantedScopes, signInWithOpenStreetMap, token, user],
    );

    const signOut = useCallback(async () => {
        await clearSession();
    }, [clearSession]);

    const value = useMemo(
        () => ({
            completeOpenStreetMapLogin,
            ensureWriteAccess,
            grantedScopes,
            hasWriteScope,
            isAuthenticated: Boolean(token),
            isLoading,
            isSigningIn,
            loadUser,
            openStreetMapAccessToken: token,
            permissions,
            signInWithOpenStreetMap,
            signOut,
            user,
        }),
        [
            completeOpenStreetMapLogin,
            ensureWriteAccess,
            grantedScopes,
            hasWriteScope,
            isLoading,
            isSigningIn,
            loadUser,
            permissions,
            signInWithOpenStreetMap,
            signOut,
            token,
            user,
        ],
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuth() {
    const value = useContext(AuthContext);

    if (!value) {
        throw new Error('useAuth must be used inside AuthProvider.');
    }

    return value;
}
