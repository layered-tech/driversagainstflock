import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafChip,
    DafSectionLabel,
    DafSegmentedControl,
    DafTextInput,
} from '../design-system/primitives';
import { getDafTheme } from '../design-system/tokens';
import { CompassDial } from './compass-dial';
import { useContribute } from './contribute-state';
import { formatBearingChip } from './osm-tags';
import { ContributePageHeader } from './step-header';

const CAMERA_TYPE_OPTIONS = [
    { label: 'ALPR', value: 'alpr' },
    { label: 'CCTV', value: 'cctv' },
    { label: 'Gantry', value: 'gantry' },
];

const MANUFACTURER_OPTIONS = [
    { label: 'Flock', value: 'flock' },
    { label: 'Motorola', value: 'motorola' },
    { label: 'Other', value: 'other' },
];

const MOUNT_OPTIONS = [
    { label: 'Pole', value: 'pole' },
    { label: 'Gantry', value: 'gantry' },
    { label: 'Building', value: 'building' },
    { label: 'Traffic light', value: 'traffic_signals' },
];

function parseCameraIndexParam(indexParam) {
    const rawIndex = Array.isArray(indexParam) ? indexParam[0] : indexParam;
    const cameraIndex = Number.parseInt(rawIndex, 10);

    return Number.isInteger(cameraIndex) && cameraIndex >= 0
        ? cameraIndex
        : null;
}

