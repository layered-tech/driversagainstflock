import * as Linking from 'expo-linking';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/auth';
import { getCallbackParams, isAuthCallbackURL } from './auth-callback-utils';

export function AuthCallbackHandler() {
    const { completeOpenStreetMapLogin } = useAuth();
    const handledCallbacksRef = useRef(new Set());
    const pathname = usePathname();
    const routeParams = useGlobalSearchParams();
    const router = useRouter();

    const returnToMap = useCallback(() => {
        router.replace('/');

        setTimeout(() => {
            router.replace('/');
        }, 250);
    }, [router]);

    const handleCallback = useCallback(
        async (callback) => {
            const params = getCallbackParams(callback);
            const { code, error, state } = params;

            if (!code && !error) {
                return;
            }

            const callbackKey = `${state ?? ''}:${code ?? ''}:${error ?? ''}`;

            if (handledCallbacksRef.current.has(callbackKey)) {
                return;
            }

            handledCallbacksRef.current.add(callbackKey);

            try {
                await completeOpenStreetMapLogin(params);
            } catch {
                // The initiating surface owns any visible auth error.
            } finally {
                returnToMap();
            }
        },
        [completeOpenStreetMapLogin, returnToMap],
    );

    useEffect(() => {
        Linking.getInitialURL()
            .then((url) => {
                if (!url) {
                    return;
                }

                if (isAuthCallbackURL(url)) {
                    handleCallback(url);
                }
            })
            .catch(() => {});

        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (isAuthCallbackURL(url)) {
                handleCallback(url);
            }
        });

        return () => {
            subscription.remove();
        };
    }, [handleCallback]);

    useEffect(() => {
        const hasCallbackPayload = Boolean(
            routeParams.code || routeParams.error,
        );

        if (hasCallbackPayload && pathname === '/') {
            handleCallback({
                code: routeParams.code,
                error: routeParams.error,
                error_description: routeParams.error_description,
                state: routeParams.state,
            });
        }
    }, [
        handleCallback,
        pathname,
        routeParams.code,
        routeParams.error,
        routeParams.error_description,
        routeParams.state,
    ]);

    return null;
}
