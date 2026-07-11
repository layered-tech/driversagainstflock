import { usePreventRemove } from '@react-navigation/native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, useColorScheme, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { getDafTheme } from '../design-system/tokens';
import { useContribute } from './contribute-state';

const MANUFACTURER_LABELS = {
    flock: 'Flock Safety',
    motorola: 'Motorola Solutions',
};

function getPublishedNodeLabel(details = {}) {
    const typeLabel = details.type === 'cctv' ? 'CCTV camera' : 'ALPR camera';
    const manufacturerLabel = MANUFACTURER_LABELS[details.manufacturer];

    return manufacturerLabel
        ? `${typeLabel} · ${manufacturerLabel}`
        : typeLabel;
}

function formatChangesetId(changesetId) {
    const numericId = Number(changesetId);

    return Number.isFinite(numericId)
        ? numericId.toLocaleString()
        : `${changesetId}`;
}

export default function PublishedScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { finishContribute, pins, publishResult, resetForMoreCameras } =
        useContribute();
    const theme = getDafTheme(colorScheme);
    const userName = user?.name ?? 'you';
    const publishResultIsMissing = !publishResult;
    const contentPaddingTop = Math.max(insets.top + 24, 60);
    const footerPaddingBottom = Math.max(insets.bottom + 12, 28);

    usePreventRemove(!publishResultIsMissing, () => {});

    useFocusEffect(
        useCallback(() => {
            // A focused published screen without a result (deep link, stale
            // stack) has nothing to show — send it back to the map.
            if (publishResultIsMissing) {
                router.replace('/');
            }
        }, [publishResultIsMissing]),
    );

    const handleSeeOnMapPress = useCallback(() => {
        finishContribute();
        router.replace('/');
    }, [finishContribute]);

    const handleAddMorePress = useCallback(() => {
        resetForMoreCameras();
        router.replace('/');
    }, [resetForMoreCameras]);

    if (!publishResult) {
        return null;
    }

    const publishedNodes = (publishResult.nodes ?? []).map((node) => {
        const publishedPin = pins.find((pin) => pin.id === node.pinId);

        return { details: publishedPin?.details, nodeId: node.nodeId };
    });
    const cameraCountLabel =
        publishedNodes.length === 1
            ? '1 camera'
            : `${publishedNodes.length} cameras`;

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
                    style={{ paddingTop: contentPaddingTop }}
                >
                    <View className="bg-daf-brand/12 dark:bg-daf-brand/15 h-[72px] w-[72px] items-center justify-center rounded-dafPill">
                        <Icon
                            color={theme.text.brand}
                            name="check"
                            size={34}
                            stroke={2.4}
                        />
                    </View>
                    <Text className="font-dafDisplay mt-[18px] text-center text-[21px] font-bold leading-[26px] text-daf-text-primary dark:text-white">
                        Changeset published
                    </Text>
                    <Text
                        className="font-dafMono mt-1.5 text-center text-xs text-daf-text-brand dark:text-daf-brand"
                        testID="contribute-changeset-id"
                    >
                        changeset/{formatChangesetId(publishResult.changesetId)}
                    </Text>
                    <Text className="mt-3 max-w-[260px] text-center text-[13px] leading-[19px] text-daf-text-secondary dark:text-neutral-300">
                        {cameraCountLabel} added, credited to{' '}
                        <Text className="font-bold text-daf-text-primary dark:text-white">
                            @{userName}
                        </Text>
                        .
                    </Text>
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark mt-5 w-full rounded-dafMd border border-daf-border bg-white px-3.5">
                        {publishedNodes.map((node, nodeIndex) => (
                            <View
                                className={`flex-row items-center gap-3 py-3 ${
                                    nodeIndex < publishedNodes.length - 1
                                        ? 'dark:border-daf-border-dark border-b border-daf-border'
                                        : ''
                                }`}
                                key={`${node.nodeId}-${nodeIndex}`}
                                testID={`contribute-published-node-${nodeIndex}`}
                            >
                                <View className="bg-daf-marker-alpr/15 h-[17px] w-[17px] items-center justify-center rounded-dafPill">
                                    <View className="h-[9px] w-[9px] rounded-dafPill bg-daf-marker-alpr" />
                                </View>
                                <Text
                                    className="min-w-0 flex-1 text-[13px] font-medium text-daf-text-primary dark:text-white"
                                    numberOfLines={1}
                                >
                                    {getPublishedNodeLabel(node.details)}
                                </Text>
                                <Text
                                    className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                                    numberOfLines={1}
                                >
                                    node/{node.nodeId}
                                </Text>
                            </View>
                        ))}
                    </View>
                    <Text className="mt-3.5 text-center text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                        They'll appear in Explore and on the Hotlist within
                        minutes.
                    </Text>
                </View>
            </ScrollView>
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-t border-daf-border bg-white px-4 pt-3"
                style={{ paddingBottom: footerPaddingBottom }}
            >
                <DafButton
                    onPress={handleSeeOnMapPress}
                    size="lg"
                    testID="contribute-see-on-map-button"
                >
                    See them on the map
                </DafButton>
                <View className="h-2.5" />
                <DafButton
                    onPress={handleAddMorePress}
                    testID="contribute-add-more-button"
                    variant="ghost"
                >
                    Add more cameras
                </DafButton>
            </View>
        </View>
    );
}
