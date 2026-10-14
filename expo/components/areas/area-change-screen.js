import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import {
    DafBadge,
    DafButton,
    DafIconButton,
} from '../design-system/primitives';
import { AreaMap } from './area-map';
import { AreaError, AreaLoading } from './area-ui';
import { areaRequest } from './areas-api';

export default function AreaChangeScreen() {
    const { areaId, changeId } = useLocalSearchParams();
    const [payload, setPayload] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const insets = useSafeAreaInsets();
    useEffect(() => {
        const controller = new AbortController();
        setError(null);
        areaRequest(`/${areaId}/changes/${changeId}`, {
            signal: controller.signal,
        })
            .then(setPayload)
            .catch((failure) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [areaId, changeId, attempt]);
    const change = payload?.change;
    return (
        <View className="flex-1" testID="area-change-screen">
            <View className="flex-1">
                {change ? (
                    <AreaMap
                        zoomLevel={16}
                        center={[change.longitude, change.latitude]}
                        changes={[change]}
                    />
                ) : (
                    <AreaLoading />
                )}
                <View
                    className="absolute left-3"
                    style={{ top: insets.top + 8 }}
                >
                    <DafIconButton
                        icon="chevron-left"
                        accessibilityLabel="Back"
                        onPress={() => router.back()}
                    />
                </View>
            </View>
            <ScrollView
                className="max-h-[60%] rounded-t-[24px] bg-white px-5 pt-5 dark:bg-daf-surface-dark"
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            >
                <AreaError
                    message={error}
                    onRetry={() => setAttempt((value) => value + 1)}
                />
                {change ? (
                    <>
                        <Text className="font-dafDisplay text-[22px] font-bold text-daf-text-primary dark:text-white">
                            Camera {change.kind}
                        </Text>
                        <Text className="mb-4 mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400">
                            {payload.area.name} ·{' '}
                            {new Date(change.changed_at).toLocaleString()}
                        </Text>
                        <View className="mb-4 flex-row flex-wrap gap-2">
                            <DafBadge
                                tone={
                                    change.kind === 'added' ? 'alert' : 'brand'
                                }
                            >
                                ALPR
                            </DafBadge>
                            <DafBadge>{change.operator}</DafBadge>
                        </View>
                        <View className="mb-5 flex-row flex-wrap gap-y-4">
                            {[
                                ['Where', change.street, true],
                                [
                                    'Direction',
                                    change.direction ?? 'Not recorded',
                                ],
                                [
                                    change.kind === 'added'
                                        ? 'Added'
                                        : 'Removed',
                                    new Date(
                                        change.changed_at,
                                    ).toLocaleDateString(),
                                ],
                                ['OSM ID', `node/${change.node_id}`],
                                [
                                    'Mapped by',
                                    change.mapped_by ?? 'Not recorded',
                                ],
                            ].map(([label, value, wide]) => (
                                <View
                                    key={label}
                                    className={wide ? 'w-full' : 'w-1/2 pr-3'}
                                >
                                    <Text className="mb-1 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-neutral-400">
                                        {label}
                                    </Text>
                                    <Text className="text-[13px] font-medium text-daf-text-primary dark:text-white">
                                        {value}
                                    </Text>
                                </View>
                            ))}
                        </View>
                        <DafButton
                            size="lg"
                            onPress={() =>
                                router.push(
                                    `/areas/${areaId}/map?changeId=${change.id}`,
                                )
                            }
                        >
                            Show on the map
                        </DafButton>
                        <DafButton
                            className="mt-2"
                            variant="ghost"
                            onPress={() =>
                                Linking.openURL(
                                    `https://www.openstreetmap.org/node/${change.node_id}/history`,
                                )
                            }
                        >
                            OpenStreetMap ↗
                        </DafButton>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}
