import {
    ActivityIndicator,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Icon } from './icon';
import { dafColors, dafSemanticColors } from './tokens';

const TONE_COLORS = {
    alert: {
        background: 'bg-daf-alert/10 dark:bg-daf-alert/15',
        border: 'border-daf-alert/30',
        icon: dafSemanticColors.danger,
        text: 'text-daf-alert',
    },
    amber: {
        background: 'bg-daf-amber/12 dark:bg-daf-amber/15',
        border: 'border-daf-amber/35',
        icon: dafSemanticColors.warning,
        text: 'text-amber-700 dark:text-daf-amber',
    },
    azure: {
        background: 'bg-daf-azure/12 dark:bg-daf-azure/15',
        border: 'border-daf-azure/35',
        icon: dafSemanticColors.routeFast,
        text: 'text-daf-azure',
    },
    brand: {
        background: 'bg-daf-brand/12 dark:bg-daf-brand/15',
        border: 'border-daf-brand/35',
        icon: dafSemanticColors.brand,
        text: 'text-daf-text-brand dark:text-daf-brand',
    },
    neutral: {
        background: 'bg-daf-surface-alt dark:bg-daf-surface-dark',
        border: 'border-daf-border dark:border-daf-border-dark',
        icon: dafSemanticColors.speedOk,
        text: 'text-daf-text-secondary dark:text-neutral-200',
    },
    violet: {
        background: 'bg-daf-violet/12 dark:bg-daf-violet/15',
        border: 'border-daf-violet/35',
        icon: dafSemanticColors.markerDestination,
        text: 'text-daf-violet',
    },
};

export function DafBadge({ children, className = '', icon, tone = 'neutral' }) {
    const colors = TONE_COLORS[tone] ?? TONE_COLORS.neutral;

    return (
        <View
            className={`h-6 flex-row items-center gap-1.5 rounded-dafPill border px-2.5 ${colors.background} ${colors.border} ${className}`}
        >
            {icon ? <Icon color={colors.icon} name={icon} size={13} /> : null}
            <Text
                className={`text-xs font-semibold ${colors.text}`}
                numberOfLines={1}
            >
                {children}
            </Text>
        </View>
    );
}

export function DafButton({
    accessibilityLabel,
    children,
    className = '',
    disabled = false,
    icon,
    loading = false,
    onPress,
    size = 'md',
    testID,
    variant = 'primary',
}) {
    const variantClassNames = {
        primary:
            'border border-transparent bg-daf-brand active:bg-daf-brand-press',
        secondary:
            'border border-daf-border-glass bg-white/95 active:bg-daf-surface-alt dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 dark:active:bg-daf-surface-inverse',
        ghost: 'border border-transparent bg-transparent active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse',
        danger: 'border border-transparent bg-daf-alert active:bg-daf-alert/85',
    };
    const textClassNames = {
        primary: 'text-daf-brand-contrast',
        secondary: 'text-daf-text-primary dark:text-white',
        ghost: 'text-daf-text-primary dark:text-white',
        danger: 'text-white',
    };
    const sizeClassNames = {
        md: 'min-h-hitComfy px-[18px]',
        lg: 'min-h-hitLarge px-6',
    };
    const textSizeClassNames = {
        md: 'text-[15px]',
        lg: 'text-[17px]',
    };
    const resolvedVariant = variantClassNames[variant] ? variant : 'primary';
    const iconColor =
        resolvedVariant === 'primary'
            ? dafSemanticColors.brandContrast
            : resolvedVariant === 'danger'
              ? '#ffffff'
              : dafSemanticColors.brand;

    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: loading, disabled }}
            className={`${sizeClassNames[size] ?? sizeClassNames.md} flex-row items-center justify-center gap-2 rounded-dafPill disabled:opacity-55 ${variantClassNames[resolvedVariant]} ${className}`}
            disabled={disabled}
            onPress={onPress}
            testID={testID}
        >
            {loading ? (
                <ActivityIndicator
                    color={iconColor ?? dafSemanticColors.brand}
                />
            ) : icon ? (
                <Icon color={iconColor} name={icon} size={17} stroke={2.4} />
            ) : null}
            <Text
                className={`${textSizeClassNames[size] ?? textSizeClassNames.md} font-semibold ${textClassNames[resolvedVariant]}`}
                numberOfLines={1}
            >
                {children}
            </Text>
        </Pressable>
    );
}

