import {
    ActivityIndicator,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon } from '../design-system/icon';
import { DafButton, DafChip } from '../design-system/primitives';
import { DestinationCategoryPills } from './destination-category-pills';
import {
    DIRECTIONS_FIELD_DESTINATION,
    DIRECTIONS_FIELD_START,
    DIRECTIONS_FIELD_STOP,
    DIRECTIONS_MODE_DIRECTIONS,
} from './directions';
import { DirectionsField } from './directions-field';
import { MAP_OVERLAY_LAYOUT_ANIMATION } from './layout-animations';
import { useMapSearchContext } from './map-screen-context';
import { SearchGlassShell } from './search-glass-shell';

export function MapSearchOverlay({ mapControls = null }) {
    const {
        directionsActiveField,
        directionsCurrentLocationWaypoint,
        directionsDestinationInputRef,
        directionsDestinationValue,
        directionsDestinationWaypoint,
        directionsPlaceError,
        directionsPlaceIsLoading,
        directionsRoute,
        directionsRouteCanSubmit,
        directionsRouteError,
        directionsRouteIsLoading,
        directionsSearchPageIsVisible,
        directionsStartInputRef,
        directionsStartValue,
        directionsStartWaypoint,
        directionsStopInputRef,
        directionsStopIsVisible,
        directionsStopValue,
        directionsStopWaypoint,
        handleClearSelectedSearchResult,
        handleDestinationCategoryPress,
        handleDirectionsAddStopPress,
        handleDirectionsCurrentLocationPress,
        handleDirectionsDestinationClear,
        handleDirectionsDestinationChange,
        handleDirectionsFieldFocus,
        handleDirectionsModeDismiss,
        handleDirectionsModePress,
        handleDirectionsStartClear,
        handleDirectionsStartChange,
        handleDirectionsStopClear,
        handleDirectionsStopChange,
        handleDirectionsStopRemove,
        handleDirectionsSubmit,
        handleDirectionsSwapPress,
        handleDrawerPress,
        handleSearchBlur,
        handleSearchChange,
        handleSearchFocus,
        handleSearchSubmit,
        handleVoiceSearchPress,
        insets,
        mapPreferencesAreLoaded,
        searchGlassTintColor,
        searchIconColor,
        searchInputRef,
        searchIsFocused,
        searchPageIsVisible,
        searchPlaceholderColor,
        searchPrimaryIconColor,
        searchSource,
        searchMode,
        searchValue,
        selectedSearchResult,
        submittedSearchIsLoading,
        submittedSearchQuery,
        submittedSearchResults,
        trimmedSearchValue,
        voiceSearchIconColor,
        voiceSearchIsListening,
    } = useMapSearchContext();
    const searchModeIsDirections = searchMode === DIRECTIONS_MODE_DIRECTIONS;
    const fullScreenSearchIsVisible = searchModeIsDirections
        ? directionsSearchPageIsVisible
        : searchPageIsVisible;
    const selectedSearchDisplayValue =
        selectedSearchResult?.label || searchValue;
    const searchHasValue = Boolean(searchValue);
    const searchInputClearIsVisible =
        searchHasValue && (!selectedSearchResult || searchIsFocused);
    const searchSubmitIsVisible =
        Boolean(trimmedSearchValue) &&
        (!selectedSearchResult || searchIsFocused);
    const searchRightActionIsClear =
        Boolean(selectedSearchResult) && !searchIsFocused;
    const searchRightActionIsSubmit =
        !searchRightActionIsClear && searchSubmitIsVisible;
    const destinationCategoriesAreVisible =
        !searchModeIsDirections &&
        !fullScreenSearchIsVisible &&
        !searchIsFocused &&
        !searchHasValue &&
        !selectedSearchResult &&
        !directionsRoute &&
        !submittedSearchIsLoading &&
        !submittedSearchQuery &&
        submittedSearchResults.length === 0;
    const mapControlsAreVisible = Boolean(mapControls);
    const handleSelectedSearchDisplayPress = () => {
        handleSearchFocus();
        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };
    const bottomCtaPadding = Math.max((insets?.bottom ?? 0) + 10, 46);

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <>
            {!fullScreenSearchIsVisible ? (
                <Animated.View
                    className="z-50"
                    layout={MAP_OVERLAY_LAYOUT_ANIMATION}
                    pointerEvents="box-none"
                >
                    <SearchGlassShell
                        searchGlassTintColor={searchGlassTintColor}
                        searchSource={searchSource}
                    >
                        {searchModeIsDirections ? (
                            <View className="px-[14px] py-[14px]">
                                <View className="mb-[14px] flex-row items-center gap-2.5">
                                    <Pressable
                                        accessibilityLabel="Close directions mode"
                                        accessibilityRole="button"
                                        className="h-10 w-10 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                        onPress={handleDirectionsModeDismiss}
                                        testID={`map-directions-close-button-${searchSource}`}
                                    >
                                        <Icon
                                            color={searchPrimaryIconColor}
                                            name="chevron-left"
                                            size={22}
                                        />
                                    </Pressable>
                                    <Text
                                        className="font-dafDisplay text-lg font-bold text-daf-text-primary dark:text-white"
                                        testID={`map-directions-title-${searchSource}`}
                                    >
                                        Directions
                                    </Text>
                                </View>

                                <View className="flex-row items-stretch gap-2.5">
                                    <View className="relative w-3">
                                        <View className="dark:bg-daf-border-dark absolute bottom-[22px] left-[5px] top-[22px] w-0.5 rounded-dafPill bg-daf-border-strong" />
                                        <View className="flex-1 items-center justify-center">
                                            <View className="dark:border-daf-surface-dark h-[11px] w-[11px] rounded-dafPill border-2 border-white bg-daf-brand" />
                                        </View>
                                        {directionsStopIsVisible ? (
                                            <View className="flex-1 items-center justify-center">
                                                <View className="h-[11px] w-[11px] rounded-dafPill bg-daf-amber" />
                                            </View>
                                        ) : null}
                                        <View className="flex-1 items-center justify-center">
                                            <View className="h-[11px] w-[11px] rounded-[2px] bg-daf-violet" />
                                        </View>
                                    </View>

                                    <View className="min-w-0 flex-1 gap-2">
                                        <DirectionsField
                                            active={
                                                directionsActiveField ===
                                                DIRECTIONS_FIELD_START
                                            }
                                            accessibilityValueLabel={
                                                directionsStartWaypoint?.label ||
                                                directionsStartValue
                                            }
                                            clearAccessibilityLabel="Clear start location"
                                            clearTestID={`map-directions-start-clear-button-${searchSource}`}
                                            inputRef={directionsStartInputRef}
                                            label="Start"
                                            onChangeText={
                                                handleDirectionsStartChange
                                            }
                                            onClear={handleDirectionsStartClear}
                                            onFocus={() =>
                                                handleDirectionsFieldFocus(
                                                    DIRECTIONS_FIELD_START,
                                                )
                                            }
                                            placeholder="Choose start"
                                            searchPlaceholderColor={
                                                searchPlaceholderColor
                                            }
                                            testID={`map-directions-start-input-${searchSource}`}
                                            value={directionsStartValue}
                                        />
                                        {directionsStopIsVisible ? (
                                            <DirectionsField
                                                active={
                                                    directionsActiveField ===
                                                    DIRECTIONS_FIELD_STOP
                                                }
                                                accessibilityValueLabel={
                                                    directionsStopWaypoint?.label ||
                                                    directionsStopValue
                                                }
                                                clearAccessibilityLabel="Clear stop"
                                                clearTestID={`map-directions-stop-clear-button-${searchSource}`}
                                                inputRef={
                                                    directionsStopInputRef
                                                }
                                                label="Stop"
                                                onChangeText={
                                                    handleDirectionsStopChange
                                                }
                                                onClear={
                                                    handleDirectionsStopClear
                                                }
                                                onRemove={
                                                    handleDirectionsStopRemove
                                                }
                                                onFocus={() =>
                                                    handleDirectionsFieldFocus(
                                                        DIRECTIONS_FIELD_STOP,
                                                    )
                                                }
                                                placeholder="Add stop"
                                                removeAccessibilityLabel="Remove stop"
                                                removeTestID={`map-directions-stop-remove-button-${searchSource}`}
                                                searchPlaceholderColor={
                                                    searchPlaceholderColor
                                                }
                                                testID={`map-directions-stop-input-${searchSource}`}
                                                value={directionsStopValue}
                                            />
                                        ) : null}
                                        <DirectionsField
                                            active={
                                                directionsActiveField ===
                                                DIRECTIONS_FIELD_DESTINATION
                                            }
                                            accessibilityValueLabel={
                                                directionsDestinationWaypoint?.label ||
                                                directionsDestinationValue
                                            }
                                            clearAccessibilityLabel="Clear destination location"
                                            clearTestID={`map-directions-destination-clear-button-${searchSource}`}
                                            inputRef={
                                                directionsDestinationInputRef
                                            }
                                            label="Destination"
                                            onChangeText={
                                                handleDirectionsDestinationChange
                                            }
                                            onClear={
                                                handleDirectionsDestinationClear
                                            }
                                            onFocus={() =>
                                                handleDirectionsFieldFocus(
                                                    DIRECTIONS_FIELD_DESTINATION,
                                                )
                                            }
                                            placeholder="Choose destination"
                                            searchPlaceholderColor={
                                                searchPlaceholderColor
                                            }
                                            testID={`map-directions-destination-input-${searchSource}`}
                                            value={directionsDestinationValue}
                                        />
                                    </View>

                                    <View className="justify-center">
                                        <Pressable
                                            accessibilityLabel="Reverse start and destination"
                                            accessibilityRole="button"
                                            className="h-10 w-10 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                            onPress={handleDirectionsSwapPress}
                                            testID={`map-directions-swap-button-${searchSource}`}
                                        >
                                            <Icon
                                                color={searchPrimaryIconColor}
                                                name="arrow-left-right"
                                                size={20}
                                            />
                                        </Pressable>
                                    </View>
                                </View>

                                <View className="mt-3 flex-row gap-2">
                                    <DafChip
                                        onPress={
                                            handleDirectionsCurrentLocationPress
                                        }
                                        selected={Boolean(
                                            directionsCurrentLocationWaypoint,
                                        )}
                                        tone="light"
                                    >
                                        Current location
                                    </DafChip>
                                    <DafChip
                                        onPress={handleDirectionsAddStopPress}
                                        selected={directionsStopIsVisible}
                                        tone="light"
                                    >
                                        Add stop
                                    </DafChip>
                                </View>

                                {directionsPlaceIsLoading ? (
                                    <View
                                        accessibilityLabel="Loading place location"
                                        accessibilityRole="progressbar"
                                        className="dark:bg-daf-surface-dark mt-3 flex-row items-center gap-3 rounded-dafMd bg-daf-surface-alt px-3 py-3"
                                    >
                                        <ActivityIndicator
                                            color={searchIconColor}
                                            size="small"
                                        />
                                        <Text className="text-sm font-semibold text-daf-text-secondary dark:text-neutral-300">
                                            Loading place location
                                        </Text>
                                    </View>
                                ) : null}

                                {directionsPlaceError ||
                                directionsRouteError ? (
                                    <View className="mt-3 rounded-dafMd bg-red-50 px-3 py-3 dark:bg-red-950/30">
                                        <Text className="text-sm font-medium leading-5 text-red-700 dark:text-red-200">
                                            {directionsPlaceError ||
                                                directionsRouteError}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        ) : null}

                        {!searchModeIsDirections ? (
                            <View className="h-[52px] flex-row items-center gap-1 px-1.5">
                                <Pressable
                                    accessibilityHint="Opens or closes the navigation drawer."
                                    accessibilityLabel="Toggle menu"
                                    accessibilityRole="button"
                                    className="h-9 w-9 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                    onPress={handleDrawerPress}
                                    testID={`map-search-drawer-button-${searchSource}`}
                                >
                                    <Icon
                                        color={searchPrimaryIconColor}
                                        name="menu"
                                        size={20}
                                    />
                                </Pressable>

                                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                                    <Icon
                                        color={searchIconColor}
                                        name="search"
                                        size={17}
                                    />
                                    {selectedSearchResult &&
                                    !searchIsFocused ? (
                                        <Pressable
                                            accessibilityLabel="Edit selected location search"
                                            accessibilityRole="button"
                                            className="h-9 min-w-0 flex-1 justify-center"
                                            onPress={
                                                handleSelectedSearchDisplayPress
                                            }
                                            testID={`map-search-input-${searchSource}`}
                                        >
                                            <Text
                                                className="min-w-0 text-base font-medium leading-5 text-daf-text-primary dark:text-white"
                                                ellipsizeMode="tail"
                                                numberOfLines={1}
                                            >
                                                {selectedSearchDisplayValue}
                                            </Text>
                                        </Pressable>
                                    ) : (
                                        <TextInput
                                            ref={searchInputRef}
                                            accessibilityLabel="Search locations"
                                            className="h-9 min-w-0 flex-1 p-0 text-[15px] font-medium leading-5 text-daf-text-primary dark:text-white"
                                            multiline={false}
                                            numberOfLines={1}
                                            onBlur={handleSearchBlur}
                                            onChangeText={handleSearchChange}
                                            onFocus={handleSearchFocus}
                                            onSubmitEditing={handleSearchSubmit}
                                            placeholder="Where to?"
                                            placeholderTextColor={
                                                searchPlaceholderColor
                                            }
                                            returnKeyType="search"
                                            style={{
                                                height: 36,
                                                includeFontPadding: false,
                                                paddingBottom: 0,
                                                paddingLeft: 0,
                                                paddingRight: 0,
                                                paddingTop: 0,
                                                textAlignVertical: 'center',
                                            }}
                                            testID={`map-search-input-${searchSource}`}
                                            value={searchValue}
                                        />
                                    )}

                                    {searchInputClearIsVisible ? (
                                        <Pressable
                                            accessibilityLabel="Clear search"
                                            accessibilityRole="button"
                                            className="h-9 w-9 shrink-0 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                            hitSlop={6}
                                            onPress={
                                                handleClearSelectedSearchResult
                                            }
                                            testID={`map-search-inline-clear-button-${searchSource}`}
                                        >
                                            <Icon
                                                color={searchPlaceholderColor}
                                                name="x"
                                                size={16}
                                            />
                                        </Pressable>
                                    ) : null}

                                    {searchIsFocused ? (
                                        <Pressable
                                            accessibilityHint={
                                                voiceSearchIsListening
                                                    ? 'Stops listening and uses the current transcript.'
                                                    : 'Starts speech-to-text for location search.'
                                            }
                                            accessibilityLabel={
                                                voiceSearchIsListening
                                                    ? 'Stop voice search'
                                                    : 'Voice search'
                                            }
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected:
                                                    voiceSearchIsListening,
                                            }}
                                            className="h-9 w-9 shrink-0 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                            onPress={handleVoiceSearchPress}
                                            testID={`map-search-voice-button-${searchSource}`}
                                        >
                                            <Icon
                                                color={voiceSearchIconColor}
                                                name="mic"
                                                size={18}
                                            />
                                        </Pressable>
                                    ) : null}
                                </View>

                                <View className="dark:bg-daf-border-glass-dark h-6 w-px bg-daf-border-glass" />
                                <Pressable
                                    accessibilityLabel={
                                        searchRightActionIsClear
                                            ? 'Clear search result'
                                            : searchRightActionIsSubmit
                                              ? 'Submit search'
                                              : 'Open directions'
                                    }
                                    accessibilityRole="button"
                                    accessibilityState={
                                        searchRightActionIsSubmit
                                            ? { busy: submittedSearchIsLoading }
                                            : undefined
                                    }
                                    className="h-9 w-9 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                    onPress={
                                        searchRightActionIsClear
                                            ? handleClearSelectedSearchResult
                                            : searchRightActionIsSubmit
                                              ? handleSearchSubmit
                                              : handleDirectionsModePress
                                    }
                                    testID={
                                        searchRightActionIsClear
                                            ? `map-search-clear-button-${searchSource}`
                                            : searchRightActionIsSubmit
                                              ? `map-search-submit-button-${searchSource}`
                                              : `map-search-directions-button-${searchSource}`
                                    }
                                >
                                    {searchRightActionIsSubmit &&
                                    submittedSearchIsLoading ? (
                                        <ActivityIndicator
                                            color={searchPrimaryIconColor}
                                            size="small"
                                        />
                                    ) : (
                                        <Icon
                                            color={searchPrimaryIconColor}
                                            name={
                                                searchRightActionIsClear
                                                    ? 'x'
                                                    : searchRightActionIsSubmit
                                                      ? 'arrow-right'
                                                      : 'corner-up-right'
                                            }
                                            size={20}
                                        />
                                    )}
                                </Pressable>
                            </View>
                        ) : null}
                    </SearchGlassShell>
                </Animated.View>
            ) : null}

            {!fullScreenSearchIsVisible &&
            (destinationCategoriesAreVisible || mapControlsAreVisible) ? (
                <Animated.View
                    className="z-50 mt-2.5 flex-row items-start gap-3"
                    collapsable={false}
                    layout={MAP_OVERLAY_LAYOUT_ANIMATION}
                    pointerEvents="box-none"
                >
                    {destinationCategoriesAreVisible ? (
                        <DestinationCategoryPills
                            onCategoryPress={handleDestinationCategoryPress}
                            searchSource={searchSource}
                        />
                    ) : (
                        <View className="min-w-0 flex-1" pointerEvents="none" />
                    )}

                    {mapControlsAreVisible ? (
                        <View
                            className="shrink-0 items-center"
                            pointerEvents="box-none"
                        >
                            {mapControls}
                        </View>
                    ) : null}
                </Animated.View>
            ) : null}

            {searchModeIsDirections && !fullScreenSearchIsVisible ? (
                <Animated.View
                    className="absolute bottom-0 left-3 right-3 z-50"
                    layout={MAP_OVERLAY_LAYOUT_ANIMATION}
                    pointerEvents="box-none"
                    style={{ paddingBottom: bottomCtaPadding }}
                >
                    <DafButton
                        accessibilityLabel="Get directions on the map"
                        disabled={!directionsRouteCanSubmit}
                        icon="navigation"
                        loading={directionsRouteIsLoading}
                        onPress={handleDirectionsSubmit}
                        size="lg"
                        testID={`map-directions-submit-button-${searchSource}`}
                    >
                        Get directions
                    </DafButton>
                </Animated.View>
            ) : null}
        </>
    );
}
