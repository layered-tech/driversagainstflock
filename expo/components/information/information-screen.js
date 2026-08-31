import { useNavigation } from 'expo-router';
import { useRef, useState } from 'react';
import {
    Linking,
    Platform,
    Pressable,
    ScrollView,
    Share,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { toggleNearestDrawer } from '../map/navigation';
import {
    getLegalDocumentMetadata,
    getLegalSectionScrollOffset,
    getLegalTableOfContents,
} from './information-page-state';

const SUPPORT_EMAIL = 'support@driversagainstflock.com';
const PUBLIC_SITE_URL = 'https://driversagainstflock.com';

export function InformationHeader({ answerCount, onShare, title }) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const isDarkMode = colorScheme === 'dark';
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-b border-daf-border bg-white px-3 pb-3"
            style={{ paddingTop: headerPaddingTop }}
        >
            <View className="flex-row items-center gap-1">
                <Pressable
                    accessibilityLabel="Open menu"
                    accessibilityRole="button"
                    className="h-10 w-10 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                    onPress={() => toggleNearestDrawer(navigation)}
                    testID="information-drawer-button"
                >
                    <Icon
                        color={isDarkMode ? '#F4F7FA' : '#0B0E12'}
                        name="menu"
                        size={20}
                    />
                </Pressable>
                <Text
                    className="font-dafDisplay min-w-0 flex-1 text-lg font-bold leading-5 text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {answerCount ? (
                    <View className="dark:border-daf-border-dark rounded-dafPill border border-daf-border bg-daf-surface-alt px-2.5 py-1 dark:bg-daf-surface-inverse">
                        <Text className="font-dafMono text-[11px] font-semibold text-daf-text-secondary dark:text-neutral-300">
                            {answerCount} answers
                        </Text>
                    </View>
                ) : null}
                {onShare ? (
                    <Pressable
                        accessibilityLabel={`Share ${title}`}
                        accessibilityRole="button"
                        className="h-10 w-10 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                        onPress={onShare}
                        testID="information-share-button"
                    >
                        <Icon
                            color={isDarkMode ? '#F4F7FA' : '#0B0E12'}
                            name="upload"
                            size={19}
                        />
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

function InformationList({ items }) {
    return (
        <View className="gap-2.5">
            {items.map((item) => (
                <View className="flex-row gap-2.5" key={item}>
                    <View className="pt-[7px]">
                        <View className="h-1.5 w-1.5 rounded-dafPill bg-daf-text-brand dark:bg-daf-brand" />
                    </View>
                    <Text className="flex-1 text-[14px] leading-[22px] text-daf-text-secondary dark:text-neutral-300">
                        {item}
                    </Text>
                </View>
            ))}
        </View>
    );
}

function LegalSummary({ items }) {
    return (
        <View className="gap-2.5">
            {items.map((item) => (
                <View
                    className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row gap-3 rounded-dafMd border border-daf-border bg-white p-[14px]"
                    key={item.title}
                >
                    <View className="bg-daf-brand/12 dark:bg-daf-brand/15 h-8 w-8 items-center justify-center rounded-dafSm">
                        <Icon
                            color={dafSemanticColors.brand}
                            name="check"
                            size={17}
                            stroke={2.6}
                        />
                    </View>
                    <View className="min-w-0 flex-1">
                        <Text className="font-dafDisplay mb-1 text-base font-semibold leading-5 text-daf-text-primary dark:text-white">
                            {item.title}
                        </Text>
                        <Text className="text-[13px] leading-5 text-daf-text-secondary dark:text-neutral-300">
                            {item.body}
                        </Text>
                    </View>
                </View>
            ))}
        </View>
    );
}

function LegalTableOfContents({ isOpen, items, onSectionPress, onToggle }) {
    return (
        <View
            className="dark:border-daf-border-dark overflow-hidden rounded-dafMd border border-daf-border bg-daf-surface-alt dark:bg-daf-surface-inverse"
            testID="legal-table-of-contents"
        >
            <Pressable
                accessibilityLabel="Jump to a section"
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                className="min-h-[50px] flex-row items-center gap-2.5 px-[15px] active:opacity-[0.82]"
                onPress={onToggle}
                testID="legal-table-of-contents-toggle"
            >
                <Text className="flex-1 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-secondary dark:text-neutral-300">
                    Jump to a section
                </Text>
                <Icon
                    color={isOpen ? dafSemanticColors.brand : '#828D9B'}
                    name="chevron-down"
                    size={18}
                    stroke={2.2}
                    style={{
                        transform: [{ rotate: isOpen ? '180deg' : '0deg' }],
                    }}
                />
            </Pressable>
            {isOpen ? (
                <View className="dark:border-daf-border-dark border-t border-daf-border px-[15px] pb-2.5 pt-1">
                    {items.map((item, index) => (
                        <Pressable
                            accessibilityLabel={`Jump to ${item.title}`}
                            accessibilityRole="button"
                            className={`min-h-[44px] flex-row items-center gap-2.5 py-2.5 ${
                                index < items.length - 1
                                    ? 'dark:border-daf-border-dark border-b border-daf-border'
                                    : ''
                            }`}
                            key={item.id}
                            onPress={() => onSectionPress(item.id)}
                            testID={`legal-table-of-contents-${item.id}`}
                        >
                            <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                {item.number}
                            </Text>
                            <Text className="flex-1 text-sm leading-5 text-daf-text-secondary dark:text-neutral-300">
                                {item.title}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

function LegalSection({ isFirst, onLayout, section }) {
    return (
        <View
            className={`py-7 ${
                isFirst
                    ? ''
                    : 'dark:border-daf-border-dark border-t border-daf-border'
            }`}
            onLayout={onLayout}
        >
            <Text className="font-dafDisplay mb-3 text-[21px] font-bold leading-[25px] text-daf-text-primary dark:text-white">
                {section.title}
            </Text>
            <View className="gap-[13px]">
                {section.blocks.map((block, index) => {
                    if (block.type === 'heading') {
                        return (
                            <Text
                                className="font-dafDisplay mt-1 text-[17px] font-semibold leading-[22px] text-daf-text-primary dark:text-white"
                                key={`${section.id}-${index}`}
                            >
                                {block.text}
                            </Text>
                        );
                    }

                    if (block.type === 'list') {
                        return (
                            <InformationList
                                items={block.items}
                                key={`${section.id}-${index}`}
                            />
                        );
                    }

                    return (
                        <Text
                            className="text-[14px] leading-[23px] text-daf-text-secondary dark:text-neutral-300"
                            key={`${section.id}-${index}`}
                        >
                            {block.text}
                        </Text>
                    );
                })}
            </View>
        </View>
    );
}

function ContactCard({ heading, text }) {
    const handleSupportPress = () => {
        Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
    };

    return (
        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafMd border border-daf-border bg-white p-5">
            <Text className="font-dafDisplay mb-2 text-[19px] font-bold leading-6 text-daf-text-primary dark:text-white">
                {heading}
            </Text>
            <Text className="text-[15px] leading-[22px] text-daf-text-secondary dark:text-neutral-300">
                {text}
            </Text>
            <Pressable
                accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
                accessibilityRole="link"
                className="mt-2 self-start active:opacity-[0.7]"
                onPress={handleSupportPress}
                testID="information-support-email"
            >
                <Text className="text-[15px] font-semibold leading-[22px] text-daf-text-brand dark:text-daf-brand">
                    {SUPPORT_EMAIL}
                </Text>
            </Pressable>
            <Text className="mt-3 text-[13px] leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                Drivers Against Flock is operated by LayeredTech, LLC.
            </Text>
        </View>
    );
}

function SafetyNotice({ children }) {
    return (
        <View className="bg-daf-amber/12 dark:bg-daf-amber/15 mb-4 flex-row gap-2.5 rounded-dafMd p-[13px]">
            <View className="pt-0.5">
                <Icon
                    color={dafSemanticColors.warning}
                    name="triangle-alert"
                    size={17}
                />
            </View>
            <Text className="flex-1 text-[13px] leading-5 text-daf-text-secondary dark:text-neutral-300">
                {children}
            </Text>
        </View>
    );
}

export function LegalScreen({ page, testID }) {
    const scrollViewRef = useRef(null);
    const sectionsContainerOffsetRef = useRef(null);
    const sectionOffsetsRef = useRef({});
    const [tableOfContentsIsOpen, setTableOfContentsIsOpen] = useState(
        page.tableOfContentsInitiallyOpen === true,
    );
    const tableOfContents = getLegalTableOfContents(page.sections);
    const metadata = getLegalDocumentMetadata(page);

    const handleSharePress = () => {
        const url = page.sharePath
            ? `${PUBLIC_SITE_URL}${page.sharePath}`
            : PUBLIC_SITE_URL;

        void Promise.resolve()
            .then(() =>
                Share.share({
                    message: `${page.title} · Drivers Against Flock\n${url}`,
                    url,
                }),
            )
            .catch(() => {});
    };
    const handleSectionPress = (sectionId) => {
        setTableOfContentsIsOpen(false);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const offset = getLegalSectionScrollOffset(
                    sectionsContainerOffsetRef.current,
                    sectionOffsetsRef.current[sectionId],
                );

                if (typeof offset === 'number') {
                    scrollViewRef.current?.scrollTo({
                        animated: true,
                        y: offset,
                    });
                }
            });
        });
    };

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID={testID}
        >
            <InformationHeader onShare={handleSharePress} title={page.title} />
            <View className="dark:border-daf-border-dark flex-row items-center gap-2 border-b border-daf-border bg-daf-surface-alt px-4 py-[9px] dark:bg-daf-surface-inverse">
                <Text className="font-dafMono text-[11px] font-semibold text-daf-text-brand dark:text-daf-brand">
                    {metadata.updatedLabel}
                </Text>
                <Text className="font-dafMono ml-auto text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                    {metadata.sectionCountLabel}
                </Text>
            </View>
            <ScrollView ref={scrollViewRef}>
                <View className="px-4 pb-10 pt-[18px]">
                    {page.safetyNotice ? (
                        <SafetyNotice>{page.safetyNotice}</SafetyNotice>
                    ) : null}
                    {page.showIntro !== false ? (
                        <Text className="text-[15px] leading-[23px] text-daf-text-secondary dark:text-neutral-300">
                            {page.intro}
                        </Text>
                    ) : null}

                    {page.showSummary !== false ? (
                        <>
                            <Text className="mt-[18px] text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                                The short version
                            </Text>
                            <View className="mt-3">
                                <LegalSummary items={page.summary} />
                            </View>
                        </>
                    ) : null}

                    <View
                        className={
                            page.showSummary === false ? 'mt-4' : 'mt-[18px]'
                        }
                    >
                        <LegalTableOfContents
                            isOpen={tableOfContentsIsOpen}
                            items={tableOfContents}
                            onSectionPress={handleSectionPress}
                            onToggle={() =>
                                setTableOfContentsIsOpen((isOpen) => !isOpen)
                            }
                        />
                    </View>

                    <View
                        className="mt-[14px]"
                        onLayout={(event) => {
                            sectionsContainerOffsetRef.current =
                                event.nativeEvent.layout.y;
                        }}
                    >
                        {page.sections.map((section, index) => (
                            <LegalSection
                                isFirst={index === 0}
                                key={section.id}
                                onLayout={(event) => {
                                    sectionOffsetsRef.current[section.id] =
                                        event.nativeEvent.layout.y;
                                }}
                                section={section}
                            />
                        ))}
                    </View>

                    <ContactCard
                        heading={page.contactHeading}
                        text={page.contactText}
                    />
                </View>
            </ScrollView>
        </View>
    );
}
