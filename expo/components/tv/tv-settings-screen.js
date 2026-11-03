import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { DuoText as Text } from '../design-system/duo-typography';
import { Icon } from '../design-system/icon';
import { DafButton as BaseButton } from '../design-system/primitives';
import { DuoMapModalScreen } from '../root/duo-pane-screen';
import {
    getTvState,
    subscribeTv,
    loadTvPairing,
    pairTv,
    unpairTv,
    syncTvAreas,
    dismissTvAction,
    tvTransportAvailable,
} from './tv-runtime';
import { tvPairingUriFromLinkParams } from './tv-client';

function DafButton({ label, ...props }) {
    return <BaseButton {...props}>{label}</BaseButton>;
}

const Scanner = cssInterop(CameraView, { className: 'style' });
export function TvSettingsScreen() {
    const router = useRouter();
    const focused = useIsFocused();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const state = useSyncExternalStore(subscribeTv, getTvState, getTvState);
    const [permission, requestPermission] = useCameraPermissions();
    const [scanning, setScanning] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const locked = useRef(false);
    const processedUri = useRef(null);
    const incomingPair = tvPairingUriFromLinkParams(params) ?? params.pair;
    useEffect(() => {
        loadTvPairing();
    }, []);
    async function pair(value) {
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        setScanning(false);
        setError(null);
        try {
            await pairTv(value);
        } catch (failure) {
            setError(failure.message);
        } finally {
            locked.current = false;
            setBusy(false);
        }
    }
    useEffect(() => {
        if (
            !focused ||
            typeof incomingPair !== 'string' ||
            processedUri.current === incomingPair ||
            state.status === 'loading'
        )
            return;
        processedUri.current = incomingPair;
        pair(incomingPair);
    }, [focused, incomingPair, state.status]);
    async function scan() {
        setError(null);
        const result = permission?.granted
            ? permission
            : await requestPermission();
        if (result.granted) setScanning(true);
        else
            setError(
                'Camera access is needed to scan your TV code. You can enable it in phone settings.',
            );
    }
    async function unpair() {
        setBusy(true);
        setError(null);
        try {
            await unpairTv();
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <DuoMapModalScreen>
            <View
                testID="tv-settings-screen"
                className="flex-1 bg-daf-surface-page dark:bg-daf-surface-inverse"
                style={{ paddingTop: insets.top }}
            >
                <View className="flex-row items-center gap-3 border-b border-daf-border px-5 py-3 dark:border-daf-border-dark">
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        className="h-11 w-11 items-center justify-center"
                        onPress={() =>
                            router.canGoBack()
                                ? router.back()
                                : router.replace('/')
                        }
                    >
                        <Icon name="chevron-left" color="#828D9B" size={24} />
                    </Pressable>
                    <Text
                        accessibilityRole="header"
                        className="font-dafDisplay text-[24px] font-bold text-daf-text-primary dark:text-daf-text-inverse"
                    >
                        Pair a TV
                    </Text>
                </View>
                <ScrollView
                    contentContainerClassName="gap-5 p-5"
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 28,
                    }}
                >
                    <Text className="text-[17px] leading-[25px] text-daf-text-secondary dark:text-[#A9B2BD]">
                        Your areas and their camera changes, on the big screen.
                        Keep your phone and TV on the same Wi-Fi.
                    </Text>
                    {!tvTransportAvailable() ? (
                        <Text className="text-[15px] text-daf-text-primary dark:text-daf-text-inverse">
                            Install the latest phone build to connect to your
                            TV.
                        </Text>
                    ) : null}
                    <View className="gap-3 rounded-dafLg border border-daf-border bg-white p-5 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <Text className="text-[19px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                            {state.paired
                                ? 'TV paired'
                                : 'Bring your TV and phone together'}
                        </Text>
                        <Text
                            accessibilityLiveRegion="polite"
                            className="text-[15px] text-daf-text-secondary dark:text-[#A9B2BD]"
                        >
                            {busy
                                ? 'Connecting…'
                                : state.status === 'synced'
                                  ? 'Your areas are synced to the TV.'
                                  : state.status === 'syncing'
                                    ? 'Syncing your areas…'
                                    : state.paired
                                      ? 'Your phone sends area updates while the app is open.'
                                      : 'Open Drivers Against Flock on your TV, then scan its QR code.'}
                        </Text>
                        {state.paired ? (
                            <>
                                <DafButton
                                    label="Sync now"
                                    disabled={
                                        busy || state.status === 'syncing'
                                    }
                                    onPress={() => syncTvAreas()}
                                    testID="tv-sync-button"
                                />
                                <DafButton
                                    label="Unpair TV"
                                    variant="secondary"
                                    disabled={busy}
                                    onPress={unpair}
                                    testID="tv-unpair-button"
                                />
                            </>
                        ) : (
                            <DafButton
                                label="Scan TV code"
                                disabled={busy || !tvTransportAvailable()}
                                onPress={scan}
                                testID="tv-scan-button"
                            />
                        )}
                    </View>
                    {scanning && focused && permission?.granted ? (
                        <View className="gap-3">
                            <Scanner
                                className="h-80 w-full overflow-hidden rounded-dafLg"
                                facing="back"
                                barcodeScannerSettings={{
                                    barcodeTypes: ['qr'],
                                }}
                                onBarcodeScanned={({ data }) => pair(data)}
                            />
                            <DafButton
                                label="Cancel scanning"
                                variant="secondary"
                                onPress={() => setScanning(false)}
                            />
                        </View>
                    ) : null}
                    {error || state.error ? (
                        <View className="gap-3">
                            <Text
                                accessibilityRole="alert"
                                className="text-[15px] text-daf-alert"
                            >
                                {error ?? state.error}
                            </Text>
                            {permission?.canAskAgain === false &&
                            !permission.granted ? (
                                <DafButton
                                    label="Open phone settings"
                                    variant="secondary"
                                    onPress={() => Linking.openSettings()}
                                />
                            ) : null}
                        </View>
                    ) : null}
                    {state.actions.map((action) => (
                        <View
                            key={action.id}
                            className="gap-3 rounded-dafLg border border-daf-border bg-white p-5 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                        >
                            <Text className="text-[12px] uppercase tracking-wide text-daf-text-tertiary">
                                From your TV
                            </Text>
                            <Text className="text-[18px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                                {action.payload?.street ??
                                    action.payload?.destination?.name ??
                                    'Shared place'}
                            </Text>
                            <DafButton
                                label="View on phone"
                                onPress={() =>
                                    router.push({
                                        pathname: '/tv-received',
                                        params: { actionId: action.id },
                                    })
                                }
                            />
                            <DafButton
                                label="Dismiss"
                                variant="secondary"
                                onPress={() =>
                                    dismissTvAction(action.id).catch(
                                        (failure) =>
                                            Alert.alert(
                                                'Could not dismiss',
                                                failure.message,
                                            ),
                                    )
                                }
                            />
                        </View>
                    ))}
                    <Text className="text-[13px] leading-[19px] text-daf-text-tertiary">
                        Pairing is local. Your account credentials and trip
                        history stay on your phone. Unpair from either device at
                        any time.
                    </Text>
                </ScrollView>
            </View>
        </DuoMapModalScreen>
    );
}
