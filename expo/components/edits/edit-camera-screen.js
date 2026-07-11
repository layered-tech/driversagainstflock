import { usePreventRemove } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { fetchNode, publishNodeUpdate } from '../../lib/osm/client';
import {
    buildEditChangesetComment,
    buildUpdatedNodeTags,
    EDIT_CAMERA_TYPE_OPTIONS,
    EDIT_MANUFACTURER_OPTIONS,
    EDIT_MOUNT_OPTIONS,
    parseNodeDetails,
} from '../../lib/osm/edit-tags';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { CompassDial } from '../contribute/compass-dial';
import { buildChangesetTags, formatBearingChip } from '../contribute/osm-tags';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafChip,
    DafSectionLabel,
    DafSegmentedControl,
    DafTextInput,
} from '../design-system/primitives';
import {
    dafColors,
    dafSemanticColors,
    getDafTheme,
} from '../design-system/tokens';
import { RemoveCameraSheet } from './remove-camera-sheet';

const EDIT_CHANGESET_HASHTAGS = '#flock #alpr #surveillance';

const SHORT_MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

function getRouteParamValue(param) {
    return Array.isArray(param) ? param[0] : param;
}

function parseNodeIdParam(nodeIdParam) {
    const nodeId = Number.parseInt(getRouteParamValue(nodeIdParam), 10);

    return Number.isInteger(nodeId) && nodeId > 0 ? nodeId : null;
}

function formatShortDate(timestamp, { includeYear = true } = {}) {
    const date = new Date(timestamp ?? '');

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const dayAndMonth = `${date.getDate()} ${SHORT_MONTH_NAMES[date.getMonth()]}`;

    return includeYear ? `${dayAndMonth} ${date.getFullYear()}` : dayAndMonth;
}

function getEditedByLabel(node, currentUserId) {
    if (!node) {
        return '';
    }

    const dateLabel = formatShortDate(node.timestamp);
    const editorLabel =
        node.uid === currentUserId
            ? 'edited by you'
            : node.user
              ? `edited by @${node.user}`
              : 'edited';

    return dateLabel ? `${editorLabel} · ${dateLabel}` : editorLabel;
}

