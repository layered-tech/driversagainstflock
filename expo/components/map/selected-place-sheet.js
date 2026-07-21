import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import {
    ActivityIndicator,
    Pressable,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton, DafIconButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { usePlaceSheetContext } from './map-screen-context';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from './native-components';
import {
    getPrimaryLocationLabel,
    PRIMARY_LOCATION_HOME,
} from './primary-locations';

export function SelectedPlaceSheet() {
    const { height: windowHeight } = useWindowDimensions();
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        bottomSheetAnimatedPosition,
        handleOpenSelectedPlaceWebsite,
        handleGetDirectionsToSelectedPlace,
        handleSetSelectedPlaceAsPrimaryLocation,
        handleSelectedPlaceBackToSearchResults,
        handleToggleSelectedPlaceFavorite,
        insets,
        mapPreferencesAreLoaded,
        placeSheetRef,
        placeSheetTrackingHandlers,
        primaryLocationSaveError,
        primaryLocationSaveIsLoading,
        primaryLocationTypeBeingSet,
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
        selectedPlacePrimaryLocationType,
        selectedPlaceRatingLabel,
        selectedSearchResult,
    } = usePlaceSheetContext();
    const selectedPlaceSheetKey =
        selectedSearchResult?.placeId || selectedSearchResult?.id || 'empty';
    const selectedPlacePrimaryLocationLabel = getPrimaryLocationLabel(
        selectedPlacePrimaryLocationType,
    );

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

                        {selectedPlacePrimaryLocationType ? (
                            <Pressable
                                accessibilityHint={`Saves this destination on this device as ${selectedPlacePrimaryLocationLabel}.`}
                                accessibilityLabel={`Set as ${selectedPlacePrimaryLocationLabel}`}
                                accessibilityRole="button"
                                accessibilityState={{
                                    busy: primaryLocationSaveIsLoading,
                                    disabled: primaryLocationSaveIsLoading,
                                }}
                                className={`dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-3 rounded-dafMd border border-daf-border bg-white p-3 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse ${
                                    primaryLocationSaveIsLoading
                                        ? 'opacity-60'
                                        : ''
                                }`}
                                disabled={primaryLocationSaveIsLoading}
                                onPress={
                                    handleSetSelectedPlaceAsPrimaryLocation
                                }
                                testID={`selected-place-set-${selectedPlacePrimaryLocationType}-button`}
                            >
                                <View className="bg-daf-brand/12 dark:bg-daf-brand/20 h-[34px] w-[34px] items-center justify-center rounded-dafSm">
                                    <Icon
                                        color="#167C47"
                                        name={
                                            selectedPlacePrimaryLocationType ===
                                            PRIMARY_LOCATION_HOME
                                                ? 'home'
                                                : 'briefcase'
                                        }
                                        size={18}
                                    />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text className="text-[14.5px] font-semibold text-daf-text-primary dark:text-white">
                                        Set as{' '}
                                        {selectedPlacePrimaryLocationLabel}
                                    </Text>
                                    <Text className="mt-0.5 text-[12.5px] font-medium text-daf-text-tertiary dark:text-neutral-400">
                                        {primaryLocationTypeBeingSet ===
                                        selectedPlacePrimaryLocationType
                                            ? 'Save for one-tap directions'
                                            : selectedPlacePrimaryLocationType ===
                                                PRIMARY_LOCATION_HOME
                                              ? 'Suggested for residential addresses'
                                              : 'Suggested for businesses'}
                                    </Text>
                                </View>
                                {primaryLocationSaveIsLoading ? (
                                    <ActivityIndicator
                                        color={searchPrimaryIconColor}
                                        size="small"
                                    />
                                ) : (
                                    <Icon
                                        color="#828D9B"
                                        name="chevron-right"
                                        size={18}
                                    />
                                )}
                            </Pressable>
                        ) : null}

                        {primaryLocationSaveError ? (
                            <Text
                                accessibilityLiveRegion="polite"
                                className="rounded-dafMd bg-red-50 px-3 py-3 text-sm font-medium leading-5 text-red-700 dark:bg-red-950/30 dark:text-red-200"
                                selectable
                                testID="selected-place-primary-location-error"
                            >
                                {primaryLocationSaveError}
                            </Text>
                        ) : null}

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
