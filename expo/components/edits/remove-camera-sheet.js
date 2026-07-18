import { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { publishNodeDeletion } from '../../lib/osm/client';
import {
    buildRemovalChangesetComment,
    REMOVAL_REASONS,
} from '../../lib/osm/edit-tags';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { buildChangesetTags } from '../contribute/osm-tags';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafChip,
    DafSectionLabel,
} from '../design-system/primitives';
import { dafColors } from '../design-system/tokens';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from '../map/native-components';

const REMOVAL_CHANGESET_HASHTAGS = '#flock #alpr #surveillance';

function getRemoveSheetSubtitle(node) {
    if (!node) {
        return '';
    }

    const hasLocation =
        Number.isFinite(node.latitude) && Number.isFinite(node.longitude);

    return hasLocation
        ? `node/${node.id} · ${node.latitude.toFixed(4)}, ${node.longitude.toFixed(4)}`
        : `node/${node.id}`;
}

export function RemoveCameraSheet({ isOpen, node, onDismiss, onRemoved }) {
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { ensureWriteAccess, openStreetMapAccessToken, user } = useAuth();
    const sheetRef = useRef(null);
    const [removeError, setRemoveError] = useState(null);
    const [removeStatus, setRemoveStatus] = useState('idle');
    const [selectedReason, setSelectedReason] = useState(
        REMOVAL_REASONS[0].value,
    );
    const removeIsInFlightRef = useRef(false);
    const isRemoving = removeStatus === 'removing';
    const userName = user?.name ?? 'you';

    useEffect(() => {
        if (isOpen) {
            sheetRef.current?.present();
        } else {
            sheetRef.current?.dismiss();
        }
    }, [isOpen]);

    const renderBackdrop = useCallback(
        (backdropProps) => (
            <BottomSheetBackdrop
                {...backdropProps}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                opacity={0.45}
                pressBehavior={isRemoving ? 'none' : 'close'}
            />
        ),
        [isRemoving],
    );

    const handleSheetDismiss = useCallback(() => {
        setRemoveError(null);
        setRemoveStatus('idle');
        setSelectedReason(REMOVAL_REASONS[0].value);
        onDismiss?.();
    }, [onDismiss]);

    const handleCancelPress = useCallback(() => {
        sheetRef.current?.dismiss();
    }, []);

    const handleConfirmPress = useCallback(async () => {
        if (removeIsInFlightRef.current || !node) {
            return;
        }

        removeIsInFlightRef.current = true;
        setRemoveError(null);
        setRemoveStatus('removing');

        try {
            const session = await ensureWriteAccess();

            if (!session) {
                setRemoveStatus('idle');
                return;
            }

            const accessToken =
                session.token ??
                session.accessToken ??
                openStreetMapAccessToken;

            await publishNodeDeletion({
                accessToken,
                changesetTags: buildChangesetTags({
                    comment: buildRemovalChangesetComment(selectedReason),
                    hashtags: REMOVAL_CHANGESET_HASHTAGS,
                    source: 'survey',
                }),
                node: {
                    id: node.id,
                    latitude: node.latitude,
                    longitude: node.longitude,
                    version: node.version,
                },
            });

            setRemoveStatus('idle');
            sheetRef.current?.dismiss();
            onRemoved?.();
        } catch (error) {
            setRemoveError(
                error?.message ??
                    'Removing the camera from OpenStreetMap failed.',
            );
            setRemoveStatus('error');
        } finally {
            removeIsInFlightRef.current = false;
        }
    }, [
        ensureWriteAccess,
        node,
        onRemoved,
        openStreetMapAccessToken,
        selectedReason,
    ]);

    return (
        <NativeWindBottomSheetModal
            ref={sheetRef}
            backdropComponent={renderBackdrop}
            backgroundClassName="dark:bg-daf-surface-dark bg-white"
            enableDynamicSizing
            enableOverDrag={false}
            enablePanDownToClose={!isRemoving}
            handleIndicatorClassName="bg-daf-border-strong dark:bg-[#3A434E]"
            index={0}
            maxDynamicContentSize={windowHeight * 0.85}
            onDismiss={handleSheetDismiss}
        >
            <NativeWindBottomSheetView
                className="dark:bg-daf-surface-dark bg-white"
                testID="remove-camera-sheet"
            >
                <View
                    className="gap-4 px-6 pt-1"
                    style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
                >
                    <View className="gap-1">
                        <Text className="font-dafDisplay text-[21px] font-bold leading-7 text-daf-text-primary dark:text-white">
                            Remove this camera?
                        </Text>
                        <Text
                            className="font-dafMono text-[13px] text-daf-text-secondary dark:text-neutral-300"
                            numberOfLines={1}
                        >
                            {getRemoveSheetSubtitle(node)}
                        </Text>
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Why remove it?
                        </DafSectionLabel>
                        <View className="flex-row flex-wrap gap-2">
                            {REMOVAL_REASONS.map((removalReason) => (
                                <DafChip
                                    key={removalReason.value}
                                    onPress={() =>
                                        setSelectedReason(removalReason.value)
                                    }
                                    selected={
                                        selectedReason === removalReason.value
                                    }
                                    testID={`remove-camera-reason-${removalReason.value}`}
                                    tone="brand"
                                >
                                    {removalReason.label}
                                </DafChip>
                            ))}
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
                            Removal is public — it publishes a delete changeset
                            credited to{' '}
                            <Text className="font-bold text-daf-text-primary dark:text-white">
                                @{userName}
                            </Text>
                            . Other mappers can see and discuss it.
                        </Text>
                    </View>
                    {removeError ? (
                        <Text
                            className="text-[13px] leading-[18px] text-daf-alert"
                            testID="remove-camera-error"
                        >
                            {removeError}
                        </Text>
                    ) : null}
                    <View>
                        <DafButton
                            icon="trash"
                            loading={isRemoving}
                            onPress={handleConfirmPress}
                            size="lg"
                            testID="remove-camera-confirm-button"
                            variant="danger"
                        >
                            Remove from map
                        </DafButton>
                        <View className="h-2.5" />
                        <DafButton
                            disabled={isRemoving}
                            onPress={handleCancelPress}
                            testID="remove-camera-cancel-button"
                            variant="ghost"
                        >
                            Cancel
                        </DafButton>
                    </View>
                </View>
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
