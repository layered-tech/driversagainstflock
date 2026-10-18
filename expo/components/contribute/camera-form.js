import { CAMERA_REFERENCE_IMAGES } from './camera-reference-images';
import { useRef, useState } from 'react';
import {
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import {
    CAMERA_IDENTITY_TAG_KEYS,
    CAMERA_MANUFACTURERS,
} from '../../lib/osm/camera-manufacturers';
import { CAMERA_MOUNT_OPTIONS } from '../../lib/osm/camera-schema';
import {
    CAMERA_PRESETS,
    getCameraFormTags,
    getPresetTags,
    rowsToTags,
    tagsToRows,
    validateCameraTagRows,
} from '../../lib/osm/camera-presets';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafChip,
    DafSectionLabel,
    DafTextInput,
} from '../design-system/primitives';
import { getDafTheme } from '../design-system/tokens';
import { CompassDial } from './compass-dial';
import { ContributePageHeader } from './step-header';
import { ContributeTourTarget } from './contribute-tour-target';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { formatBearingChip } from './osm-tags';

const PRESET_IMAGES = {
    flock: require('../../assets/camera-presets/flock.jpg'),
    motorola: require('../../assets/camera-presets/motorola.jpg'),
    genetec: require('../../assets/camera-presets/genetec.webp'),
    axon: require('../../assets/camera-presets/axon.webp'),
    leonardo: require('../../assets/camera-presets/leonardo.jpg'),
    neology: require('../../assets/camera-presets/neology.jpg'),
    verkada: require('../../assets/camera-presets/verkada.png'),
};
const COMMON_KEYS = ['surveillance:zone', 'camera:type', 'ref', 'start_date'];

function FieldLabel({ children, tag }) {
    return (
        <View className="mb-2 flex-row items-center justify-between gap-2">
            <DafSectionLabel>{children}</DafSectionLabel>
            {tag ? (
                <Text className="rounded-dafXs border border-daf-border px-1.5 py-px font-dafMono text-[10.5px] text-daf-text-tertiary dark:border-daf-border-dark dark:text-neutral-400">
                    {tag}
                </Text>
            ) : null}
        </View>
    );
}

function TagRows({ rows, onChange, testIDPrefix }) {
    const theme = getDafTheme(useColorScheme());
    return (
        <View className="gap-2">
            {rows.map((row, index) => (
                <View className="flex-row items-center gap-2" key={index}>
                    <DafTextInput
                        className="min-w-0 flex-1 font-dafMono text-xs"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="key"
                        value={row.key}
                        onChangeText={(key) =>
                            onChange(
                                rows.map((item, i) =>
                                    i === index ? { ...item, key } : item,
                                ),
                            )
                        }
                        testID={`${testIDPrefix}-key-${index}`}
                    />
                    <Text className="font-dafMono text-xs text-daf-text-tertiary">
                        =
                    </Text>
                    <DafTextInput
                        className="min-w-0 flex-1 font-dafMono text-xs"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="value"
                        value={row.value}
                        onChangeText={(value) =>
                            onChange(
                                rows.map((item, i) =>
                                    i === index ? { ...item, value } : item,
                                ),
                            )
                        }
                        testID={`${testIDPrefix}-value-${index}`}
                    />
                    <Pressable
                        accessibilityLabel={`Remove tag ${row.key || index + 1}`}
                        className="h-10 w-7 items-center justify-center"
                        onPress={() =>
                            onChange(rows.filter((_, i) => i !== index))
                        }
                        testID={`${testIDPrefix}-remove-${index}`}
                    >
                        <Icon name="x" size={16} color={theme.text.tertiary} />
                    </Pressable>
                </View>
            ))}
            <DafButton
                icon="plus"
                variant="secondary"
                onPress={() => onChange([...rows, { key: '', value: '' }])}
                testID={`${testIDPrefix}-add`}
            >
                Add tag
            </DafButton>
        </View>
    );
}