export default function CameraDetailsScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const { pins, updatePinDetails, updatePinLocation } = useContribute();
    const [rawSelectedDirectionIndex, setRawSelectedDirectionIndex] =
        useState(0);
    const cameraIndex = parseCameraIndexParam(params.index);
    const pin = cameraIndex === null ? undefined : pins[cameraIndex];
    const pinId = pin?.id ?? null;
    const details = pin?.details ?? {};
    const directions = Array.isArray(details.directions)
        ? details.directions
        : [];
    const selectedDirectionIndex =
        directions.length === 0
            ? 0
            : Math.min(rawSelectedDirectionIndex, directions.length - 1);
    const selectedBearing = directions[selectedDirectionIndex] ?? 0;
    const isLastCamera = cameraIndex === pins.length - 1;
    const theme = getDafTheme(colorScheme);
    const footerPaddingBottom = Math.max(insets.bottom + 12, 28);

    useFocusEffect(
        useCallback(() => {
            if (!pin) {
                router.replace('/');
            }
        }, [pin]),
    );

    const handleBackPress = useCallback(() => {
        router.back();
    }, []);

    const handleTypeChange = useCallback(
        (type) => {
            updatePinDetails(
                pinId,
                type === 'gantry' ? { mount: 'gantry', type } : { type },
            );
        },
        [pinId, updatePinDetails],
    );

    const handleManufacturerChange = useCallback(
        (manufacturer) => {
            updatePinDetails(pinId, { manufacturer });
        },
        [pinId, updatePinDetails],
    );

    const handleOperatorChange = useCallback(
        (operator) => {
            updatePinDetails(pinId, { operator });
        },
        [pinId, updatePinDetails],
    );

    const handleLocationChange = useCallback(
        (location) => {
            updatePinLocation(pinId, location);
        },
        [pinId, updatePinLocation],
    );

    const handleDialChange = useCallback(
        (degrees) => {
            if (directions.length === 0) {
                setRawSelectedDirectionIndex(0);
                updatePinDetails(pinId, { directions: [degrees] });
                return;
            }

            updatePinDetails(pinId, {
                directions: directions.map((direction, directionIndex) =>
                    directionIndex === selectedDirectionIndex
                        ? degrees
                        : direction,
                ),
            });
        },
        [directions, pinId, selectedDirectionIndex, updatePinDetails],
    );

    const handleAddDirection = useCallback(() => {
        const currentBearing = directions[selectedDirectionIndex] ?? 0;
        const nextDirections = [...directions, (currentBearing + 180) % 360];

        setRawSelectedDirectionIndex(nextDirections.length - 1);
        updatePinDetails(pinId, { directions: nextDirections });
    }, [directions, pinId, selectedDirectionIndex, updatePinDetails]);

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
            updatePinDetails(pinId, { directions: nextDirections });
        },
        [directions, pinId, updatePinDetails],
    );

    const handleMountChange = useCallback(
        (mount) => {
            updatePinDetails(pinId, {
                mount: details.mount === mount ? null : mount,
            });
        },
        [details.mount, pinId, updatePinDetails],
    );

    const handleNextPress = useCallback(() => {
        if (isLastCamera) {
            router.push('/contribute/changeset');
            return;
        }

        router.push(`/contribute/camera/${cameraIndex + 1}`);
    }, [cameraIndex, isLastCamera]);

    if (!pin) {
        return null;
    }

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="contribute-camera-details-screen"
        >
            <ContributePageHeader
                onBack={handleBackPress}
                step={2}
                title="Camera details"
            />
            <View className="dark:border-daf-border-dark flex-row items-center gap-2 border-b border-daf-border bg-daf-surface-alt px-4 py-[9px] dark:bg-daf-surface-inverse">
                <Text className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-brand dark:text-daf-brand">
                    Camera {cameraIndex + 1} of {pins.length}
                </Text>
                <Text
                    className="font-dafMono ml-auto text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
                </Text>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
                <View className="gap-[18px] p-4">
                    <View>
                        <DafSectionLabel className="mb-2">Type</DafSectionLabel>
                        <DafSegmentedControl
                            onChange={handleTypeChange}
                            options={CAMERA_TYPE_OPTIONS}
                            testIDPrefix="contribute-type"
                            value={details.type}
                        />
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Manufacturer
                        </DafSectionLabel>
                        <DafSegmentedControl
                            onChange={handleManufacturerChange}
                            options={MANUFACTURER_OPTIONS}
                            testIDPrefix="contribute-manufacturer"
                            value={details.manufacturer}
                        />
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Operator
                        </DafSectionLabel>
                        <DafTextInput
                            onChangeText={handleOperatorChange}
                            testID="contribute-operator-input"
                            value={details.operator}
                        />
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Directions faced
                        </DafSectionLabel>
                        <CompassDial
                            directions={directions}
                            location={pin}
                            onChange={handleDialChange}
                            onLocationChange={handleLocationChange}
                            selectedDirectionIndex={selectedDirectionIndex}
                            testID="contribute-direction-dial"
                            value={selectedBearing}
                        />
                        <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
                            {directions.map((degrees, directionIndex) => {
                                const selected =
                                    directionIndex === selectedDirectionIndex;

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
                                            accessibilityState={{ selected }}
                                            className="h-full justify-center"
                                            onPress={() =>
                                                setRawSelectedDirectionIndex(
                                                    directionIndex,
                                                )
                                            }
                                            testID={`contribute-direction-chip-${directionIndex}`}
                                        >
                                            <Text
                                                className={`font-dafMono text-[13px] font-semibold ${
                                                    selected
                                                        ? 'text-daf-text-brand dark:text-daf-brand'
                                                        : 'text-daf-text-primary dark:text-white'
                                                }`}
                                            >
                                                {formatBearingChip(degrees)}
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
                                            testID={`contribute-direction-chip-${directionIndex}-remove`}
                                        >
                                            <Icon
                                                color={
                                                    selected
                                                        ? theme.text.brand
                                                        : theme.text.secondary
                                                }
                                                name="x"
                                                size={13}
                                                stroke={2.4}
                                            />
                                        </Pressable>
                                    </View>
                                );
                            })}
                            <Pressable
                                accessibilityLabel="Add direction"
                                accessibilityRole="button"
                                className="h-8 flex-row items-center gap-1.5 rounded-dafPill border border-dashed border-daf-border-strong px-3.5 active:opacity-[0.82]"
                                onPress={handleAddDirection}
                                testID="contribute-add-direction-button"
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
                        <Text className="mt-2 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                            Add a bearing for each way the camera looks — poles
                            often hold several.
                        </Text>
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Mounted on
                        </DafSectionLabel>
                        <View className="flex-row flex-wrap gap-2">
                            {MOUNT_OPTIONS.map((option) => (
                                <DafChip
                                    key={option.value}
                                    onPress={() =>
                                        handleMountChange(option.value)
                                    }
                                    selected={details.mount === option.value}
                                    testID={`contribute-mount-${option.value}`}
                                    tone="brand"
                                >
                                    {option.label}
                                </DafChip>
                            ))}
                        </View>
                    </View>
                </View>
            </ScrollView>
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-t border-daf-border bg-white px-4 pt-3"
                style={{ paddingBottom: footerPaddingBottom }}
            >
                <DafButton
                    onPress={handleNextPress}
                    size="lg"
                    testID="contribute-next-changeset-button"
                >
                    {isLastCamera ? 'Next: changeset details' : 'Next camera'}
                </DafButton>
            </View>
        </View>
    );
}
