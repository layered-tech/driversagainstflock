import { ActivityIndicator, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { getContributeAuthProgressPresentation } from './contribute-auth-progress-state';

const STEP_TONE_STYLES = {
    active: {
        background: 'bg-daf-azure/12 dark:bg-daf-azure/20',
        iconColor: dafSemanticColors.info,
        status: 'text-[#1F6FE0] dark:text-daf-azure',
    },
    complete: {
        background: 'bg-daf-brand/12 dark:bg-daf-brand/20',
        iconColor: dafSemanticColors.brand,
        status: 'text-daf-text-brand dark:text-daf-brand',
    },
    pending: {
        background: 'bg-daf-surface-alt dark:bg-daf-surface-inverse',
        iconColor: dafSemanticColors.speedOk,
        status: 'text-daf-text-secondary dark:text-neutral-400',
    },
};

function ContributeAuthGraphic({ accessibilityLabel, icon, tone }) {
    const isComplete = tone === 'complete';

    return (
        <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole={isComplete ? 'image' : 'progressbar'}
            className="relative h-28 w-28 items-center justify-center"
        >
            <View className="border-daf-brand/10 bg-daf-brand/5 dark:border-daf-brand/15 dark:bg-daf-brand/5 absolute h-28 w-28 rounded-full border" />
            <View className="border-daf-brand/15 dark:border-daf-brand/20 dark:bg-daf-surface-dark absolute h-20 w-20 rounded-full border bg-white" />
            <View
                className={`h-14 w-14 items-center justify-center rounded-full border ${
                    isComplete
                        ? 'border-daf-brand bg-daf-brand'
                        : 'border-daf-brand/25 bg-daf-brand/12 dark:border-daf-brand/35 dark:bg-daf-brand/20'
                }`}
            >
                <Icon
                    color={
                        isComplete
                            ? dafSemanticColors.brandContrast
                            : dafSemanticColors.brand
                    }
                    name={icon}
                    size={26}
                    stroke={2.2}
                />
            </View>
            {!isComplete ? (
                <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark absolute bottom-0 h-8 w-8 items-center justify-center rounded-full border border-daf-border bg-white">
                    <ActivityIndicator
                        color={dafSemanticColors.brand}
                        size="small"
                    />
                </View>
            ) : null}
        </View>
    );
}

function ContributeAuthProgressStep({ icon, label, status, tone }) {
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
            <Text className="min-w-0 flex-1 text-[15px] font-semibold text-daf-text-primary dark:text-white">
                {label}
            </Text>
            <Text
                className={`max-w-[42%] text-right text-[13px] font-semibold ${toneStyles.status}`}
            >
                {status}
            </Text>
        </View>
    );
}

export function ContributeAuthProgress({
    hasUser,
    hasWriteScope,
    isAuthenticated,
    isLoading,
    isSigningIn,
}) {
    const presentation = getContributeAuthProgressPresentation({
        hasUser,
        hasWriteScope,
        isAuthenticated,
        isLoading,
        isSigningIn,
    });

    if (!presentation) {
        return null;
    }

    return (
        <View
            accessibilityLiveRegion="polite"
            className="items-center gap-5 py-2"
            testID={`contribute-auth-progress-${presentation.mode}`}
        >
            <ContributeAuthGraphic
                accessibilityLabel={presentation.graphicAccessibilityLabel}
                icon={presentation.graphicIcon}
                tone={presentation.graphicTone}
            />

            <View className="max-w-[360px] items-center gap-2">
                <Text className="text-[11px] font-bold tracking-[0.12em] text-daf-text-brand dark:text-daf-brand">
                    {presentation.eyebrow}
                </Text>
                <Text className="font-dafDisplay text-center text-[26px] font-bold leading-8 text-daf-text-primary dark:text-white">
                    {presentation.title}
                </Text>
                <Text className="text-center text-[15px] leading-[22px] text-daf-text-secondary dark:text-neutral-300">
                    {presentation.description}
                </Text>
            </View>

            <View
                className="dark:border-daf-border-dark w-full overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-page dark:bg-daf-surface-inverse"
                testID="contribute-auth-progress-steps"
            >
                {presentation.steps.map((step, index) => (
                    <View key={step.label}>
                        {index ? (
                            <View className="dark:bg-daf-border-dark ml-[58px] h-px bg-daf-border" />
                        ) : null}
                        <ContributeAuthProgressStep {...step} />
                    </View>
                ))}
            </View>

            <Text className="text-center text-xs font-semibold text-daf-text-secondary dark:text-neutral-400">
                You can disconnect your account at any time.
            </Text>
        </View>
    );
}