export function DafIconButton({
    accessibilityHint,
    accessibilityLabel,
    className = '',
    color,
    disabled = false,
    icon,
    onPress,
    selected = false,
    size = 'md',
    testID,
    tone = 'neutral',
}) {
    const colors = TONE_COLORS[tone] ?? TONE_COLORS.neutral;
    const dimensionClassName =
        size === 'sm' ? 'h-[38px] w-[38px]' : 'h-hitComfy w-hitComfy';
    const radiusClassName =
        size === 'sm' ? 'rounded-[19px]' : 'rounded-dafPill';
    const selectedClassName = selected
        ? `${colors.background} ${colors.border}`
        : 'border-daf-border bg-white/90 dark:border-daf-border-dark dark:bg-daf-surface-dark';

    return (
        <Pressable
            accessibilityHint={accessibilityHint}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            className={`${dimensionClassName} ${radiusClassName} items-center justify-center border active:opacity-[0.82] disabled:opacity-55 ${selectedClassName} ${className}`}
            disabled={disabled}
            hitSlop={6}
            onPress={onPress}
            testID={testID}
        >
            <Icon
                color={color ?? colors.icon}
                name={icon}
                size={size === 'sm' ? 15 : 20}
            />
        </Pressable>
    );
}

export function DafChip({
    children,
    className = '',
    icon,
    onPress,
    selected = false,
    testID,
    tone = 'neutral',
}) {
    const colors = TONE_COLORS[tone] ?? TONE_COLORS.neutral;
    const Component = onPress ? Pressable : View;
    const selectedClassName = `${colors.background} ${colors.border}`;
    const unselectedClassName =
        tone === 'glass'
            ? 'border-daf-border-glass bg-white/80 dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/80'
            : 'border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark';
    const pressableProps = onPress
        ? {
              accessibilityRole: 'button',
              accessibilityState: { selected },
              onPress,
          }
        : {};

    return (
        <Component
            className={`h-[34px] flex-row items-center gap-1.5 rounded-dafPill border px-3 ${selected ? selectedClassName : unselectedClassName} ${className}`}
            testID={testID}
            {...pressableProps}
        >
            {icon ? <Icon color={colors.icon} name={icon} size={14} /> : null}
            <Text
                className={`text-[13px] font-semibold ${selected ? colors.text : 'text-daf-text-primary dark:text-white'}`}
                numberOfLines={1}
            >
                {children}
            </Text>
        </Component>
    );
}

export function DafSectionLabel({ children, className = '' }) {
    return (
        <Text
            className={`text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400 ${className}`}
        >
            {children}
        </Text>
    );
}

export function DafSegmentedControl({
    className = '',
    onChange,
    options,
    testID,
    testIDPrefix,
    value,
}) {
    return (
        <View
            className={`dark:border-daf-border-dark h-[42px] flex-row rounded-dafPill border border-daf-border bg-daf-surface-alt p-1 dark:bg-daf-surface-inverse ${className}`}
            testID={testID}
        >
            {options.map((option) => {
                const selected = option.value === value;

                return (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={`min-h-[34px] flex-1 items-center justify-center rounded-dafPill px-2 ${
                            selected
                                ? 'dark:bg-daf-surface-dark bg-white'
                                : 'bg-transparent'
                        }`}
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        testID={
                            testIDPrefix
                                ? `${testIDPrefix}-${option.value}`
                                : undefined
                        }
                    >
                        <Text
                            className={`text-[13px] font-semibold ${
                                selected
                                    ? 'text-daf-text-primary dark:text-white'
                                    : 'text-daf-text-secondary dark:text-neutral-300'
                            }`}
                            numberOfLines={1}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function DafTextInput({
    className = '',
    multiline = false,
    onChangeText,
    placeholder,
    testID,
    value,
    ...rest
}) {
    const sizeClassName = multiline ? 'min-h-[84px] pt-3' : 'h-hitComfy';

    return (
        <TextInput
            className={`${sizeClassName} dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafSm border border-daf-border bg-white px-[14px] text-[15px] text-daf-text-primary dark:text-white ${className}`}
            multiline={multiline}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={dafColors.ink[400]}
            testID={testID}
            textAlignVertical={multiline ? 'top' : undefined}
            value={value}
            {...rest}
        />
    );
}
