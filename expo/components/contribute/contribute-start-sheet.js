import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { Icon } from '../design-system/icon';
import { DafBadge, DafButton } from '../design-system/primitives';
import { dafColors, dafSemanticColors } from '../design-system/tokens';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from '../map/native-components';
import { ContributeAuthProgress } from './contribute-auth-progress';
import { useContribute } from './contribute-state';

const CONTRIBUTE_STEPS = [
    'Place a pin on each camera',
    'Describe each camera',
    'Describe the changeset',
    'Review & publish',
];

function formatDraftPinCount(pinCount) {
    return pinCount === 1 ? '1 camera' : `${pinCount} cameras`;
}

function formatDraftSavedRelativeTime(value) {
    const timestamp = new Date(value ?? '').getTime();

    if (Number.isNaN(timestamp)) {
        return 'just now';
    }

    const diffMinutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60000);

    if (diffMinutes < 1) {
        return 'just now';
    }

    if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);

    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }

    return `${Math.floor(diffDays / 7)}w ago`;
}

function ContributeAccountCard({ isAuthenticated, subtitle, title }) {
    return (
        <View className="flex-row items-center gap-3 rounded-dafMd bg-daf-surface-alt px-3 py-[11px] dark:bg-daf-surface-inverse">
            <View
                className={`h-10 w-10 items-center justify-center rounded-dafPill ${
                    isAuthenticated
                        ? 'bg-daf-brand/15'
                        : 'dark:bg-daf-surface-dark bg-white'
                }`}
            >
                <Icon
                    color={
                        isAuthenticated
                            ? dafColors.green[700]
                            : dafSemanticColors.speedOk
                    }
                    name="user"
                    size={20}
                />
            </View>
            <View className="min-w-0 flex-1">
                <Text
                    className="text-sm font-semibold text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                <Text
                    className="text-xs text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={2}
                >
                    {subtitle}
                </Text>
            </View>
            {isAuthenticated ? <DafBadge tone="brand">OSM</DafBadge> : null}
        </View>
    );
}

