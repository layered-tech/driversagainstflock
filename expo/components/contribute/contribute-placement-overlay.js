import { DuoText as Text } from '../design-system/duo-typography';
import { NativeNavigationAction } from '../root/native-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    BackHandler,
    Platform,
    Pressable,
    useWindowDimensions,
    View,
} from 'react-native';
import { useDuoDevice } from '../root/duo-device-context';
import { getContributeMapLayout } from './contribute-layout';
import { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetScrollView,
} from '../map/native-components';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { useContribute } from './contribute-state';
import { saveDraftBeforeExit } from './contribute-draft-actions';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { getChangesetSummary } from './changeset-summary';

export function ContributePlacementOverlay({ screenIsFocused, tourTargets }) {
    const insets = useSafeAreaInsets();
    const duo = useDuoDevice();
    const { width, height } = useWindowDimensions();
    const { pane } = getContributeMapLayout({
        width,
        height,
        insets,
        duoDevice: duo,
        tabletDevice: Platform.isPad,
    });
    const {
        discardStoredDraft,
        exitContribute,
        pins,
        removals,
        saveDraft,
        tour,
    } = useContribute();
    const [closeOpen, setCloseOpen] = useState(false);
    const closeRef = useRef(null);
    const summary = getChangesetSummary(pins, removals);
    const requestExit = useCallback(() => {
        if (!summary.total) {
            exitContribute();
            return;
        }
        setCloseOpen(true);
    }, [summary.total, exitContribute]);
    useEffect(() => {
        if (closeOpen) closeRef.current?.present();
        else closeRef.current?.dismiss();
    }, [closeOpen]);
    useEffect(() => {
        if (!screenIsFocused) return;
        const listener = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                requestExit();
                return true;
            },
        );
        return () => listener.remove();
    }, [screenIsFocused, requestExit]);
    return (
        <View
            className="gap-3"
            pointerEvents="box-none"
            style={
                pane
                    ? Platform.isPad && summary.total
                        ? {
                              marginLeft: pane.width + 24,
                              width:
                                  width -
                                  pane.left -
                                  pane.width -
                                  36 -
                                  (insets.right ?? 0),
                          }
                        : { width: pane.width }
                    : undefined
            }
        >
            <View className="flex-row items-center gap-2 rounded-dafMd border border-daf-border-glass bg-white/90 py-[7px] pl-1.5 pr-2 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90">
                <NativeNavigationAction railOnly kind="close" priority={100}>
                    <Pressable
                        className="h-10 w-10 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel="Close editor"
                        onPress={requestExit}
                        testID="contribute-back-button"
                    >
                        <Icon name="x" size={20} color="#697583" />
                    </Pressable>
                </NativeNavigationAction>
                <Text className="min-w-0 flex-1 text-[15px] font-semibold text-daf-text-primary dark:text-white">
                    {summary.total ? 'Editing' : 'Editing the map'}
                </Text>
                {summary.total ? (
                    <View className="rounded-full bg-daf-brand/15 px-[9px] py-1">
                        <Text className="font-dafMono text-[11px] font-semibold text-daf-text-brand dark:text-daf-brand">
                            {summary.total}{' '}
                            {summary.total === 1 ? 'change' : 'changes'}
                        </Text>
                    </View>
                ) : null}
            </View>
            <ContributeTourOverlay
                enabled={screenIsFocused && pins.length === 0 && !closeOpen}
                insets={insets}
                phase="placement"
                targets={tourTargets}
                tour={tour}
            />
            <NativeWindBottomSheetModal
                ref={closeRef}
                tabletPresentation="confirmation"
                backdropComponent={(props) => (
                    <BottomSheetBackdrop
                        {...props}
                        appearsOnIndex={0}
                        disappearsOnIndex={-1}
                        opacity={0.28}
                    />
                )}
                enableDynamicSizing
                backgroundClassName="bg-white dark:bg-daf-surface-dark"
                onDismiss={() => setCloseOpen(false)}
            >
                <NativeWindBottomSheetScrollView
                    className="bg-white dark:bg-daf-surface-dark"
                    contentContainerStyle={{
                        paddingBottom: Math.max(insets.bottom + 12, 20),
                    }}
                    testID="contribute-close-editor-sheet"
                >
                    <View className="gap-3 px-4 pt-1">
                        <Text className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                            Close the editor?
                        </Text>
                        <Text className="text-[13px] text-daf-text-secondary dark:text-neutral-300">
                            {summary.total}{' '}
                            {summary.total === 1 ? 'change' : 'changes'} staged
                            · nothing published
                        </Text>
                        <Text className="mb-1 text-[13px] leading-5 text-daf-text-secondary dark:text-neutral-300">
                            Keep them as a draft and pick up where you left off
                            — the pencil on the map shows what's pending. Drafts
                            stay on this phone until you publish or discard
                            them.
                        </Text>
                        <DafButton
                            size="lg"
                            onPress={async () => {
                                const saved = await saveDraftBeforeExit(
                                    saveDraft,
                                    exitContribute,
                                );
                                if (!saved)
                                    Alert.alert(
                                        'Draft not saved',
                                        'Your draft could not be saved on this device. Please try again before leaving.',
                                    );
                            }}
                            testID="contribute-keep-draft"
                        >
                            Keep as draft
                        </DafButton>
                        <DafButton
                            variant="ghost"
                            onPress={async () => {
                                await discardStoredDraft();
                                exitContribute();
                            }}
                            testID="contribute-discard-changes"
                        >
                            <Text className="text-daf-alert">
                                Discard {summary.total} changes
                            </Text>
                        </DafButton>
                        <DafButton
                            variant="ghost"
                            onPress={() => setCloseOpen(false)}
                            testID="contribute-cancel-close"
                        >
                            Cancel
                        </DafButton>
                    </View>
                </NativeWindBottomSheetScrollView>
            </NativeWindBottomSheetModal>
        </View>
    );
}
