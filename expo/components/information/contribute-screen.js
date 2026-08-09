import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { contributePage } from './community-content';
import { InformationHeader } from './information-screen';

export function ContributeScreen() {
    const handleDonatePress = () => {
        Linking.openURL(contributePage.donationUrl).catch(() => {});
    };

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="contribute-info-screen"
        >
            <InformationHeader title="Support Us" />
            <ScrollView>
                <View className="dark:border-daf-border-dark border-b border-daf-border px-4 pb-5 pt-[22px]">
                    <Text className="text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-brand dark:text-daf-brand">
                        {contributePage.label}
                    </Text>
                    <Text className="font-dafDisplay mt-2.5 text-[27px] font-bold leading-[31px] text-daf-text-primary dark:text-white">
                        {contributePage.title}
                    </Text>
                    <Text className="mt-2.5 text-[14px] leading-[22px] text-daf-text-secondary dark:text-neutral-300">
                        Drivers Against Flock is community-run, ad-free, and
                        stubbornly free to use. The bills are real, though.
                    </Text>
                </View>

                <View className="px-4 pb-2 pt-[18px]">
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark gap-[14px] rounded-dafLg border border-daf-border bg-white px-4 py-[18px] shadow-[0px_4px_18px_rgba(11,14,18,0.12)]">
                        <View className="bg-daf-brand/12 dark:bg-daf-brand/15 h-[46px] w-[46px] items-center justify-center rounded-dafMd">
                            <Icon
                                color={dafSemanticColors.brand}
                                name="coffee"
                                size={23}
                            />
                        </View>
                        <View>
                            <Text className="font-dafDisplay text-xl font-bold leading-[23px] text-daf-text-primary dark:text-white">
                                Buy us a coffee
                            </Text>
                            <Text className="mt-1.5 text-[14px] leading-[22px] text-daf-text-secondary dark:text-neutral-300">
                                Chip in whatever you like — you&apos;ll choose
                                the amount on the next screen. One-time, no
                                account needed.
                            </Text>
                        </View>
                        <Pressable
                            accessibilityLabel="Buy Drivers Against Flock a coffee"
                            accessibilityRole="link"
                            className="h-hitLarge flex-row items-center justify-center gap-2 rounded-dafPill bg-[#ffdd00] px-5 active:opacity-[0.82]"
                            onPress={handleDonatePress}
                            testID="contribute-buy-coffee-button"
                        >
                            <Icon color="#0d0c0c" name="coffee" size={19} />
                            <Text className="text-[17px] font-bold text-[#0d0c0c]">
                                Buy us a coffee
                            </Text>
                        </Pressable>
                        <View className="flex-row items-center gap-2">
                            <Icon
                                color="#828D9B"
                                name="shield-check"
                                size={14}
                            />
                            <Text className="flex-1 text-[12px] leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                Opens Buy Me a Coffee in Safari.
                            </Text>
                        </View>
                    </View>
                </View>

                <View className="px-4 pb-7 pt-[18px]">
                    <Text className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                        What it covers
                    </Text>
                    <View className="gap-[14px]">
                        {contributePage.summary.map((item) => (
                            <View className="flex-row gap-3" key={item.title}>
                                <View className="h-[34px] w-[34px] items-center justify-center rounded-dafSm bg-daf-surface-alt dark:bg-daf-surface-inverse">
                                    <Icon
                                        color={dafSemanticColors.brand}
                                        name={item.icon}
                                        size={17}
                                    />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text className="text-[14px] font-bold leading-[18px] text-daf-text-primary dark:text-white">
                                        {item.title}
                                    </Text>
                                    <Text className="mt-[3px] text-[13px] leading-5 text-daf-text-tertiary dark:text-neutral-400">
                                        {item.body}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
