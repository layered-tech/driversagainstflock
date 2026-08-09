import { useState } from 'react';
import {
    Linking,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Icon } from '../design-system/icon';
import { DafChip } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { faqItems } from './community-content';
import { FAQ_FILTERS, getVisibleFaqItems } from './information-page-state';
import { InformationHeader } from './information-screen';

const SUPPORT_EMAIL = 'support@driversagainstflock.com';

export function FaqScreen() {
    const [activeFilterId, setActiveFilterId] = useState('all');
    const [openQuestion, setOpenQuestion] = useState(faqItems[0].question);
    const [searchQuery, setSearchQuery] = useState('');
    const visibleFaqItems = getVisibleFaqItems(
        faqItems,
        activeFilterId,
        searchQuery,
    );

    const handleSupportPress = () => {
        Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
    };

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="faq-screen"
        >
            <InformationHeader answerCount={faqItems.length} title="FAQ" />
            <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-b border-daf-border bg-white px-4 py-3">
                <View className="dark:border-daf-border-dark h-[46px] flex-row items-center gap-2.5 rounded-dafPill border border-daf-border bg-daf-surface-alt px-4 dark:bg-daf-surface-inverse">
                    <Icon color="#828D9B" name="search" size={18} />
                    <TextInput
                        accessibilityLabel="Search help"
                        autoCapitalize="none"
                        className="min-w-0 flex-1 text-[15px] text-daf-text-primary dark:text-white"
                        onChangeText={setSearchQuery}
                        placeholder="Search help"
                        placeholderTextColor="#828D9B"
                        testID="faq-search-input"
                        value={searchQuery}
                    />
                </View>
            </View>
            <ScrollView>
                <ScrollView
                    className="flex-grow-0"
                    contentContainerClassName="gap-2 px-4 pb-1 pt-3"
                    horizontal
                    showsHorizontalScrollIndicator={false}
                >
                    {FAQ_FILTERS.map((filter) => (
                        <DafChip
                            key={filter.id}
                            onPress={() => setActiveFilterId(filter.id)}
                            selected={activeFilterId === filter.id}
                            testID={`faq-filter-${filter.id}`}
                            tone="brand"
                        >
                            {filter.label}
                        </DafChip>
                    ))}
                </ScrollView>

                <View className="gap-2.5 px-4 pb-6 pt-3">
                    {visibleFaqItems.map((faq, index) => {
                        const isOpen = openQuestion === faq.question;

                        return (
                            <View
                                className="dark:border-daf-border-dark dark:bg-daf-surface-dark overflow-hidden rounded-dafMd border border-daf-border bg-white"
                                key={faq.question}
                            >
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: isOpen }}
                                    className="min-h-[56px] flex-row items-start justify-between gap-3.5 px-[15px] py-[15px] active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                    onPress={() =>
                                        setOpenQuestion(
                                            isOpen ? null : faq.question,
                                        )
                                    }
                                    testID={`faq-item-${index}`}
                                >
                                    <Text className="font-dafDisplay min-w-0 flex-1 text-base font-semibold leading-[22px] text-daf-text-primary dark:text-white">
                                        {faq.question}
                                    </Text>
                                    <Icon
                                        color={
                                            isOpen
                                                ? dafSemanticColors.brand
                                                : '#828D9B'
                                        }
                                        name="chevron-down"
                                        size={20}
                                        stroke={2.2}
                                        style={{
                                            transform: [
                                                {
                                                    rotate: isOpen
                                                        ? '180deg'
                                                        : '0deg',
                                                },
                                            ],
                                        }}
                                    />
                                </Pressable>
                                {isOpen ? (
                                    <Text className="px-[15px] pb-[17px] text-[14px] leading-[22px] text-daf-text-secondary dark:text-neutral-300">
                                        {faq.answer}
                                    </Text>
                                ) : null}
                            </View>
                        );
                    })}

                    {visibleFaqItems.length === 0 ? (
                        <View
                            className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafMd border border-daf-border bg-white p-4"
                            testID="faq-empty-state"
                        >
                            <Text className="font-dafDisplay text-base font-semibold text-daf-text-primary dark:text-white">
                                No matching answers
                            </Text>
                            <Text className="mt-1 text-sm leading-5 text-daf-text-secondary dark:text-neutral-300">
                                Try a different search or choose another topic.
                            </Text>
                        </View>
                    ) : null}

                    <View className="mt-1 flex-row items-center gap-2.5 rounded-dafMd bg-daf-surface-alt px-[15px] py-[14px] dark:bg-daf-surface-inverse">
                        <Icon
                            color={dafSemanticColors.brand}
                            name="circle-help"
                            size={18}
                        />
                        <Text className="min-w-0 flex-1 text-[13px] leading-5 text-daf-text-secondary dark:text-neutral-300">
                            Still stuck? Email us — a human answers.
                        </Text>
                        <Pressable
                            accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
                            accessibilityRole="link"
                            className="dark:active:bg-daf-surface-dark min-h-[34px] items-center justify-center rounded-dafPill px-2.5 active:bg-white"
                            onPress={handleSupportPress}
                            testID="faq-support-email"
                        >
                            <Text className="text-[13px] font-semibold text-daf-text-brand dark:text-daf-brand">
                                Email
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
