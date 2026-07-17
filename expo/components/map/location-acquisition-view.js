import { ActivityIndicator, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { getLocationAcquisitionPresentation } from './location-acquisition-state';

const STEP_TONE_STYLES = {
    active: {
        background: 'bg-daf-azure/12 dark:bg-daf-azure/20',
        iconColor: dafSemanticColors.info,
        status: 'text-daf-azure',
    },
    complete: {
        background: 'bg-daf-brand/12 dark:bg-daf-brand/20',
        iconColor: dafSemanticColors.brand,
        status: 'text-daf-text-brand dark:text-daf-brand',
    },
    error: {
        background: 'bg-daf-alert/10 dark:bg-daf-alert/15',
        iconColor: dafSemanticColors.danger,
        status: 'text-daf-alert',
    },
    pending: {
        background: 'bg-daf-surface-alt dark:bg-daf-surface-inverse',
        iconColor: dafSemanticColors.speedOk,
        status: 'text-daf-text-tertiary dark:text-neutral-400',
    },
};

const GRAPHIC_TONE_STYLES = {
    active: {
        background: 'bg-daf-brand/12 dark:bg-daf-brand/20',
        border: 'border-daf-brand/25 dark:border-daf-brand/35',
        iconColor: dafSemanticColors.brand,
    },
    complete: {
        background: 'bg-daf-brand dark:bg-daf-brand',
        border: 'border-daf-brand dark:border-daf-brand',
        iconColor: '#0B0E12',
    },
    error: {
        background: 'bg-daf-alert/10 dark:bg-daf-alert/15',
        border: 'border-daf-alert/25 dark:border-daf-alert/35',
        iconColor: dafSemanticColors.danger,
    },
};

function LocationAcquisitionGraphic({ icon, phase, tone }) {
    const toneStyles = GRAPHIC_TONE_STYLES[tone] ?? GRAPHIC_TONE_STYLES.active;
    const isLocating = phase === 'locating';

    return (
        <View
            accessibilityLabel={
                phase === 'centering'
                    ? 'GPS position found. Centering the map.'
                    : phase === 'error'
                      ? 'GPS position not found.'
                      : 'Acquiring a precise GPS position.'
            }
            accessibilityRole={isLocating ? 'progressbar' : 'image'}
            className="relative h-[156px] w-[156px] items-center justify-center"
        >
            <View className="border-daf-brand/10 bg-daf-brand/5 dark:border-daf-brand/15 dark:bg-daf-brand/5 absolute h-[156px] w-[156px] rounded-full border" />
            <View className="border-daf-brand/15 dark:border-daf-brand/20 dark:bg-daf-surface-dark absolute h-[112px] w-[112px] rounded-full border bg-white" />
            <View
                className={`h-[68px] w-[68px] items-center justify-center rounded-full border shadow-[0px_8px_24px_rgba(11,14,18,0.14)] ${toneStyles.background} ${toneStyles.border}`}
            >
                <Icon
                    color={toneStyles.iconColor}
                    name={icon}
                    size={30}
                    stroke={2.2}
                />
            </View>

            {isLocating ? (
                <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark absolute bottom-1 h-8 w-8 items-center justify-center rounded-full border border-daf-border bg-white shadow-[0px_3px_10px_rgba(11,14,18,0.12)]">
                    <ActivityIndicator
                        color={dafSemanticColors.brand}
                        size="small"
                    />
                </View>
            ) : null}
        </View>
    );
}

function LocationProgressStep({ icon, label, status, tone }) {
    const toneStyles = STEP_TONE_STYLES[tone] ?? STEP_TONE_STYLES.pending;

    return (
        <View
            accessibilityLabel={`${label}: ${status}`}
            className="flex-row items-center gap-3 px-[14px] py-2.5"
        >
            <View
                className={`h-8 w-8 items-center justify-center rounded-full ${toneStyles.background}`}
            >
                {tone === 'active' ? (
                    <ActivityIndicator
                        color={toneStyles.iconColor}
                        size="small"
                    />
                ) : (
                    <Icon color={toneStyles.iconColor} name={icon} size={15} />
                )}
            </View>
            <Text
                className="min-w-0 flex-1 text-[15px] font-semibold text-daf-text-primary dark:text-white"
                numberOfLines={1}
            >
                {label}
            </Text>
            <Text
                className={`text-[13px] font-semibold ${toneStyles.status}`}
                numberOfLines={1}
            >
                {status}
            </Text>
        </View>
    );
}

export function LocationAcquisitionView({
    isLocating,
    locationError,
    retryCurrentLocation,
    userLocation,
}) {
    const presentation = getLocationAcquisitionPresentation({
        hasUserLocation: Boolean(userLocation),
        isLocating,
        locationError,
    });

    return (
        <View
            accessibilityLiveRegion="polite"
            className="flex-1 justify-between gap-6"
            testID={`map-location-${presentation.phase}`}
        >
            <View className="flex-1 items-center justify-center gap-6">
                <LocationAcquisitionGraphic
                    icon={presentation.graphicIcon}
                    phase={presentation.phase}
                    tone={presentation.graphicTone}
                />

                <View className="max-w-[360px] items-center gap-2.5">
                    <Text className="text-[11px] font-bold tracking-[0.12em] text-daf-text-brand dark:text-daf-brand">
                        {presentation.eyebrow}
                    </Text>
                    <Text className="font-dafDisplay text-center text-[30px] font-bold leading-[36px] text-daf-text-primary dark:text-white">
                        {presentation.title}
                    </Text>
                    <Text className="text-center text-[16px] leading-6 text-daf-text-secondary dark:text-neutral-300">
                        {presentation.description}
                    </Text>
                </View>
            </View>

            <View className="w-full gap-4">
                <View
                    className="dark:border-daf-border-dark overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-page dark:bg-daf-surface-inverse"
                    testID="map-location-progress"
                >
                    {presentation.steps.map((step, index) => (
                        <View key={step.label}>
                            {index ? (
                                <View className="dark:bg-daf-border-dark ml-[58px] h-px bg-daf-border" />
                            ) : null}
                            <LocationProgressStep {...step} />
                        </View>
                    ))}
                </View>

                {presentation.showRetry ? (
                    <DafButton
                        accessibilityLabel="Try finding your location again"
                        icon="locate-fixed"
                        onPress={retryCurrentLocation}
                        size="lg"
                        testID="map-location-retry"
                        variant="secondary"
                    >
                        Try again
                    </DafButton>
                ) : null}

                <Text className="text-center text-xs font-semibold text-daf-text-tertiary dark:text-neutral-500">
                    We never sell or share your location.
                </Text>
            </View>
        </View>
    );
}
