import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSharedMapState } from '../map/shared-map-state';
import { parseAndroidGeoIntent } from './android-geo-intent';

const INITIAL_EVENT_DUPLICATE_WINDOW_MS = 1000;

export function AndroidGeoIntentHandler() {
    const router = useRouter();
    const { setPendingDirectionsRequest } = useSharedMapState();
    const lastLiveIntentRef = useRef(null);
    // Android can deliver a cold-start URL through both APIs. Suppress only
    // that one cross-source pair so later identical URL events stay distinct.
    const pendingInitialIntentDuplicateRef = useRef(null);

    const handleURL = useCallback(
        (value) => {
            if (Platform.OS !== 'android') {
                return false;
            }

            const parsedIntent = parseAndroidGeoIntent(value);

            if (!parsedIntent) {
                return false;
            }

            const now = Date.now();
            setPendingDirectionsRequest({
                ...parsedIntent,
                id: `android-geo-${now}-${Math.random().toString(36).slice(2)}`,
                source: 'android_geo_intent',
            });
            router.navigate('/');

            return true;
        },
        [router, setPendingDirectionsRequest],
    );

    const handleInitialURL = useCallback(
        (value) => {
            const now = Date.now();
            const lastLiveIntent = lastLiveIntentRef.current;

            if (
                lastLiveIntent?.value === value &&
                now - lastLiveIntent.handledAt <
                    INITIAL_EVENT_DUPLICATE_WINDOW_MS
            ) {
                return;
            }

            if (handleURL(value)) {
                pendingInitialIntentDuplicateRef.current = {
                    handledAt: now,
                    value,
                };
            }
        },
        [handleURL],
    );

    const handleLiveURL = useCallback(
        (value) => {
            const now = Date.now();
            const pendingInitialIntentDuplicate =
                pendingInitialIntentDuplicateRef.current;

            if (
                pendingInitialIntentDuplicate?.value === value &&
                now - pendingInitialIntentDuplicate.handledAt <
                    INITIAL_EVENT_DUPLICATE_WINDOW_MS
            ) {
                pendingInitialIntentDuplicateRef.current = null;
                return;
            }

            if (
                pendingInitialIntentDuplicate &&
                now - pendingInitialIntentDuplicate.handledAt >=
                    INITIAL_EVENT_DUPLICATE_WINDOW_MS
            ) {
                pendingInitialIntentDuplicateRef.current = null;
            }

            if (handleURL(value)) {
                lastLiveIntentRef.current = { handledAt: now, value };
            }
        },
        [handleURL],
    );

    useEffect(() => {
        let isMounted = true;
        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (isMounted) {
                handleLiveURL(url);
            }
        });

        Linking.getInitialURL()
            .then((url) => {
                if (isMounted && url) {
                    handleInitialURL(url);
                }
            })
            .catch(() => {});

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, [handleInitialURL, handleLiveURL]);

    return null;
}
