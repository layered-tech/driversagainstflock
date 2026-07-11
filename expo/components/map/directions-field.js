import { Pressable, TextInput, View } from 'react-native';
import { Icon } from '../design-system/icon';

export function DirectionsField({
    active,
    accessibilityValueLabel,
    clearAccessibilityLabel,
    clearTestID,
    inputRef,
    label,
    onChangeText,
    onClear,
    onRemove,
    onFocus,
    placeholder,
    removeAccessibilityLabel,
    removeTestID,
    searchPlaceholderColor,
    testID,
    value,
}) {
    return (
        <View
            className={`h-11 justify-center rounded-dafSm border px-[14px] ${
                active
                    ? 'bg-daf-brand/10 dark:bg-daf-brand/15 border-daf-brand dark:border-daf-brand'
                    : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
            }`}
        >
            <View className="min-w-0 flex-row items-center gap-2">
                <TextInput
                    ref={inputRef}
                    accessibilityLabel={[
                        `${label} location`,
                        accessibilityValueLabel,
                    ]
                        .filter(Boolean)
                        .join(': ')}
                    className="min-w-0 flex-1 p-0 text-[15px] font-medium leading-5 text-daf-text-primary dark:text-white"
                    multiline={false}
                    numberOfLines={1}
                    onChangeText={onChangeText}
                    onFocus={onFocus}
                    placeholder={placeholder}
                    placeholderTextColor={searchPlaceholderColor}
                    returnKeyType="search"
                    style={{
                        height: 30,
                        includeFontPadding: false,
                        paddingBottom: 0,
                        paddingLeft: 0,
                        paddingRight: 0,
                        paddingTop: 0,
                        textAlignVertical: 'center',
                    }}
                    testID={testID}
                    value={value}
                />
                {value ? (
                    <Pressable
                        accessibilityLabel={clearAccessibilityLabel}
                        accessibilityRole="button"
                        className="h-8 w-8 shrink-0 items-center justify-center rounded-dafXs active:bg-neutral-200 dark:active:bg-neutral-800"
                        hitSlop={6}
                        onPress={onClear}
                        testID={clearTestID}
                    >
                        <Icon
                            color={searchPlaceholderColor}
                            name="x"
                            size={14}
                        />
                    </Pressable>
                ) : null}
                {onRemove ? (
                    <Pressable
                        accessibilityLabel={removeAccessibilityLabel}
                        accessibilityRole="button"
                        className="h-8 w-8 shrink-0 items-center justify-center rounded-dafXs active:bg-red-100 dark:active:bg-red-950/40"
                        hitSlop={6}
                        onPress={onRemove}
                        testID={removeTestID}
                    >
                        <Icon color="#FF4D4F" name="trash" size={14} />
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}