export function CameraForm({
    pin,
    onBack,
    onSave,
    onDetailsChange,
    onLocationChange,
    tour,
    screenIsFocused = true,
    error,
    saving = false,
}) {
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(useColorScheme());
    const targets = useRef({});
    const scrollRef = useRef(null);
    const contentRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [referenceGalleryWidth, setReferenceGalleryWidth] = useState(0);
    const [selectedDirection, setSelectedDirection] = useState(0);
    const holdWasPreviewed = useRef(false);
    const details = pin.details;
    const preset = details.preset ?? details.manufacturer ?? 'flock';
    const custom = preset === 'custom';
    const rawTags = details.rawTags ?? [];
    const extraTags = details.extraTags ?? [];
    const directions = details.directions ?? [];
    const tags = getCameraFormTags({ ...details, preset });
    const rowError =
        validateCameraTagRows(custom ? rawTags : extraTags) ??
        (!custom &&
        extraTags.some(({ key }) =>
            CAMERA_IDENTITY_TAG_KEYS.includes(key.trim()),
        )
            ? 'Manufacturer tags follow the preset. Use Custom tags to edit them directly.'
            : null);
    const validationError =
        rowError ??
        (tags.man_made !== 'surveillance'
            ? 'Keep man_made=surveillance so this remains a camera.'
            : null);
    const directionIndex = Math.min(
        selectedDirection,
        Math.max(directions.length - 1, 0),
    );
    const selectedBearing = directions[directionIndex] ?? 0;
    const setDirections = (next) => {
        const patch = { directions: next };
        if (custom) {
            const nextTags = { ...rowsToTags(rawTags) };
            delete nextTags.direction;
            if (next.length) nextTags['camera:direction'] = next.join(';');
            else delete nextTags['camera:direction'];
            patch.rawTags = tagsToRows(nextTags);
        }
        onDetailsChange(patch);
    };
    const updateRawTags = (rows) => {
        const direction = rowsToTags(rows)['camera:direction'];
        const next =
            direction
                ?.split(';')
                .filter(
                    (value) => value.trim() && Number.isFinite(Number(value)),
                )
                .map(Number) ?? [];
        onDetailsChange({ rawTags: rows, directions: next });
    };
    const choosePreset = (value) => {
        if (value === 'custom')
            onDetailsChange({ preset: value, rawTags: tagsToRows(tags) });
        else
            onDetailsChange({
                preset: value,
                manufacturer: value,
                extraTags: tagsToRows(
                    Object.fromEntries(
                        Object.entries(tags).filter(
                            ([key]) =>
                                !CAMERA_IDENTITY_TAG_KEYS.includes(key) &&
                                !Object.hasOwn(getPresetTags('generic'), key) &&
                                ![
                                    'operator',
                                    'direction',
                                    'camera:direction',
                                    'camera:mount',
                                ].includes(key),
                        ),
                    ),
                ),
            });
    };
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="contribute-camera-details-screen"
        >
            <View
                className="flex-1"
                style={
                    preview &&
                    Platform.OS === 'android' &&
                    Number(Platform.Version) >= 31
                        ? { filter: [{ blur: 6 }] }
                        : undefined
                }
            >
                <ContributePageHeader
                    onBack={onBack}
                    title={pin.nodeId ? 'Edit camera' : 'Add camera'}
                    badge={
                        pin.nodeId
                            ? `v${pin.version} → v${pin.version + 1}`
                            : 'new node'
                    }
                />
                <View className="flex-row items-center gap-2 border-b border-daf-border bg-daf-surface-alt px-4 py-[9px] dark:border-daf-border-dark dark:bg-daf-surface-inverse">
                    <Text className="font-dafMono text-[11px] text-daf-text-brand dark:text-daf-brand">
                        {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
                    </Text>
                    {pin.nodeId ? (
                        <Text className="ml-auto font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                            node/{pin.nodeId}
                        </Text>
                    ) : null}
                </View>
                <ScrollView
                    className="flex-1"
                    ref={scrollRef}
                    keyboardShouldPersistTaps="handled"
                >
                    <View
                        className="gap-[18px] p-4"
                        ref={contentRef}
                        collapsable={false}
                    >
                        <ContributeTourTarget
                            id="camera-details"
                            targets={targets}
                        >
                            <ContributeTourTarget
                                id="manufacturer"
                                targets={targets}
                            >
                                <FieldLabel>Preset</FieldLabel>
                                <View
                                    className="flex-row flex-wrap gap-2"
                                    testID="contribute-preset-grid"
                                >
                                    {CAMERA_PRESETS.map((item) => (
                                        <Pressable
                                            key={item.value}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${item.label} preset`}
                                            accessibilityState={{
                                                selected: preset === item.value,
                                            }}
                                            className={`w-[31.8%] overflow-hidden rounded-dafSm border ${preset === item.value ? 'border-daf-brand bg-white dark:bg-daf-surface-dark' : 'border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark'}`}
                                            onPressIn={() => {
                                                holdWasPreviewed.current = false;
                                            }}
                                            onLongPress={() => {
                                                if (PRESET_IMAGES[item.value]) {
                                                    holdWasPreviewed.current = true;
                                                    setPreview(item);
                                                }
                                            }}
                                            onPress={() => {
                                                if (!holdWasPreviewed.current)
                                                    choosePreset(item.value);
                                            }}
                                            delayLongPress={250}
                                            testID={`contribute-preset-${item.value}`}
                                        >
                                            {PRESET_IMAGES[item.value] ? (
                                                <View className="aspect-[4/3] w-full bg-daf-surface-alt">
                                                    <Image
                                                        source={
                                                            PRESET_IMAGES[
                                                                item.value
                                                            ]
                                                        }
                                                        className="h-full w-full"
                                                        resizeMode="cover"
                                                        accessibilityLabel={`${item.label} ${item.model} camera on a pole`}
                                                    />
                                                </View>
                                            ) : (
                                                <View className="aspect-[4/3] w-full items-center justify-center bg-daf-surface-alt dark:bg-daf-surface-inverse">
                                                    <Icon
                                                        name={
                                                            item.value ===
                                                            'custom'
                                                                ? 'tag'
                                                                : 'camera'
                                                        }
                                                        size={24}
                                                        color={
                                                            theme.text.tertiary
                                                        }
                                                    />
                                                </View>
                                            )}
                                            {preset === item.value ? (
                                                <View className="absolute right-[5px] top-[5px] h-[18px] w-[18px] items-center justify-center rounded-full bg-daf-brand">
                                                    <Icon
                                                        name="check"
                                                        size={11}
                                                        color="#fff"
                                                    />
                                                </View>
                                            ) : null}
                                            <View className="px-2 pb-[7px] pt-1.5">
                                                <Text className="text-[12px] font-semibold leading-[15px] text-daf-text-primary dark:text-white">
                                                    {item.label}
                                                </Text>
                                                <Text className="mt-0.5 text-[10.5px] leading-[13px] text-daf-text-tertiary dark:text-neutral-400">
                                                    {item.model}
                                                    {item.value === 'custom'
                                                        ? ''
                                                        : ' · ALPR'}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                                <Text className="mt-2 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                    Pick the make you see on the pole. Press and
                                    hold a photo to see it larger.
                                </Text>
                            </ContributeTourTarget>
                        </ContributeTourTarget>
                        {custom ? (
                            <View>
                                <FieldLabel
                                    tag={`${Object.keys(tags).length} set`}
                                >
                                    Tags
                                </FieldLabel>
                                <TagRows
                                    rows={rawTags}
                                    onChange={updateRawTags}
                                    testIDPrefix="contribute-raw-tag"
                                />
                                <Text className="mb-2 mt-3 text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                    Common keys
                                </Text>
                                <View className="flex-row flex-wrap gap-1.5">
                                    {COMMON_KEYS.map((key) => (
                                        <DafChip
                                            key={key}
                                            onPress={() =>
                                                updateRawTags([
                                                    ...rawTags.filter(
                                                        (row) =>
                                                            row.key !== key ||
                                                            row.value,
                                                    ),
                                                    ...(rawTags.some(
                                                        (row) =>
                                                            row.key === key,
                                                    )
                                                        ? []
                                                        : [{ key, value: '' }]),
                                                ])
                                            }
                                        >
                                            {key}
                                        </DafChip>
                                    ))}
                                </View>
                                <Text className="mt-2 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                    Written to OpenStreetMap exactly as typed.
                                    Keep man_made=surveillance — it's what makes
                                    this a camera.
                                </Text>
                            </View>
                        ) : (
                            <>
                                <View
                                    className="rounded-dafSm border border-daf-border bg-white p-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                                    testID="contribute-preset-tags"
                                >
                                    {Object.entries(getPresetTags(preset)).map(
                                        ([key, value]) => (
                                            <View
                                                key={key}
                                                className="flex-row justify-between gap-2 py-0.5"
                                            >
                                                <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                                    {key}
                                                </Text>
                                                <Text className="font-dafMono text-[11px] text-daf-text-secondary dark:text-neutral-300">
                                                    {value}
                                                </Text>
                                            </View>
                                        ),
                                    )}
                                    <Text className="mt-2 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                        Standard OSM tagging for a{' '}
                                        {CAMERA_PRESETS.find(
                                            (item) => item.value === preset,
                                        )?.label ?? 'generic'}{' '}
                                        reader, written as-is. The fields below
                                        add to it; pick Custom tags to write
                                        everything by hand.
                                    </Text>
                                </View>
                                <ContributeTourTarget
                                    id="operator"
                                    targets={targets}
                                >
                                    <FieldLabel tag="operator">
                                        Operator
                                    </FieldLabel>
                                    <DafTextInput
                                        value={details.operator ?? ''}
                                        onChangeText={(operator) =>
                                            onDetailsChange({ operator })
                                        }
                                        placeholder="Who runs this camera?"
                                        testID="contribute-operator-input"
                                    />
                                </ContributeTourTarget>
                            </>
                        )}
                        <ContributeTourTarget id="directions" targets={targets}>
                            <FieldLabel tag="camera:direction">
                                Directions faced
                            </FieldLabel>
                            <CompassDial
                                directions={directions}
                                location={pin}
                                selectedDirectionIndex={directionIndex}
                                testID="contribute-direction-dial"
                                onChange={(bearing) =>
                                    setDirections(
                                        directions.length
                                            ? directions.map((value, index) =>
                                                  index === directionIndex
                                                      ? bearing
                                                      : value,
                                              )
                                            : [bearing],
                                    )
                                }
                                onLocationChange={onLocationChange}
                                value={selectedBearing}
                            />
                            <View className="mt-2 flex-row flex-wrap gap-2">
                                {directions.map((bearing, index) => (
                                    <View
                                        key={index}
                                        className="flex-row items-center rounded-full border border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark"
                                    >
                                        <DafChip
                                            className="border-0 pr-1"
                                            selected={index === directionIndex}
                                            onPress={() =>
                                                setSelectedDirection(index)
                                            }
                                            tone="brand"
                                            testID={`contribute-direction-${index}`}
                                        >
                                            {formatBearingChip(bearing)}
                                        </DafChip>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="Remove direction"
                                            className="h-[34px] w-7 items-center justify-center"
                                            onPress={() =>
                                                setDirections(
                                                    directions.filter(
                                                        (_, i) => i !== index,
                                                    ),
                                                )
                                            }
                                            testID={`contribute-remove-direction-${index}`}
                                        >
                                            <Icon
                                                name="x"
                                                size={14}
                                                color={theme.text.tertiary}
                                            />
                                        </Pressable>
                                    </View>
                                ))}
                                <DafChip
                                    onPress={() => {
                                        setSelectedDirection(directions.length);
                                        setDirections([
                                            ...directions,
                                            (selectedBearing + 180) % 360,
                                        ]);
                                    }}
                                    testID="contribute-add-direction"
                                >
                                    + Add direction
                                </DafChip>
                            </View>
                            <Text className="mt-2.5 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                {custom
                                    ? 'The dial writes camera:direction above — drag it or type the bearing, whichever is quicker.'
                                    : 'Drag the ring until the cone covers what the camera sees — poles often hold several directions. Slide the imagery to fine-tune where the pole sits.'}
                            </Text>
                        </ContributeTourTarget>
                        {!custom ? (
                            <>
                                <ContributeTourTarget
                                    id="mount"
                                    targets={targets}
                                >
                                    <FieldLabel tag="camera:mount">
                                        Mounted on
                                    </FieldLabel>
                                    <View className="flex-row flex-wrap gap-2">
                                        {CAMERA_MOUNT_OPTIONS.map((option) => (
                                            <DafChip
                                                key={option.value}
                                                selected={
                                                    details.mount ===
                                                    option.value
                                                }
                                                onPress={() =>
                                                    onDetailsChange({
                                                        mount:
                                                            details.mount ===
                                                            option.value
                                                                ? null
                                                                : option.value,
                                                    })
                                                }
                                                tone="brand"
                                                testID={`contribute-mount-${option.value}`}
                                            >
                                                {option.label}
                                            </DafChip>
                                        ))}
                                    </View>
                                </ContributeTourTarget>
                                <View>
                                    <FieldLabel tag="optional">
                                        More tags
                                    </FieldLabel>
                                    <TagRows
                                        rows={extraTags}
                                        onChange={(rows) =>
                                            onDetailsChange({ extraTags: rows })
                                        }
                                        testIDPrefix="contribute-extra-tag"
                                    />
                                </View>
                            </>
                        ) : null}
                    </View>
                </ScrollView>
                <View
                    className="gap-2 border-t border-daf-border bg-white px-4 pt-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                    style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
                >
                    {error || validationError ? (
                        <Text
                            className="text-xs text-daf-alert"
                            testID="contribute-tag-error"
                        >
                            {error || validationError}
                        </Text>
                    ) : null}
                    <DafButton
                        icon={pin.nodeId ? undefined : 'plus'}
                        size="lg"
                        loading={saving}
                        disabled={Boolean(validationError)}
                        onPress={onSave}
                        testID="contribute-next-changeset-button"
                    >
                        {pin.nodeId ? 'Save to changeset' : 'Add to changeset'}
                    </DafButton>
                    <Text className="text-center text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                        Staged on your phone — nothing publishes until you
                        review.
                    </Text>
                </View>
            </View>
            {tour ? (
                <ContributeTourOverlay
                    enabled={screenIsFocused && !preview}
                    insets={insets}
                    phase="camera"
                    targets={targets}
                    tour={tour}
                    scrollRef={scrollRef}
                    contentRef={contentRef}
                />
            ) : null}
            <Modal
                visible={Boolean(preview)}
                transparent
                animationType="fade"
                onRequestClose={() => setPreview(null)}
                testID="contribute-brand-preview-modal"
            >
                {preview ? (
                    <View
                        className="flex-1 items-center justify-center bg-[rgba(11,14,18,0.62)] px-6"
                        testID="contribute-preset-preview"
                    >
                        <View className="max-h-[85%] w-full overflow-hidden rounded-dafLg bg-white dark:bg-daf-surface-dark">
                            <View className="flex-row items-center justify-between gap-2 px-4 py-2">
                                <Text className="flex-1 font-dafDisplay text-lg font-bold text-daf-text-primary dark:text-white">
                                    {preview.label} {preview.model}
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Close brand preview"
                                    className="h-11 w-11 items-center justify-center rounded-full bg-daf-surface-alt dark:bg-daf-surface-inverse"
                                    onPress={() => setPreview(null)}
                                    testID="contribute-brand-preview-close"
                                >
                                    <Icon
                                        name="x"
                                        size={22}
                                        color={theme.text.tertiary}
                                    />
                                </Pressable>
                            </View>
                            <ScrollView
                                className="flex-shrink"
                                testID="contribute-reference-gallery"
                                onLayout={({ nativeEvent }) => {
                                    const width = nativeEvent.layout.width;
                                    if (Number.isFinite(width) && width > 0)
                                        setReferenceGalleryWidth(width);
                                }}
                            >
                                <Text className="px-4 pb-3 text-sm leading-5 text-daf-text-secondary dark:text-neutral-300">
                                    {preview.description}
                                </Text>
                                {(
                                    CAMERA_MANUFACTURERS.find(
                                        ({ value }) => value === preview.value,
                                    )?.referenceImages ?? []
                                ).map((reference, index) => {
                                    const source =
                                        CAMERA_REFERENCE_IMAGES[reference];
                                    const dimensions =
                                        Image.resolveAssetSource(source);
                                    const aspectRatio =
                                        dimensions.width / dimensions.height;
                                    return (
                                        <Image
                                            key={reference}
                                            source={source}
                                            className="mb-3"
                                            style={{
                                                width: referenceGalleryWidth,
                                                height:
                                                    referenceGalleryWidth /
                                                    aspectRatio,
                                            }}
                                            resizeMode="contain"
                                            accessibilityLabel={`${preview.label} reference photo ${index + 1}`}
                                        />
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                ) : null}
            </Modal>
        </View>
    );
}
