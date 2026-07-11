import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as Linking from 'expo-linking';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { useAuth } from '../../lib/auth';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from '../map/native-components';
import { getCallbackParams, isAuthCallbackURL } from './auth-callback-utils';

const AUTH_CALLBACK_SHEET_SNAP_POINTS = ['40%'];

export function AuthCallbackHandler() {
    const { completeOpenStreetMapLogin } = useAuth();
    const bottomSheetRef = useRef(null);
    const handledCallbacksRef = useRef(new Set());
    const statusDismissTimeoutRef = useRef(null);
    const [callbackStatus, setCallbackStatus] = useState({
        message: '',
        status: 'idle',
    });
    const pathname = usePathname();
    const routeParams = useGlobalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const bottomSheetBackgroundStyle = useMemo(
        () => ({ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff' }),
        [isDarkMode],
    );
    const bottomSheetHandleIndicatorStyle = useMemo(
        () => ({ backgroundColor: isDarkMode ? '#737373' : '#d4d4d4' }),
        [isDarkMode],
    );

    const clearStatusDismissTimeout = useCallback(() => {
        if (statusDismissTimeoutRef.current) {
            clearTimeout(statusDismissTimeoutRef.current);
            statusDismissTimeoutRef.current = null;
        }
    }, []);

    const returnToMap = useCallback(() => {
        router.replace('/');

        setTimeout(() => {
            router.replace('/');
        }, 250);
    }, [router]);

    const renderBackdrop = useCallback(
        (props) => (
            <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                opacity={0.35}
            />
        ),
        [],
    );

    const dismissStatus = useCallback(() => {
        clearStatusDismissTimeout();
        setCallbackStatus({ message: '', status: 'idle' });
    }, [clearStatusDismissTimeout]);

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
            clearStatusDismissTimeout();
            setCallbackStatus({
                message: 'Signing in with OpenStreetMap.',
                status: 'processing',
            });

            try {
                await completeOpenStreetMapLogin(params);
                setCallbackStatus({
                    message: 'Returning to the map.',
                    status: 'success',
                });
                returnToMap();
                statusDismissTimeoutRef.current = setTimeout(
                    dismissStatus,
                    650,
                );
            } catch (nextError) {
                setCallbackStatus({
                    message: nextError.message || 'Please try again.',
                    status: 'error',
                });
                returnToMap();
            }
        },
        [
            clearStatusDismissTimeout,
            completeOpenStreetMapLogin,
            dismissStatus,
            returnToMap,
        ],
    );

    useEffect(() => {
        if (callbackStatus.status === 'idle') {
            bottomSheetRef.current?.dismiss();
            return;
        }

        bottomSheetRef.current?.present();
    }, [callbackStatus.status]);

    useEffect(
        () => () => {
            clearStatusDismissTimeout();
        },
        [clearStatusDismissTimeout],
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

    const statusTitle =
        callbackStatus.status === 'error'
            ? 'Login failed'
            : callbackStatus.status === 'success'
              ? 'Signed in'
              : 'Finishing login...';

    return (
        <NativeWindBottomSheetModal
            ref={bottomSheetRef}
            snapPoints={AUTH_CALLBACK_SHEET_SNAP_POINTS}
            enablePanDownToClose={callbackStatus.status !== 'processing'}
            backdropComponent={renderBackdrop}
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            onDismiss={() => {
                if (callbackStatus.status !== 'processing') {
                    dismissStatus();
                }
            }}
        >
            <NativeWindBottomSheetView
                className="gap-4 bg-white px-6 pt-2 dark:bg-neutral-950"
                style={{ paddingBottom: insets.bottom + 24 }}
            >
                <View className="flex-row items-center gap-3">
                    {callbackStatus.status === 'processing' ? (
                        <ActivityIndicator
                            color={isDarkMode ? '#93c5fd' : '#2563eb'}
                            size="small"
                        />
                    ) : null}
                    <Text className="text-xl font-bold text-neutral-950 dark:text-white">
                        {statusTitle}
                    </Text>
                </View>

                <Text
                    accessibilityLiveRegion="polite"
                    className="text-base leading-6 text-neutral-600 dark:text-neutral-300"
                >
                    {callbackStatus.message}
                </Text>

                {callbackStatus.status === 'error' ? (
                    <Pressable
                        accessibilityRole="button"
                        className="min-h-12 items-center justify-center rounded-lg bg-neutral-950 px-4 active:opacity-[0.82] dark:bg-white"
                        onPress={dismissStatus}
                    >
                        <Text className="text-base font-semibold text-white dark:text-neutral-950">
                            Dismiss
                        </Text>
                    </Pressable>
                ) : null}
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