export function ContributeStartSheet({
    bottomSheetBackgroundStyle,
    bottomSheetHandleIndicatorStyle,
    insets,
    mapPreferencesAreLoaded,
    renderBackdrop,
}) {
    const { height: windowHeight } = useWindowDimensions();
    const isFocused = useIsFocused();
    const {
        ensureWriteAccess,
        hasWriteScope,
        isAuthenticated,
        isLoading,
        isSigningIn,
        user,
    } = useAuth();
    const {
        closeStartSheet,
        contributeStatus,
        discardStoredDraft,
        resumeStoredDraft,
        startPlacing,
        storedDraftSummary,
    } = useContribute();
    const sheetRef = useRef(null);
    const [signInError, setSignInError] = useState('');
    const startSheetIsOpen = contributeStatus === 'start-sheet';
    const authProgressIsVisible = isLoading || isSigningIn;

    useEffect(() => {
        if (startSheetIsOpen && isFocused && mapPreferencesAreLoaded) {
            sheetRef.current?.present();
        } else {
            sheetRef.current?.dismiss();
        }
    }, [isFocused, mapPreferencesAreLoaded, startSheetIsOpen]);

    const handleSheetDismiss = useCallback(() => {
        if (isSigningIn) {
            return;
        }

        setSignInError('');
        closeStartSheet();
    }, [closeStartSheet, isSigningIn]);

    const renderStartSheetBackdrop = useCallback(
        (props) =>
            renderBackdrop({
                ...props,
                pressBehavior: isSigningIn ? 'none' : 'close',
            }),
        [isSigningIn, renderBackdrop],
    );

    const handleGrantAccessPress = useCallback(async () => {
        setSignInError('');

        try {
            await ensureWriteAccess();
        } catch (error) {
            setSignInError(
                error?.message ??
                    'Sign-in with OpenStreetMap failed. Please try again.',
            );
        }
    }, [ensureWriteAccess]);

    const handleResumeDraftPress = useCallback(() => {
        resumeStoredDraft();
    }, [resumeStoredDraft]);

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <NativeWindBottomSheetModal
            ref={sheetRef}
            backdropComponent={renderStartSheetBackdrop}
            backgroundStyle={bottomSheetBackgroundStyle}
            enableDynamicSizing
            enableOverDrag={false}
            enablePanDownToClose={!isSigningIn}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            index={0}
            maxDynamicContentSize={windowHeight * 0.85}
            onDismiss={handleSheetDismiss}
        >
            <NativeWindBottomSheetView
                className="dark:bg-daf-surface-dark bg-white"
                testID="contribute-start-sheet"
            >
                <BottomSheetScrollView
                    contentContainerStyle={{
                        gap: 16,
                        paddingBottom: Math.max(insets.bottom + 12, 20),
                        paddingHorizontal: 24,
                        paddingTop: 4,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {authProgressIsVisible ? (
                        <ContributeAuthProgress
                            hasUser={Boolean(user)}
                            hasWriteScope={hasWriteScope}
                            isAuthenticated={isAuthenticated}
                            isLoading={isLoading}
                            isSigningIn={isSigningIn}
                        />
                    ) : (
                        <>
                            <View className="gap-1">
                                <Text className="font-dafDisplay text-[21px] font-bold leading-7 text-daf-text-primary dark:text-white">
                                    Start a changeset
                                </Text>
                                <Text className="text-sm text-daf-text-secondary dark:text-neutral-300">
                                    Add camera data to OpenStreetMap
                                </Text>
                            </View>

                            {isAuthenticated ? (
                                <ContributeAccountCard
                                    isAuthenticated
                                    subtitle={
                                        hasWriteScope
                                            ? 'OpenStreetMap account · signed in'
                                            : 'Signed in — editing access needed'
                                    }
                                    title={
                                        user?.name
                                            ? `@${user.name}`
                                            : 'OpenStreetMap account'
                                    }
                                />
                            ) : (
                                <ContributeAccountCard
                                    isAuthenticated={false}
                                    subtitle="You need an OpenStreetMap account to publish edits"
                                    title="Not signed in"
                                />
                            )}

                            {storedDraftSummary ? (
                                <View className="dark:border-daf-border-dark gap-3 rounded-dafMd border border-daf-border bg-daf-surface-alt p-3 dark:bg-daf-surface-inverse">
                                    <Text className="text-sm font-semibold text-daf-text-primary dark:text-white">
                                        {`Draft in progress — ${formatDraftPinCount(storedDraftSummary.pinCount)} · saved ${formatDraftSavedRelativeTime(storedDraftSummary.updatedAt)}`}
                                    </Text>
                                    <View className="flex-row gap-2">
                                        <DafButton
                                            accessibilityLabel="Resume draft"
                                            className="flex-1"
                                            onPress={handleResumeDraftPress}
                                            testID="contribute-resume-draft-button"
                                            variant="secondary"
                                        >
                                            Resume draft
                                        </DafButton>
                                        <DafButton
                                            accessibilityLabel="Discard draft"
                                            className="flex-1"
                                            onPress={discardStoredDraft}
                                            testID="contribute-discard-draft-button"
                                            variant="ghost"
                                        >
                                            Discard draft
                                        </DafButton>
                                    </View>
                                </View>
                            ) : null}

                            <Text className="text-sm leading-[21px] text-daf-text-secondary dark:text-neutral-300">
                                Your edits are public and credited to you. Place
                                new camera nodes or fix existing ones, then
                                publish them together in one changeset.
                            </Text>

                            <View className="gap-2.5">
                                {CONTRIBUTE_STEPS.map((step, stepIndex) => (
                                    <View
                                        className="flex-row items-center gap-[11px]"
                                        key={step}
                                    >
                                        <View className="bg-daf-brand/15 h-6 w-6 items-center justify-center rounded-dafPill">
                                            <Text className="font-dafMono text-xs font-bold text-daf-text-brand dark:text-daf-brand">
                                                {stepIndex + 1}
                                            </Text>
                                        </View>
                                        <Text className="flex-1 text-sm text-daf-text-primary dark:text-white">
                                            {step}
                                        </Text>
                                    </View>
                                ))}
                            </View>

                            {signInError ? (
                                <Text className="rounded-dafMd bg-red-50 px-3 py-2 text-sm leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                                    {signInError}
                                </Text>
                            ) : null}

                            {isAuthenticated ? (
                                hasWriteScope ? (
                                    <DafButton
                                        accessibilityLabel="Start editing"
                                        icon="pencil"
                                        onPress={startPlacing}
                                        size="lg"
                                        testID="contribute-start-editing-button"
                                    >
                                        Start editing
                                    </DafButton>
                                ) : (
                                    <DafButton
                                        accessibilityLabel="Allow map editing"
                                        loading={isSigningIn}
                                        onPress={handleGrantAccessPress}
                                        size="lg"
                                        testID="contribute-grant-access-button"
                                    >
                                        Allow map editing
                                    </DafButton>
                                )
                            ) : (
                                <DafButton
                                    accessibilityLabel="Sign in with OpenStreetMap"
                                    loading={isSigningIn}
                                    onPress={handleGrantAccessPress}
                                    size="lg"
                                    testID="contribute-sign-in-button"
                                >
                                    Sign in with OpenStreetMap
                                </DafButton>
                            )}
                        </>
                    )}
                </BottomSheetScrollView>
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
