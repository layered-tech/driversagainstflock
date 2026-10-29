import {
    NativeModalContent,
    NativeNavigationAction,
} from '../root/native-navigation';
import { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton, DafTextInput } from '../design-system/primitives';

function formatInputValue(value) {
    return Number.isFinite(value) ? String(value) : '';
}

export function ScorecardFuelSettingsModal({
    fuelEconomyMpg,
    gasPricePerGallon,
    onDismiss,
    onReset,
    onSave,
    suggestedGasPricePerGallon,
    visible,
}) {
    const insets = useSafeAreaInsets();
    const [mpgInput, setMpgInput] = useState('');
    const [gasPriceInput, setGasPriceInput] = useState('');
    const [validationError, setValidationError] = useState(null);

    useEffect(() => {
        if (!visible) {
            return;
        }

        setMpgInput(formatInputValue(fuelEconomyMpg));
        setGasPriceInput(
            formatInputValue(gasPricePerGallon ?? suggestedGasPricePerGallon),
        );
        setValidationError(null);
    }, [
        fuelEconomyMpg,
        gasPricePerGallon,
        suggestedGasPricePerGallon,
        visible,
    ]);

    const handleSave = () => {
        const mpg = Number(mpgInput.trim());
        const gasPrice = Number(gasPriceInput.trim());

        if (!Number.isFinite(mpg) || mpg < 1 || mpg > 200) {
            setValidationError('Enter an MPG between 1 and 200.');
            return;
        }

        if (!Number.isFinite(gasPrice) || gasPrice <= 0 || gasPrice >= 20) {
            setValidationError('Enter a price per gallon below $20.');
            return;
        }

        onSave({ fuelEconomyMpg: mpg, gasPricePerGallon: gasPrice });
        onDismiss();
    };

    const handleReset = () => {
        onReset();
        onDismiss();
    };

    return (
        <Modal
            animationType="slide"
            onRequestClose={onDismiss}
            presentationStyle="overFullScreen"
            transparent
            visible={visible}
        >
            <NativeModalContent>
                <NativeNavigationAction
                    railOnly
                    kind="close"
                    label="Close fuel cost settings"
                    priority={100}
                    onPress={onDismiss}
                />
                <KeyboardAvoidingView
                    behavior="padding"
                    className="flex-1 justify-end"
                >
                    <Pressable
                        accessibilityLabel="Close fuel cost settings"
                        className="absolute inset-0 bg-black/35"
                        onPress={onDismiss}
                    />
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        className="max-h-full grow-0 rounded-t-dafSheet bg-white dark:bg-daf-surface-dark"
                        contentContainerClassName="dark:border-daf-border-dark dark:bg-daf-surface-dark gap-4 rounded-t-dafSheet border-t border-daf-border bg-white px-5 pt-3 shadow-2xl"
                        contentContainerStyle={{
                            paddingBottom: Math.max(insets.bottom + 16, 28),
                        }}
                        testID="scorecard-fuel-settings-modal"
                    >
                        <View className="mx-auto h-1 w-10 rounded-dafPill bg-daf-border-strong dark:bg-daf-border-dark" />
                        <View className="flex-row items-start gap-3">
                            <View className="h-10 w-10 items-center justify-center rounded-dafSm bg-daf-brand/10">
                                <Icon name="fuel" size={19} />
                            </View>
                            <View className="min-w-0 flex-1 gap-1">
                                <Text className="font-dafDisplay text-xl font-bold text-daf-text-primary dark:text-white">
                                    Fuel cost settings
                                </Text>
                                <Text className="text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                                    These values recalculate retained scorecard
                                    estimates and apply to future drives.
                                </Text>
                            </View>
                        </View>

                        <View className="flex-row gap-3">
                            <View className="min-w-0 flex-1 gap-1.5">
                                <Text className="text-xs font-bold uppercase tracking-[0.05em] text-daf-text-tertiary dark:text-neutral-400">
                                    Vehicle MPG
                                </Text>
                                <DafTextInput
                                    accessibilityLabel="Vehicle miles per gallon"
                                    keyboardType="decimal-pad"
                                    onChangeText={setMpgInput}
                                    selectTextOnFocus
                                    testID="scorecard-fuel-mpg-input"
                                    value={mpgInput}
                                />
                            </View>
                            <View className="min-w-0 flex-1 gap-1.5">
                                <Text className="text-xs font-bold uppercase tracking-[0.05em] text-daf-text-tertiary dark:text-neutral-400">
                                    Dollars / gal
                                </Text>
                                <DafTextInput
                                    accessibilityLabel="Gas price per gallon"
                                    keyboardType="decimal-pad"
                                    onChangeText={setGasPriceInput}
                                    selectTextOnFocus
                                    testID="scorecard-fuel-price-input"
                                    value={gasPriceInput}
                                />
                            </View>
                        </View>

                        {validationError ? (
                            <Text
                                className="text-xs font-semibold text-daf-alert"
                                testID="scorecard-fuel-settings-error"
                            >
                                {validationError}
                            </Text>
                        ) : null}

                        <DafButton
                            onPress={handleSave}
                            size="lg"
                            testID="scorecard-fuel-settings-save"
                        >
                            Use these values
                        </DafButton>
                        <View className="flex-row gap-2">
                            <DafButton
                                className="flex-1"
                                onPress={handleReset}
                                testID="scorecard-fuel-settings-reset"
                                variant="ghost"
                            >
                                Use 25.2 MPG + AAA
                            </DafButton>
                            <DafButton
                                className="flex-1"
                                onPress={onDismiss}
                                testID="scorecard-fuel-settings-cancel"
                                variant="secondary"
                            >
                                Cancel
                            </DafButton>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </NativeModalContent>
        </Modal>
    );
}
