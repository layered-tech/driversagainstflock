import { router, useIsFocused } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, ScrollView, Text, useColorScheme, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { REMOVAL_REASONS } from '../../lib/osm/edit-tags';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { usePreventRemove } from '../../lib/use-prevent-remove';
import { Icon } from '../design-system/icon';
import { DafButton, DafSectionLabel } from '../design-system/primitives';
import { dafColors, getDafTheme } from '../design-system/tokens';
import { saveDraftBeforeExit } from './contribute-draft-actions';
import { useContribute } from './contribute-state';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { ContributeTourTarget } from './contribute-tour-target';
import { ContributePageHeader } from './step-header';

const MANUFACTURER_LABELS = {
    flock: 'Flock Safety',
    motorola: 'Motorola Solutions',
};

const SOURCE_LABELS = {
    'aerial imagery': 'Aerial imagery',
    'local knowledge': 'Local knowledge',
    survey: 'Survey',
};

function getChangeRowLabel(details = {}) {
    const typeLabel = details.type === 'cctv' ? 'CCTV camera' : 'ALPR camera';
    const manufacturerLabel = MANUFACTURER_LABELS[details.manufacturer];

    return manufacturerLabel
        ? `Added ${typeLabel} · ${manufacturerLabel}`
        : `Added ${typeLabel}`;
}

function formatSourceLabel(source) {
    if (SOURCE_LABELS[source]) {
        return SOURCE_LABELS[source];
    }

    const trimmedSource = typeof source === 'string' ? source.trim() : '';

    return trimmedSource
        ? trimmedSource.charAt(0).toUpperCase() + trimmedSource.slice(1)
        : '';
}

