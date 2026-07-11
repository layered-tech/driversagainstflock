import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton, DafIconButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { usePlaceSheetContext } from './map-screen-context';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from './native-components';

export function SelectedPlaceSheet() {
    const { height: windowHeight } = useWindowDimensions();
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        bottomSheetAnimatedPosition,
        handleOpenSelectedPlaceWebsite,
        handleGetDirectionsToSelectedPlace,
        handleSelectedPlaceBackToSearchResults,
        handleToggleSelectedPlaceFavorite,
        insets,
        mapPreferencesAreLoaded,
        placeSheetRef,
        placeSheetTrackingHandlers,
        searchPrimaryIconColor,
        selectedPlaceAddress,
        selectedPlaceCanReturnToSearchResults,
        selectedPlaceCurrentHoursSummary,
        selectedPlaceDetails,
        selectedPlaceHeaderSubtitle,
        selectedPlaceIsFavorite,
        selectedPlaceIsLoading,
        selectedPlaceName,
        selectedPlaceOpenNowLabel,
        selectedPlacePhoneNumber,
        selectedPlaceRatingLabel,
        selectedSearchResult,
    } = usePlaceSheetContext();
    const selectedPlaceSheetKey =
        selectedSearchResult?.placeId || selectedSearchResult?.id || 'empty';

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    const contentGap = 16;
    const bottomContentPadding = Math.max(insets.bottom + 12, 20);

    return (
        <NativeWindBottomSheetModal
            key={selectedPlaceSheetKey}
            ref={placeSheetRef}
            accessible={false}
            index={0}
            // Intentionally no `snapPoints`: dynamic sizing gives a single content-fit
            // detent (capped at 50%), so the sheet cannot be dragged open any further.
            // `enablePanDownToClose` still lets the user drag it down to dismiss.
            enableDynamicSizing
            maxDynamicContentSize={windowHeight * 0.5}
            enableOverDrag={false}
            enablePanDownToClose
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            animatedPosition={bottomSheetAnimatedPosition}
            onAnimate={placeSheetTrackingHandlers.onAnimate}
            onChange={placeSheetTrackingHandlers.onChange}
            onDismiss={placeSheetTrackingHandlers.onDismiss}
        >
            <NativeWindBottomSheetView className="dark:bg-daf-surface-dark bg-white">
                {selectedSearchResult ? (
                    <BottomSheetScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                            gap: contentGap,
                            paddingBottom: bottomContentPadding,
                            paddingHorizontal: 24,
                            paddingTop: 4,
                        }}
                    >
                        {selectedPlaceCanReturnToSearchResults ? (
                            <Pressable
                                accessibilityHint="Returns to the expanded search results list."
                                accessibilityLabel="Back to search results"
                                accessibilityRole="button"
                                className="dark:border-daf-border-dark flex-row items-center gap-2 self-start rounded-dafMd border border-daf-border px-3 py-2 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                hitSlop={6}
                                onPress={handleSelectedPlaceBackToSearchResults}
                                testID="selected-place-back-to-results-button"
                            >
                                <Icon
                                    color={searchPrimaryIconColor}
                                    name="chevron-left"
                                    size={13}
                                />
                                <Text className="text-sm font-semibold text-daf-text-secondary dark:text-neutral-200">
                                    Back to results
                                </Text>
                            </Pressable>
                        ) : null}

                        <View className="gap-1">
                            <Text
                                className="font-dafDisplay text-[21px] font-bold leading-7 text-daf-text-primary dark:text-white"
                                numberOfLines={2}
                                testID="selected-place-title"
                            >
                                {selectedPlaceName}
                            </Text>
                            {selectedPlaceHeaderSubtitle ? (
                                <Text
                                    className="text-[13px] font-medium leading-5 text-daf-text-secondary dark:text-neutral-300"
                                    numberOfLines={1}
                                    testID="selected-place-subtitle"
                                >
                                    {selectedPlaceHeaderSubtitle}
                                </Text>
                            ) : null}
                        </View>

                        {selectedPlaceRatingLabel ||
                        selectedPlaceOpenNowLabel ? (
                            <View className="flex-row flex-wrap items-center gap-2">
                                {selectedPlaceRatingLabel ? (
                                    <View className="flex-row items-center gap-1">
                                        <Icon
                                            color="#FFB02E"
                                            fill="#FFB02E"
                                            name="star"
                                            size={15}
                                        />
                                        <Text
                                            className="text-[13px] font-semibold text-amber-700 dark:text-daf-amber"
                                            testID="selected-place-rating"
                                        >
                                            {selectedPlaceRatingLabel}
                                        </Text>
                                    </View>
                                ) : null}
                                {selectedPlaceOpenNowLabel ? (
                                    <View className="flex-row items-center gap-1.5">
                                        <Text
                                            className="text-[13px] font-semibold text-daf-text-brand dark:text-daf-brand"
                                            testID="selected-place-open-now"
                                        >
                                            {selectedPlaceOpenNowLabel}
                                        </Text>
                                        {selectedPlaceCurrentHoursSummary ? (
                                            <Text
                                                className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300"
                                                numberOfLines={1}
                                                testID="selected-place-hours-summary"
                                            >
                                                {
                                                    selectedPlaceCurrentHoursSummary
                                                }
                                            </Text>
                                        ) : null}
                                    </View>
                                ) : null}
                            </View>
                        ) : null}

                        <View className="gap-3">
                            {selectedPlaceAddress ? (
                                <View className="flex-row items-start gap-3">
                                    <Icon
                                        color="#828D9B"
                                        name="map-pin"
                                        size={18}
                                    />
                                    <Text
                                        className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-daf-text-secondary dark:text-neutral-300"
                                        selectable
                                        testID="selected-place-address"
                                    >
                                        {selectedPlaceAddress}
                                    </Text>
                                </View>
                            ) : null}
                            {selectedPlacePhoneNumber ? (
                                <View className="flex-row items-center gap-3">
                                    <Icon
                                        color="#828D9B"
                                        name="phone"
                                        size={18}
                                    />
                                    <Text
                                        className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-daf-text-secondary dark:text-neutral-300"
                                        selectable
                                        testID="selected-place-phone"
                                    >
                                        {selectedPlacePhoneNumber}
                                    </Text>
                                </View>
                            ) : null}
                        </View>

                        <View className="flex-row gap-2">
                            <DafButton
                                accessibilityLabel="Get directions to this place"
                                className="min-w-0 flex-1"
                                disabled={
                                    selectedPlaceIsLoading ||
                                    !selectedPlaceDetails?.location
                                }
                                icon="navigation"
                                onPress={handleGetDirectionsToSelectedPlace}
                                testID="selected-place-get-directions-button"
                            >
                                Directions
                            </DafButton>
                            <DafIconButton
                                accessibilityHint={
                                    selectedPlaceIsFavorite
                                        ? 'Removes this place from favorites.'
                                        : 'Adds this place to favorites.'
                                }
                                accessibilityLabel={
                                    selectedPlaceIsFavorite
                                        ? 'Remove place from favorites'
                                        : 'Add place to favorites'
                                }
                                color={
                                    selectedPlaceIsFavorite
                                        ? dafSemanticColors.danger
                                        : searchPrimaryIconColor
                                }
                                icon="heart"
                                onPress={handleToggleSelectedPlaceFavorite}
                                selected={selectedPlaceIsFavorite}
                                tone="alert"
                            />
                            {selectedPlaceDetails?.websiteUri ? (
                                <DafIconButton
                                    accessibilityLabel="Open place website"
                                    color={searchPrimaryIconColor}
                                    icon="globe"
                                    onPress={handleOpenSelectedPlaceWebsite}
                                />
                            ) : null}
                        </View>
                    </BottomSheetScrollView>
                ) : null}
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
