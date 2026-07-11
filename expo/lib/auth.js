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
import { AUTH_CALLBACK_URL } from './auth/constants';
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
} from './auth/openstreetmap';
import {
    forgetStoredOAuthRequest,
    getStoredOAuthRequest,
    getStoredToken,
    setStoredOAuthRequest,
    setStoredToken,
} from './auth/storage';
import { addSentryBreadcrumb, setSentryUser } from './sentry';

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
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
        setPermissions(null);
        setIsSigningIn(false);
        setIsLoading(false);
        pendingOAuthRequestRef.current = null;
        await setStoredToken(null);
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
                setPermissions(null);
                addSentryBreadcrumb({
                    category: 'auth',
                    data: {
                        provider: data.user?.provider,
                    },
                    message: 'OpenStreetMap sign-in completed',
                });

                await setStoredToken(tokenData.access_token);
                await forgetStoredOAuthRequest();

                return {
                    ...data,
                    permissions: null,
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

        getStoredToken()
            .then(async (storedToken) => {
                if (
                    !isMounted ||
                    authLoadGenerationRef.current !== loadGeneration
                ) {
                    return;
                }

                setToken(storedToken);

                if (storedToken) {
                    const data = await loadUser(storedToken, { apply: false });

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
                    setPermissions(null);
                    await setStoredToken(null).catch(() => {});
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
    }, [clearSession, loadUser]);

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
            state,
        });
        const oauthRequest = {
            codeVerifier,
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

    const signOut = useCallback(async () => {
        await clearSession();
    }, [clearSession]);

    const value = useMemo(
        () => ({
            completeOpenStreetMapLogin,
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
