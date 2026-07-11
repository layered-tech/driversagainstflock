import { router } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafChip,
    DafSectionLabel,
    DafTextInput,
} from '../design-system/primitives';
import { getDafTheme } from '../design-system/tokens';
import { useContribute } from './contribute-state';
import { ContributePageHeader } from './step-header';

const SOURCE_OPTIONS = [
    { label: 'Survey', testID: 'contribute-source-survey', value: 'survey' },
    {
        label: 'Local knowledge',
        testID: 'contribute-source-local',
        value: 'local knowledge',
    },
    {
        label: 'Aerial imagery',
        testID: 'contribute-source-aerial',
        value: 'aerial imagery',
    },
];

export default function ChangesetDetailsScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { changeset, pins, updateChangeset } = useContribute();
    const commentIsEmpty = !changeset.comment.trim();
    const theme = getDafTheme(colorScheme);
    const footerPaddingBottom = Math.max(insets.bottom + 12, 28);

    const handleBackPress = useCallback(() => {
        router.back();
    }, []);

    const handleCommentChange = useCallback(
        (comment) => {
            updateChangeset({ comment });
        },
        [updateChangeset],
    );

    const handleHashtagsChange = useCallback(
        (hashtags) => {
            updateChangeset({ hashtags });
        },
        [updateChangeset],
    );

    const handleSourceChange = useCallback(
        (source) => {
            updateChangeset({ source });
        },
        [updateChangeset],
    );

    const handleNextPress = useCallback(() => {
        router.push('/contribute/review');
    }, []);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="contribute-changeset-details-screen"
        >
            <ContributePageHeader
                onBack={handleBackPress}
                step={3}
                title="Changeset details"
            />
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
                <View className="gap-[18px] p-4">
                    <View>
                        <DafSectionLabel className="mb-2">
                            Comment
                        </DafSectionLabel>
                        <DafTextInput
                            multiline
                            onChangeText={handleCommentChange}
                            testID="contribute-comment-input"
                            value={changeset.comment}
                        />
                        <Text className="mt-[7px] text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                            Say what changed and why — other mappers read this.
                        </Text>
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Source
                        </DafSectionLabel>
                        <View className="flex-row flex-wrap gap-2">
                            {SOURCE_OPTIONS.map((option) => (
                                <DafChip
                                    key={option.value}
                                    onPress={() =>
                                        handleSourceChange(option.value)
                                    }
                                    selected={changeset.source === option.value}
                                    testID={option.testID}
                                    tone="brand"
                                >
                                    {option.label}
                                </DafChip>
                            ))}
                        </View>
                    </View>
                    <View>
                        <DafSectionLabel className="mb-2">
                            Hashtags
                        </DafSectionLabel>
                        <DafTextInput
                            autoCapitalize="none"
                            autoCorrect={false}
                            onChangeText={handleHashtagsChange}
                            testID="contribute-hashtags-input"
                            value={changeset.hashtags}
                        />
                    </View>
                    <View className="bg-daf-brand/12 dark:bg-daf-brand/15 flex-row items-center gap-[11px] rounded-dafMd p-3">
                        <Icon
                            color={theme.text.brand}
                            name="circle-check"
                            size={18}
                        />
                        <Text className="min-w-0 flex-1 text-[13px] leading-[18px] text-daf-text-primary dark:text-white">
                            <Text
                                className="font-bold"
                                testID="contribute-node-count"
                            >
                                {pins.length === 1
                                    ? '1 node'
                                    : `${pins.length} nodes`}
                            </Text>{' '}
                            will be added to OpenStreetMap.
                        </Text>
                    </View>
                </View>
            </ScrollView>
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-t border-daf-border bg-white px-4 pt-3"
                style={{ paddingBottom: footerPaddingBottom }}
            >
                <DafButton
                    disabled={commentIsEmpty}
                    onPress={handleNextPress}
                    size="lg"
                    testID="contribute-next-review-button"
                >
                    Next: review & publish
                </DafButton>
            </View>
        </View>
    );
}