function EditCameraHeader({ onBack, versionLabel }) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const isDarkMode = colorScheme === 'dark';
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-1.5 border-b border-daf-border bg-white px-3 pb-3"
            style={{ paddingTop: headerPaddingTop }}
        >
            <Pressable
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="h-[50px] w-[50px] items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                hitSlop={6}
                onPress={onBack}
                testID="edit-camera-back-button"
            >
                <Icon
                    color={isDarkMode ? '#F4F7FA' : '#0B0E12'}
                    name="chevron-left"
                    size={20}
                />
            </Pressable>
            <Text
                className="font-dafDisplay min-w-0 flex-1 text-lg font-bold leading-6 text-daf-text-primary dark:text-white"
                numberOfLines={1}
            >
                Edit camera
            </Text>
            {versionLabel ? (
                <View
                    className="dark:border-daf-border-dark h-[26px] items-center justify-center rounded-dafPill border border-daf-border bg-daf-surface-alt px-[9px] dark:bg-daf-surface-inverse"
                    testID="edit-camera-version-pill"
                >
                    <Text
                        className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-secondary dark:text-neutral-300"
                        numberOfLines={1}
                    >
                        {versionLabel}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

function EditCameraSubheader({ metaLabel, nodeId }) {
    return (
        <View className="dark:border-daf-border-dark flex-row items-center gap-2 border-b border-daf-border bg-daf-surface-alt px-4 py-[9px] dark:bg-daf-surface-inverse">
            {nodeId ? (
                <Text
                    className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-brand dark:text-daf-brand"
                    numberOfLines={1}
                >
                    node/{nodeId}
                </Text>
            ) : null}
            {metaLabel ? (
                <Text
                    className="font-dafMono ml-auto text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {metaLabel}
                </Text>
            ) : null}
        </View>
    );
}

export default function EditCameraScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const { ensureWriteAccess, openStreetMapAccessToken, user } = useAuth();
    const [details, setDetails] = useState(null);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [loadError, setLoadError] = useState(null);
    const [loadStatus, setLoadStatus] = useState('loading');
    const [node, setNode] = useState(null);
    const [publishError, setPublishError] = useState(null);
    const [publishStatus, setPublishStatus] = useState('idle');
    const [rawSelectedDirectionIndex, setRawSelectedDirectionIndex] =
        useState(0);
    const [removeSheetIsOpen, setRemoveSheetIsOpen] = useState(false);
    const removeActionHandledRef = useRef(false);
    const saveIsInFlightRef = useRef(false);
    const action = getRouteParamValue(params.action);
    const nodeId = parseNodeIdParam(params.nodeId);
    const isSaving = publishStatus === 'publishing';
    const theme = getDafTheme(colorScheme);
    const footerPaddingBottom = Math.max(insets.bottom + 12, 28);
    const currentUserId = Number(user?.id);
    const directions = Array.isArray(details?.directions)
        ? details.directions
        : [];
    const selectedDirectionIndex =
        directions.length === 0
            ? 0
            : Math.min(rawSelectedDirectionIndex, directions.length - 1);
    const selectedBearing = directions[selectedDirectionIndex] ?? 0;
    const versionLabel = node
        ? `v${node.version} → v${node.version + 1}`
        : null;
    const editedByLabel = getEditedByLabel(node, currentUserId);
    const showsOverwriteNotice =
        Boolean(node?.user) && node?.uid !== currentUserId;
    const overwriteDateLabel = node
        ? formatShortDate(node.timestamp, { includeYear: false })
        : '';

    usePreventRemove(isSaving, () => {});

    useEffect(() => {
        if (nodeId === null) {
            setLoadError('This camera link is invalid.');
            setLoadStatus('error');
            return undefined;
        }

        const abortController = new AbortController();
        let isActive = true;

        setLoadError(null);
        setLoadStatus('loading');

        fetchNode({ nodeId, signal: abortController.signal })
            .then((fetchedNode) => {
                if (!isActive) {
                    return;
                }

                if (fetchedNode?.visible === false) {
                    setLoadStatus('deleted');
                    return;
                }

                setDetails(parseNodeDetails(fetchedNode?.tags ?? {}));
                setNode(fetchedNode);
                setRawSelectedDirectionIndex(0);
                setLoadStatus('loaded');
            })
            .catch((error) => {
                if (!isActive) {
                    return;
                }

                if (error?.code === 'gone' || error?.status === 410) {
                    setLoadStatus('deleted');
                    return;
                }

                setLoadError(
                    error?.message ??
                        'Loading this camera from OpenStreetMap failed.',
                );
                setLoadStatus('error');
            });

        return () => {
            isActive = false;
            abortController.abort();
        };
    }, [loadAttempt, nodeId]);

    useEffect(() => {
        if (
            loadStatus === 'loaded' &&
            action === 'remove' &&
            !removeActionHandledRef.current
        ) {
            removeActionHandledRef.current = true;
            setRemoveSheetIsOpen(true);
        }
    }, [action, loadStatus]);

    // Navigating back inside handleSavePress would still be blocked by
    // usePreventRemove — its prevention flag only clears in an effect after
    // the isSaving re-render. Leaving from an effect runs after that update.
    useEffect(() => {
        if (publishStatus === 'success') {
            router.back();
        }
    }, [publishStatus]);

    const updateDetails = useCallback((detailsPatch) => {
        setDetails((currentDetails) => ({
            ...currentDetails,
            ...detailsPatch,
        }));
    }, []);

    const handleBackPress = useCallback(() => {
        if (isSaving) {
            return;
        }

        router.back();
    }, [isSaving]);

    const handleRetryPress = useCallback(() => {
        setLoadAttempt((currentAttempt) => currentAttempt + 1);
    }, []);

    const handleTypeChange = useCallback(
        (type) => {
            updateDetails(
                type === 'gantry' ? { mount: 'gantry', type } : { type },
            );
        },
        [updateDetails],
    );

    const handleManufacturerChange = useCallback(
        (manufacturer) => {
            updateDetails({ manufacturer });
        },
        [updateDetails],
    );

    const handleOperatorChange = useCallback(
        (operator) => {
            updateDetails({ operator });
        },
        [updateDetails],
    );

    const handleDialChange = useCallback(
        (degrees) => {
            if (directions.length === 0) {
                setRawSelectedDirectionIndex(0);
                updateDetails({ directions: [degrees] });
                return;
            }

            updateDetails({
                directions: directions.map((direction, directionIndex) =>
                    directionIndex === selectedDirectionIndex
                        ? degrees
                        : direction,
                ),
            });
        },
        [directions, selectedDirectionIndex, updateDetails],
    );

    const handleAddDirection = useCallback(() => {
        const currentBearing = directions[selectedDirectionIndex] ?? 0;
        const nextDirections = [...directions, (currentBearing + 180) % 360];

        setRawSelectedDirectionIndex(nextDirections.length - 1);
        updateDetails({ directions: nextDirections });
    }, [directions, selectedDirectionIndex, updateDetails]);

    const handleRemoveDirection = useCallback(
        (directionIndex) => {
            const nextDirections = directions.filter(
                (direction, currentIndex) => currentIndex !== directionIndex,
            );

            setRawSelectedDirectionIndex((currentIndex) =>
                currentIndex > directionIndex
                    ? currentIndex - 1
                    : Math.min(
                          currentIndex,
                          Math.max(nextDirections.length - 1, 0),
                      ),
            );
            updateDetails({ directions: nextDirections });
        },
        [directions, updateDetails],
    );

    const handleMountChange = useCallback(
        (mount) => {
            updateDetails({ mount: details?.mount === mount ? null : mount });
        },
        [details?.mount, updateDetails],
    );

    const handleRemoveRowPress = useCallback(() => {
        if (isSaving) {
            return;
        }

        setRemoveSheetIsOpen(true);
    }, [isSaving]);

    const handleRemoveSheetDismiss = useCallback(() => {
        setRemoveSheetIsOpen(false);
    }, []);

    const handleRemoved = useCallback(() => {
        router.back();
    }, []);

    const handleSavePress = useCallback(async () => {
        if (saveIsInFlightRef.current || !node || !details) {
            return;
        }

        saveIsInFlightRef.current = true;
        setPublishError(null);
        setPublishStatus('publishing');

        try {
            const session = await ensureWriteAccess();

            if (!session) {
                setPublishStatus('idle');
                return;
            }

            const accessToken =
                session.token ??
                session.accessToken ??
                openStreetMapAccessToken;

            await publishNodeUpdate({
                accessToken,
                changesetTags: buildChangesetTags({
                    comment: buildEditChangesetComment(details),
                    hashtags: EDIT_CHANGESET_HASHTAGS,
                    source: 'survey',
                }),
                node: {
                    id: node.id,
                    latitude: node.latitude,
                    longitude: node.longitude,
                    tags: buildUpdatedNodeTags(node.tags, details),
                    version: node.version,
                },
            });

            setPublishStatus('success');
        } catch (error) {
            setPublishError(
                error?.message ?? 'Publishing to OpenStreetMap failed.',
            );
            setPublishStatus('error');
        } finally {
            saveIsInFlightRef.current = false;
        }
    }, [details, ensureWriteAccess, node, openStreetMapAccessToken]);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="edit-camera-screen"
        >
            <EditCameraHeader
                onBack={handleBackPress}
                versionLabel={versionLabel}
            />
            <EditCameraSubheader metaLabel={editedByLabel} nodeId={nodeId} />
            {loadStatus === 'loading' ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color={dafSemanticColors.brand} />
                </View>
            ) : loadStatus === 'deleted' ? (
                <View className="flex-1 items-center justify-center gap-4 px-6">
                    <Text
                        className="text-center text-sm leading-[21px] text-daf-text-secondary dark:text-neutral-300"
                        testID="edit-camera-deleted-message"
                    >
                        This camera was already removed from the map.
                    </Text>
                    <DafButton
                        onPress={handleBackPress}
                        testID="edit-camera-deleted-back-button"
                        variant="secondary"
                    >
                        Back
                    </DafButton>
                </View>
            ) : loadStatus === 'error' ? (
                <View className="flex-1 items-center justify-center gap-4 px-6">
                    <Text
                        className="text-center text-sm leading-[21px] text-daf-text-secondary dark:text-neutral-300"
                        testID="edit-camera-load-error"
                    >
                        {loadError}
                    </Text>
                    <DafButton
                        onPress={handleRetryPress}
                        testID="edit-camera-retry-button"
                        variant="secondary"
                    >
                        Retry
                    </DafButton>
                </View>
            ) : (
                <>
                    <ScrollView
                        className="flex-1"
                        keyboardShouldPersistTaps="handled"
                    >
                        <View className="gap-[18px] p-4">
                            {showsOverwriteNotice ? (
                                <View
                                    className="bg-daf-amber/12 dark:bg-daf-amber/15 flex-row items-start gap-[9px] rounded-dafSm px-3 py-[11px]"
                                    testID="edit-camera-overwrite-notice"
                                >
                                    <View className="mt-px">
                                        <Icon
                                            color={dafColors.amber[600]}
                                            name="triangle-alert"
                                            size={16}
                                        />
                                    </View>
                                    <Text className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                                        <Text className="font-bold text-daf-text-primary dark:text-white">
                                            @{node.user}
                                        </Text>{' '}
                                        {overwriteDateLabel
                                            ? `updated this camera on ${overwriteDateLabel}.`
                                            : 'updated this camera.'}{' '}
                                        Review the tags below — saving
                                        overwrites theirs.
                                    </Text>
                                </View>
                            ) : null}
                            <View>
                                <DafSectionLabel className="mb-2">
                                    Type
                                </DafSectionLabel>
                                <DafSegmentedControl
                                    onChange={handleTypeChange}
                                    options={EDIT_CAMERA_TYPE_OPTIONS}
                                    testIDPrefix="edit-camera-type"
                                    value={details.type}
                                />
                            </View>
                            <View>
                                <DafSectionLabel className="mb-2">
                                    Manufacturer
                                </DafSectionLabel>
                                <DafSegmentedControl
                                    onChange={handleManufacturerChange}
                                    options={EDIT_MANUFACTURER_OPTIONS}
                                    testIDPrefix="edit-camera-manufacturer"
                                    value={details.manufacturer}
                                />
                            </View>
                            <View>
                                <DafSectionLabel className="mb-2">
                                    Operator
                                </DafSectionLabel>
                                <DafTextInput
                                    onChangeText={handleOperatorChange}
                                    testID="edit-camera-operator-input"
                                    value={details.operator}
                                />
                            </View>
                            <View>
                                <DafSectionLabel className="mb-2">
                                    Directions faced
                                </DafSectionLabel>
                                <CompassDial
                                    onChange={handleDialChange}
                                    testID="edit-camera-direction-dial"
                                    value={selectedBearing}
                                />
                                <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
                                    {directions.map(
                                        (degrees, directionIndex) => {
                                            const selected =
                                                directionIndex ===
                                                selectedDirectionIndex;

                                            return (
                                                <View
                                                    className={`h-8 flex-row items-center rounded-dafPill border pl-3 pr-1 ${
                                                        selected
                                                            ? 'border-daf-brand/35 bg-daf-brand/12 dark:bg-daf-brand/15'
                                                            : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
                                                    }`}
                                                    key={`direction-${directionIndex}`}
                                                >
                                                    <Pressable
                                                        accessibilityLabel={`Edit direction ${formatBearingChip(degrees)}`}
                                                        accessibilityRole="button"
                                                        accessibilityState={{
                                                            selected,
                                                        }}
                                                        className="h-full justify-center"
                                                        onPress={() =>
                                                            setRawSelectedDirectionIndex(
                                                                directionIndex,
                                                            )
                                                        }
                                                        testID={`edit-camera-direction-chip-${directionIndex}`}
                                                    >
                                                        <Text
                                                            className={`font-dafMono text-[13px] font-semibold ${
                                                                selected
                                                                    ? 'text-daf-text-brand dark:text-daf-brand'
                                                                    : 'text-daf-text-primary dark:text-white'
                                                            }`}
                                                        >
                                                            {formatBearingChip(
                                                                degrees,
                                                            )}
                                                        </Text>
                                                    </Pressable>
                                                    <Pressable
                                                        accessibilityLabel="Remove direction"
                                                        accessibilityRole="button"
                                                        className="h-[22px] w-[22px] items-center justify-center"
                                                        hitSlop={6}
                                                        onPress={() =>
                                                            handleRemoveDirection(
                                                                directionIndex,
                                                            )
                                                        }
                                                        testID={`edit-camera-direction-chip-${directionIndex}-remove`}
                                                    >
                                                        <Icon
                                                            color={
                                                                selected
                                                                    ? theme.text
                                                                          .brand
                                                                    : theme.text
                                                                          .secondary
                                                            }
                                                            name="x"
                                                            size={13}
                                                            stroke={2.4}
                                                        />
                                                    </Pressable>
                                                </View>
                                            );
                                        },
                                    )}
                                    <Pressable
                                        accessibilityLabel="Add direction"
                                        accessibilityRole="button"
                                        className="h-8 flex-row items-center gap-1.5 rounded-dafPill border border-dashed border-daf-border-strong px-3.5 active:opacity-[0.82]"
                                        onPress={handleAddDirection}
                                        testID="edit-camera-add-direction-button"
                                    >
                                        <Icon
                                            color={theme.text.secondary}
                                            name="plus"
                                            size={15}
                                        />
                                        <Text className="text-[13px] font-semibold text-daf-text-secondary dark:text-neutral-300">
                                            Add direction
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                            <View>
                                <DafSectionLabel className="mb-2">
                                    Mounted on
                                </DafSectionLabel>
                                <View className="flex-row flex-wrap gap-2">
                                    {EDIT_MOUNT_OPTIONS.map((option) => (
                                        <DafChip
                                            key={option.value}
                                            onPress={() =>
                                                handleMountChange(option.value)
                                            }
                                            selected={
                                                details.mount === option.value
                                            }
                                            testID={`edit-camera-mount-${option.value}`}
                                            tone="brand"
                                        >
                                            {option.label}
                                        </DafChip>
                                    ))}
                                </View>
                            </View>
                            <Pressable
                                accessibilityLabel="Remove from map"
                                accessibilityRole="button"
                                className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-3 rounded-dafMd border border-daf-border bg-white px-3.5 py-3 active:opacity-[0.82]"
                                onPress={handleRemoveRowPress}
                                testID="edit-camera-remove-row"
                            >
                                <View className="bg-daf-alert/14 dark:bg-daf-alert/20 h-[34px] w-[34px] items-center justify-center rounded-dafSm">
                                    <Icon
                                        color={dafSemanticColors.danger}
                                        name="trash"
                                        size={18}
                                    />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text className="text-[13px] font-semibold text-daf-alert">
                                        Remove from map
                                    </Text>
                                    <Text className="mt-px text-xs text-daf-text-tertiary dark:text-neutral-400">
                                        Publishes a delete changeset
                                    </Text>
                                </View>
                                <Icon
                                    color={theme.text.tertiary}
                                    name="chevron-right"
                                    size={18}
                                />
                            </Pressable>
                        </View>
                    </ScrollView>
                    <View
                        className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-t border-daf-border bg-white px-4 pt-3"
                        style={{ paddingBottom: footerPaddingBottom }}
                    >
                        {publishError ? (
                            <View
                                className="border-daf-alert/30 bg-daf-alert/10 dark:bg-daf-alert/15 mb-2.5 rounded-dafSm border p-3"
                                testID="edit-camera-error-banner"
                            >
                                <Text className="text-[13px] leading-[18px] text-daf-alert">
                                    {publishError}
                                </Text>
                            </View>
                        ) : null}
                        <DafButton
                            disabled={isSaving}
                            loading={isSaving}
                            onPress={handleSavePress}
                            size="lg"
                            testID="edit-camera-save-button"
                        >
                            {publishStatus === 'error'
                                ? 'Try again'
                                : 'Save changes'}
                        </DafButton>
                        <Text className="mt-[9px] text-center text-xs text-daf-text-tertiary dark:text-neutral-400">
                            Publishes v{node.version + 1} of this node as a new
                            changeset — your original stays in history.
                        </Text>
                    </View>
                </>
            )}
            {node ? (
                <RemoveCameraSheet
                    isOpen={removeSheetIsOpen}
                    node={node}
                    onDismiss={handleRemoveSheetDismiss}
                    onRemoved={handleRemoved}
                />
            ) : null}
        </View>
    );
}
