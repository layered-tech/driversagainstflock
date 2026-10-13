import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, View } from 'react-native';
import { contributePage } from './community-content';
import { FirstLaunchSupportScreen } from './first-launch-support-screen';
import {
    completeFirstLaunchSupport,
    shouldShowFirstLaunchSupport,
} from './first-launch-support-state';

export function FirstLaunchSupportGate({ children }) {
    const [visible, setVisible] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const completingRef = useRef(false);

    useEffect(() => {
        let active = true;
        shouldShowFirstLaunchSupport(AsyncStorage)
            .then((shouldShow) => {
                if (active) setVisible(shouldShow);
            })
            .catch(() => {
                if (active) setVisible(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const complete = useCallback(async (donate = false) => {
        if (completingRef.current) return;
        completingRef.current = true;
        setBusy(true);
        setError(null);
        try {
            await completeFirstLaunchSupport(
                AsyncStorage,
                donate
                    ? () => Linking.openURL(contributePage.donationUrl)
                    : null,
            );
            setVisible(false);
        } catch {
            setError(
                donate
                    ? 'Could not open the support page. Please try again or choose Maybe later.'
                    : 'Could not save your choice. Please try again.',
            );
        } finally {
            completingRef.current = false;
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        if (!visible) return;
        const subscription = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                void complete();
                return true;
            },
        );
        return () => subscription.remove();
    }, [complete, visible]);

    if (visible === null) {
        return (
            <View className="flex-1 items-center justify-center bg-daf-surface-page dark:bg-[#0B0E12]">
                <ActivityIndicator color="#1FBF6B" />
            </View>
        );
    }
    if (!visible) return <View className="flex-1">{children}</View>;

    return (
        <FirstLaunchSupportScreen
            busy={busy}
            error={error}
            onDismiss={() => complete()}
            onDonate={() => complete(true)}
        />
    );
}
