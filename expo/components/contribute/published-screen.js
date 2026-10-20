import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ScrollView, Text, useColorScheme, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { getCameraChangeLabel } from '../../lib/osm/camera-presets';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { usePreventRemove } from '../../lib/use-prevent-remove';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { getDafTheme } from '../design-system/tokens';
import { useContribute } from './contribute-state';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { ContributeTourTarget } from './contribute-tour-target';

export default function PublishedScreen() {
    const targets = useRef({});
    const screenIsFocused = useIsFocused();
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(useColorScheme());
    const { user } = useAuth();
    const { finishContribute, pins, publishResult, tour } = useContribute();
    usePreventRemove(Boolean(publishResult), () => {});
    useFocusEffect(
        useCallback(() => {
            if (!publishResult) router.replace('/');
        }, [publishResult]),
    );
    if (!publishResult) return null;
    const rows = [
        ...(publishResult.nodes ?? []).map((node) => ({
            ...node,
            action: 'created',
        })),
        ...(publishResult.modifiedNodes ?? []).map((node) => ({
            ...node,
            action: 'modified',
        })),
        ...(publishResult.removedNodes ?? []).map((node) => ({
            nodeId: node.id,
            version: node.version + 1,
            action: 'deleted',
            tags: node.tags,
        })),
    ];
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="contribute-published-screen"
        >
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ flexGrow: 1 }}
            >
                <View
                    className="flex-1 items-center justify-center px-6 pb-6"
                    style={{ paddingTop: Math.max(insets.top + 24, 60) }}
                >
                    <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-daf-brand/15">
                        <Icon name="check" size={34} color={theme.text.brand} />
                    </View>
                    <Text className="mt-[18px] text-center font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                        Changeset published
                    </Text>
                    <Text
                        className="mt-1.5 font-dafMono text-xs text-daf-text-brand dark:text-daf-brand"
                        testID="contribute-changeset-id"
                    >
                        changeset/
                        {Number(publishResult.changesetId).toLocaleString()}
                    </Text>
                    <Text className="mt-3 text-center text-[13px] text-daf-text-secondary dark:text-neutral-300">
                        {rows.length} changes, credited to{' '}
                        <Text className="font-bold text-daf-text-primary dark:text-white">
                            @{user?.name ?? 'you'}
                        </Text>
                        .
                    </Text>
                    <View className="mt-5 w-full rounded-dafMd border border-daf-border bg-white px-3.5 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        {rows.map((node, index) => (
                            <View
                                key={`${node.action}-${node.nodeId}`}
                                className={`flex-row items-center gap-3 py-3 ${index < rows.length - 1 ? 'border-b border-daf-border dark:border-daf-border-dark' : ''}`}
                                testID={`contribute-published-node-${index}`}
                            >
                                <View
                                    className={`h-[17px] w-[17px] items-center justify-center rounded-full ${node.action === 'deleted' ? 'bg-daf-surface-alt dark:bg-daf-surface-inverse' : 'bg-daf-marker-alpr/15'}`}
                                >
                                    <View
                                        className={`h-[9px] w-[9px] rounded-full ${node.action === 'deleted' ? 'bg-daf-border-strong' : 'bg-daf-marker-alpr'}`}
                                    />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text
                                        className="text-[13px] font-medium text-daf-text-primary dark:text-white"
                                        numberOfLines={1}
                                    >
                                        {node.action === 'deleted'
                                            ? `ALPR reader${node.tags?.manufacturer ? ` · ${node.tags.manufacturer}` : ''}`
                                            : getCameraChangeLabel(
                                                  pins.find(
                                                      (pin) =>
                                                          pin.id === node.pinId,
                                                  )?.details,
                                              )}
                                    </Text>
                                    <Text className="mt-0.5 font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                        node/{node.nodeId} · v
                                        {node.version ?? 1}
                                    </Text>
                                </View>
                                <Text
                                    className={`font-dafMono text-[10px] ${node.action === 'deleted' ? 'text-daf-alert' : 'text-daf-text-brand dark:text-daf-brand'}`}
                                >
                                    {node.action}
                                </Text>
                            </View>
                        ))}
                    </View>
                    <Text className="mt-3.5 text-center text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                        Live on OpenStreetMap. Explore and the Hotlist pick it
                        up within minutes.
                    </Text>
                </View>
            </ScrollView>
            <View
                className="border-t border-daf-border bg-white px-4 pt-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
            >
                <ContributeTourTarget id="published" targets={targets}>
                    <DafButton
                        size="lg"
                        onPress={() => {
                            finishContribute();
                            router.replace('/');
                        }}
                        testID="contribute-see-on-map-button"
                    >
                        Done
                    </DafButton>
                </ContributeTourTarget>
            </View>
            <ContributeTourOverlay
                enabled={screenIsFocused}
                insets={insets}
                phase="published"
                targets={targets}
                tour={tour}
            />
        </View>
    );
}
