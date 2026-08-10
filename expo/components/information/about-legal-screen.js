import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { InformationHeader } from './information-screen';

const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown';

function AboutLegalRow({ icon, onPress, subtitle, title, tone = 'legal' }) {
    const iconBackgroundClassName =
        tone === 'help'
            ? 'bg-daf-brand/12 dark:bg-daf-brand/15'
            : 'bg-daf-surface-alt dark:bg-daf-surface-inverse';
    const iconColor =
        tone === 'help' ? dafSemanticColors.brand : dafSemanticColors.speedOk;

    return (
        <Pressable
            accessibilityLabel={title}
            accessibilityRole="button"
            className="dark:border-daf-border-dark min-h-[62px] flex-row items-center gap-3 border-t border-daf-border px-[14px] py-3 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
            onPress={onPress}
            testID={`about-legal-${title.toLowerCase().replaceAll(' ', '-')}`}
        >
            <View
                className={`h-[34px] w-[34px] items-center justify-center rounded-dafSm ${iconBackgroundClassName}`}
            >
                <Icon color={iconColor} name={icon} size={18} />
            </View>
            <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold leading-5 text-daf-text-primary dark:text-white">
                    {title}
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-daf-text-tertiary dark:text-neutral-400">
                    {subtitle}
                </Text>
            </View>
            <Icon color="#828D9B" name="chevron-right" size={18} />
        </Pressable>
    );
}

export function AboutLegalScreen() {
    const router = useRouter();

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="about-legal-screen"
        >
            <InformationHeader title="About & Legal" />
            <ScrollView>
                <View className="dark:border-daf-border-dark items-center border-b border-daf-border px-6 pb-6 pt-7">
                    <Image
                        accessibilityLabel="Drivers Against Flock"
                        className="mb-3.5 h-16 w-16 rounded-dafLg"
                        resizeMode="contain"
                        source={require('../../assets/images/app-logo.png')}
                    />
                    <Text className="font-dafDisplay text-xl font-bold leading-6 text-daf-text-primary dark:text-white">
                        Drivers Against Flock
                    </Text>
                    <Text className="font-dafMono mt-1.5 text-xs text-daf-text-tertiary dark:text-neutral-400">
                        Version {appVersion}
                    </Text>
                    <Text className="mt-3 max-w-[256px] text-center text-[13px] leading-5 text-daf-text-secondary dark:text-neutral-300">
                        Community-run, ad-free, and stubbornly free to use.
                    </Text>
                </View>

                <View className="px-4 pb-1.5 pt-[18px]">
                    <Text className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                        Help
                    </Text>
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark overflow-hidden rounded-dafMd border border-daf-border bg-white">
                        <AboutLegalRow
                            icon="circle-help"
                            onPress={() => router.navigate('/faqs')}
                            subtitle="Six answers about data, privacy and legality"
                            title="FAQ"
                            tone="help"
                        />
                        <AboutLegalRow
                            icon="coffee"
                            onPress={() =>
                                router.navigate('/contribute-to-daf')
                            }
                            subtitle="Keep the map free — buy us a coffee"
                            title="Support Us"
                            tone="help"
                        />
                    </View>
                </View>

                <View className="px-4 pb-7 pt-[18px]">
                    <Text className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                        Legal
                    </Text>
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark overflow-hidden rounded-dafMd border border-daf-border bg-white">
                        <AboutLegalRow
                            icon="shield-check"
                            onPress={() => router.navigate('/privacy-policy')}
                            subtitle="Last updated August 2026"
                            title="Privacy Policy"
                        />
                        <AboutLegalRow
                            icon="flag"
                            onPress={() => router.navigate('/terms-of-use')}
                            subtitle="Effective June 2026"
                            title="Terms of Use"
                        />
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
