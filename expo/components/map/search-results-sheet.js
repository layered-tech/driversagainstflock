import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    Text,
    View,
} from 'react-native';
import { Icon } from '../design-system/icon';
import { useSearchResultsContext } from './map-screen-context';
import {
    NativeWindBottomSheetFlatList,
    NativeWindBottomSheetModal,
} from './native-components';
import { SubmittedSearchResultRow } from './submitted-search-result-row';
import { useBottomSheetPresentedState } from './use-bottom-sheet-presented-state';

export function SearchResultsSheet() {
    const [modalGeneration, setModalGeneration] = useState(0);
    const {
        bottomSheetAnimatedPosition,
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        handleSubmittedSearchResultPress,
        insets,
        mapPreferencesAreLoaded,
        searchIconColor,
        submittedSearchError,
        submittedSearchIsLoading,
        submittedSearchQuery,
        submittedSearchResults,
        submittedSearchResultsSheetRef,
        submittedSearchResultsSheetSnapPoints,
        submittedSearchResultsSheetTrackingHandlers,
    } = useSearchResultsContext();
    const {
        bottomSheetIsPresented,
        handleBottomSheetChange,
        handleBottomSheetDismiss,
    } = useBottomSheetPresentedState({
        onChange: submittedSearchResultsSheetTrackingHandlers.onChange,
        onDismiss: submittedSearchResultsSheetTrackingHandlers.onDismiss,
    });
    const handleModalDismiss = useCallback(
        (...args) => {
            // A fresh modal avoids reusing the portal while its old native sheet
            // is still completing teardown after dismiss().
            setModalGeneration((generation) => generation + 1);
            handleBottomSheetDismiss(...args);
        },
        [handleBottomSheetDismiss],
    );

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    const contentGap = 14;
    const bottomContentPadding = Math.max(insets.bottom, 12);
    const bottomContentSpacerHeight = Math.max(
        bottomContentPadding - contentGap,
        0,
    );
    const resultCount = submittedSearchResults.length;
    const resultCountLabel = submittedSearchQuery
        ? `${resultCount} ${resultCount === 1 ? 'place' : 'places'} for "${submittedSearchQuery}"`
        : `${resultCount} ${resultCount === 1 ? 'place' : 'places'}`;
    const listData = submittedSearchError ? [] : submittedSearchResults;
    const renderItem = ({ item, index }) => (
        <SubmittedSearchResultRow
            highlightQuery={submittedSearchQuery}
            index={index}
            onPress={handleSubmittedSearchResultPress}
            result={item}
            searchIconColor={searchIconColor}
        />
    );
    const listHeader = (
        <View className="gap-3 pb-1">
            <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-[22px] bg-daf-violet">
                    <Icon color="#ffffff" name="search" size={18} />
                </View>
                <View className="min-w-0 flex-1">
                    <Text
                        className="text-lg font-bold leading-6 text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                    >
                        Search results
                    </Text>
                    <Text
                        className="mt-0.5 text-xs font-semibold text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                        testID="submitted-search-result-count"
                    >
                        {resultCountLabel}
                    </Text>
                </View>
                {Platform.isPad ? (
                    <Pressable
                        accessibilityLabel="Close search results"
                        accessibilityRole="button"
                        className="h-11 w-11 items-center justify-center rounded-full active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                        onPress={() =>
                            submittedSearchResultsSheetRef.current?.dismiss()
                        }
                        testID="submitted-search-results-close"
                    >
                        <Icon color={searchIconColor} name="x" size={20} />
                    </Pressable>
                ) : null}
            </View>

            {submittedSearchIsLoading ? (
                <View
                    accessibilityLabel="Searching places"
                    accessibilityRole="progressbar"
                    className="flex-row items-center gap-3 rounded-dafMd bg-daf-surface-alt px-3 py-3 dark:bg-daf-surface-dark"
                >
                    <ActivityIndicator color={searchIconColor} size="small" />
                    <Text className="text-sm font-semibold text-daf-text-secondary dark:text-neutral-300">
                        Searching places
                    </Text>
                </View>
            ) : null}

            {submittedSearchError ? (
                <View className="rounded-dafMd bg-red-50 px-3 py-3 dark:bg-red-950/30">
                    <Text className="text-sm font-medium leading-5 text-red-700 dark:text-red-200">
                        {submittedSearchError}
                    </Text>
                </View>
            ) : null}

            {!submittedSearchIsLoading &&
            !submittedSearchError &&
            submittedSearchResults.length === 0 ? (
                <View className="rounded-dafMd bg-daf-surface-alt px-3 py-3 dark:bg-daf-surface-dark">
                    <Text className="text-sm font-medium text-daf-text-secondary dark:text-neutral-300">
                        No places found nearby
                    </Text>
                </View>
            ) : null}
        </View>
    );

    return (
        <NativeWindBottomSheetModal
            key={modalGeneration}
            ref={submittedSearchResultsSheetRef}
            accessible={false}
            index={0}
            snapPoints={submittedSearchResultsSheetSnapPoints}
            enableDynamicSizing={false}
            enableOverDrag={false}
            enablePanDownToClose={false}
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            animatedPosition={bottomSheetAnimatedPosition}
            onAnimate={submittedSearchResultsSheetTrackingHandlers.onAnimate}
            onChange={handleBottomSheetChange}
            onDismiss={handleModalDismiss}
        >
            <NativeWindBottomSheetFlatList
                className="flex-1"
                contentContainerClassName="gap-[14px] px-[24px] pb-0 pt-[4px]"
                data={listData}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                keyboardShouldPersistTaps="handled"
                ListFooterComponent={
                    <View style={{ height: bottomContentSpacerHeight }} />
                }
                ListHeaderComponent={listHeader}
                nestedScrollEnabled
                renderItem={renderItem}
                showsVerticalScrollIndicator
                testID={
                    bottomSheetIsPresented
                        ? 'search-results-sheet-presented'
                        : undefined
                }
            />
        </NativeWindBottomSheetModal>
    );
}