export default function ReviewPublishScreen() {
    const tourTargets = useRef({});
    const tourScrollRef = useRef(null);
    const tourContentRef = useRef(null);
    const screenIsFocused = useIsFocused();
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const {
        changeset,
        exitContribute,
        pins,
        removals,
        removeRemoval,
        publish,
        publishError,
        publishStatus,
        saveDraft,
        tour,
    } = useContribute();
    const isPublishing = publishStatus === 'publishing';
    const theme = getDafTheme(colorScheme);
    const userName = user?.name ?? 'you';
    const footerPaddingBottom = Math.max(insets.bottom + 12, 28);

    usePreventRemove(isPublishing, () => {});

    const handleBackPress = useCallback(() => {
        if (isPublishing) {
            return;
        }

        router.back();
    }, [isPublishing]);

    const handlePublishPress = useCallback(() => {
        publish();
    }, [publish]);

    const handleSaveDraftPress = useCallback(async () => {
        const draftWasSaved = await saveDraftBeforeExit(saveDraft, () => {
            router.replace('/');
            exitContribute();
        });

        if (!draftWasSaved) {
            Alert.alert(
                'Draft not saved',
                'Your draft could not be saved on this device. Please try again before leaving.',
            );
        }
    }, [exitContribute, saveDraft]);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="contribute-review-screen"
        >
            <ContributePageHeader
                onBack={handleBackPress}
                step={4}
                title="Review & publish"
            />
            <ScrollView className="flex-1" ref={tourScrollRef}>
                <View
                    className="gap-4 p-4"
                    collapsable={false}
                    ref={tourContentRef}
                >
                    <View className="rounded-dafMd border border-daf-border bg-white p-3.5 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <DafSectionLabel className="mb-1.5">
                            Comment
                        </DafSectionLabel>
                        <Text
                            className="font-dafDisplay text-[17px] font-medium leading-[23px] text-daf-text-primary dark:text-white"
                            testID="contribute-review-comment"
                        >
                            {changeset.comment}
                        </Text>
                    </View>
                    <View>
                        <DafSectionLabel className="mb-1">
                            Changes · {pins.length + removals.length}
                        </DafSectionLabel>
                        {pins.map((pin, pinIndex) => (
                            <ContributeTourTarget
                                id={
                                    pinIndex === 0
                                        ? 'review'
                                        : `review-${pinIndex}`
                                }
                                targets={tourTargets}
                                className={`flex-row items-center gap-[11px] py-2.5 ${
                                    pinIndex < pins.length - 1
                                        ? 'border-b border-daf-border dark:border-daf-border-dark'
                                        : ''
                                }`}
                                key={pin.id}
                                testID={`contribute-change-row-${pinIndex}`}
                            >
                                <View className="bg-daf-brand/12 h-[26px] w-[26px] items-center justify-center rounded-dafPill dark:bg-daf-brand/15">
                                    <Icon
                                        color={theme.text.brand}
                                        name="plus"
                                        size={15}
                                        stroke={2.4}
                                    />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text
                                        className="text-[13px] font-medium text-daf-text-primary dark:text-white"
                                        numberOfLines={1}
                                    >
                                        {getChangeRowLabel(pin.details)}
                                    </Text>
                                    <Text
                                        className="font-dafMono text-xs text-daf-text-tertiary dark:text-neutral-400"
                                        numberOfLines={1}
                                    >
                                        node · {pin.latitude.toFixed(4)},{' '}
                                        {pin.longitude.toFixed(4)}
                                    </Text>
                                </View>
                            </ContributeTourTarget>
                        ))}
                        {removals.map((node) => (
                            <View
                                key={`remove-${node.id}`}
                                className="flex-row items-center gap-3 py-2.5"
                                testID={`contribute-review-removal-${node.id}`}
                            >
                                <Icon
                                    name="trash"
                                    color={dafColors.amber[600]}
                                    size={17}
                                />
                                <View className="min-w-0 flex-1">
                                    <Text className="text-[13px] font-medium text-daf-text-primary dark:text-white">
                                        Remove camera · node/{node.id}
                                    </Text>
                                    <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                        {REMOVAL_REASONS.find(
                                            (reason) =>
                                                reason.value === node.reason,
                                        )?.label ?? node.reason}{' '}
                                        · v{node.version}
                                    </Text>
                                </View>
                                <DafButton
                                    disabled={
                                        isPublishing ||
                                        pins.length + removals.length === 0
                                    }
                                    onPress={() => removeRemoval(node.id)}
                                    testID={`contribute-undo-removal-${node.id}`}
                                    variant="ghost"
                                >
                                    Undo
                                </DafButton>
                            </View>
                        ))}
                    </View>
                    <View className="flex-row gap-4">
                        <View className="flex-1">
                            <DafSectionLabel className="mb-[3px]">
                                Source
                            </DafSectionLabel>
                            <Text className="text-[13px] font-medium text-daf-text-primary dark:text-white">
                                {formatSourceLabel(changeset.source)}
                            </Text>
                        </View>
                        <View className="flex-1">
                            <DafSectionLabel className="mb-[3px]">
                                Editor
                            </DafSectionLabel>
                            <Text className="text-[13px] font-medium text-daf-text-primary dark:text-white">
                                DriversAgainstFlock.org
                            </Text>
                        </View>
                    </View>
                    <View className="flex-row items-start gap-[9px] rounded-dafSm bg-daf-surface-alt px-3 py-[11px] dark:bg-daf-surface-inverse">
                        <View className="mt-px">
                            <Icon
                                color={dafColors.amber[600]}
                                name="triangle-alert"
                                size={16}
                            />
                        </View>
                        <Text className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                            Edits are public and credited to{' '}
                            <Text className="font-bold text-daf-text-primary dark:text-white">
                                @{userName}
                            </Text>
                            . Map only what you can verify.
                        </Text>
                    </View>
                </View>
            </ScrollView>
            <View
                className="border-t border-daf-border bg-white px-4 pt-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                style={{ paddingBottom: footerPaddingBottom }}
            >
                {publishError ? (
                    <View
                        className="mb-2.5 rounded-dafSm border border-daf-alert/30 bg-daf-alert/10 p-3 dark:bg-daf-alert/15"
                        testID="contribute-publish-error"
                    >
                        <Text className="text-[13px] leading-[18px] text-daf-alert">
                            {publishError}
                        </Text>
                    </View>
                ) : null}
                <ContributeTourTarget id="publish" targets={tourTargets}>
                    <DafButton
                        disabled={pins.length + removals.length === 0}
                        icon="upload"
                        loading={isPublishing}
                        onPress={handlePublishPress}
                        size="lg"
                        testID="contribute-publish-button"
                    >
                        {publishStatus === 'error'
                            ? 'Try again'
                            : 'Publish to OpenStreetMap'}
                    </DafButton>
                </ContributeTourTarget>
                <View className="h-2.5" />
                <DafButton
                    disabled={
                        isPublishing || pins.length + removals.length === 0
                    }
                    onPress={handleSaveDraftPress}
                    testID="contribute-save-draft-button"
                    variant="ghost"
                >
                    Save as draft
                </DafButton>
            </View>
            <ContributeTourOverlay
                enabled={screenIsFocused && !isPublishing}
                insets={insets}
                phase="review"
                targets={tourTargets}
                tour={tour}
                contentRef={tourContentRef}
                scrollRef={tourScrollRef}
            />
        </View>
    );
}
