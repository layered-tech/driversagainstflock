import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import {
    DIRECTIONS_FIELD_START,
    DIRECTIONS_FIELD_STOP,
    DIRECTIONS_MODE_DIRECTIONS,
} from './directions';
import { DirectionsCurrentLocationOption } from './directions-current-location-option';
import { GoogleResultsFooter } from './google-results-footer';
import { useMapSearchContext } from './map-screen-context';
import { PlaceSearchResultRow } from './place-search-result-row';
import { PrimaryLocationCards } from './primary-location-cards';
import { getPrimaryLocationLabel } from './primary-locations';
import { SavedLocationSection } from './saved-location-section';
import { SubmittedSearchResultRow } from './submitted-search-result-row';

function SearchSection({ children, title, visible = true }) {
    if (!visible) {
        return null;
    }

    return (
        <View>
            <Text className="px-4 pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                {title}
            </Text>
            <View>{children}</View>
        </View>
    );
}

function EmptyMessage({ children }) {
    return (
        <View className="px-4 py-3">
            <Text className="text-sm font-medium text-daf-text-tertiary dark:text-neutral-400">
                {children}
            </Text>
        </View>
    );
}

export function MapFullScreenSearch() {
    const insets = useSafeAreaInsets();
    const {
        directionsActiveField,
        directionsCurrentLocationWaypoint,
        directionsDestinationValue,
        directionsSearchError,
        directionsSearchIsFocused,
        directionsSearchIsLoading,
        directionsSearchPageIsVisible,
        directionsSearchResults,
        directionsStartValue,
        directionsStopValue,
        directionsTrimmedSearchValue,
        favoriteLocations,
        handleDirectionsCurrentLocationPress,
        handleDirectionsDestinationChange,
        handleDirectionsSavedLocationPress,
        handleDirectionsSearchDismiss,
        handleDirectionsSearchResultPress,
        handleDirectionsStartChange,
        handleDirectionsStopChange,
        handlePrimaryLocationPress,
        handlePrimaryLocationUnset,
        handlePrimaryLocationSetupDismiss,
        handleSavedLocationPress,
        handleSearchChange,
        handleSearchDismiss,
        handleSearchResultPress,
        handleSearchSubmit,
        handleSubmittedSearchResultPress,
        localitySearchError,
        localitySearchIsLoading,
        mapPreferencesAreLoaded,
        primaryLocations,
        primaryLocationSaveError,
        primaryLocationTypeBeingSet,
        recentLocations,
        savedLocationsAreLoaded,
        searchFavoriteLocations,
        searchRecentLocations,
        searchError,
        searchIconColor,
        searchIsFocused,
        searchIsLoading,
        searchMode,
        searchPageIsVisible,
        searchPlaceholderColor,
        searchPrimaryIconColor,
        searchResults,
        searchSource,
        searchValue,
        submittedSearchError,
        submittedSearchIsLoading,
        submittedSearchQuery,
        submittedSearchResults,
        trimmedSearchValue,
        voiceSearchError,
        voiceSearchIsListening,
    } = useMapSearchContext();
    const searchModeIsDirections = searchMode === DIRECTIONS_MODE_DIRECTIONS;
    const primaryLocationSetupIsActive = Boolean(
        !searchModeIsDirections && primaryLocationTypeBeingSet,
    );
    const visible = searchModeIsDirections
        ? directionsSearchPageIsVisible
        : searchPageIsVisible;
    const handlePrimaryLocationLongPress = (type) => {
        const label = getPrimaryLocationLabel(type);

        Alert.alert(
            `Unset ${label}?`,
            `This removes your saved ${label.toLowerCase()} location. You can set a new ${label.toLowerCase()} location whenever you are ready.`,
            [
                { style: 'cancel', text: 'Cancel' },
                {
                    onPress: () => handlePrimaryLocationUnset(type),
                    style: 'destructive',
                    text: `Unset ${label}`,
                },
            ],
        );
    };

    if (!mapPreferencesAreLoaded || !visible) {
        return null;
    }

    const savedSections = [
        {
            icon: 'heart',
            items: searchModeIsDirections
                ? favoriteLocations
                : searchFavoriteLocations,
            key: 'favorites',
            label: 'Favorites',
            onPress: searchModeIsDirections
                ? handleDirectionsSavedLocationPress
                : handleSavedLocationPress,
        },
        {
            icon: 'clock',
            items: searchModeIsDirections
                ? recentLocations
                : searchRecentLocations,
            key: 'recent',
            label: 'Recent',
            onPress: searchModeIsDirections
                ? handleDirectionsSavedLocationPress
                : handleSavedLocationPress,
        },
    ].filter((section) => section.items.length > 0);
    const directionsValue =
        directionsActiveField === DIRECTIONS_FIELD_START
            ? directionsStartValue
            : directionsActiveField === DIRECTIONS_FIELD_STOP
              ? directionsStopValue
              : directionsDestinationValue;
    const directionsPlaceholder =
        directionsActiveField === DIRECTIONS_FIELD_START
            ? 'Choose start'
            : directionsActiveField === DIRECTIONS_FIELD_STOP
              ? 'Add stop'
              : 'Choose destination';
    const handleDirectionsChange =
        directionsActiveField === DIRECTIONS_FIELD_START
            ? handleDirectionsStartChange
            : directionsActiveField === DIRECTIONS_FIELD_STOP
              ? handleDirectionsStopChange
              : handleDirectionsDestinationChange;
    const searchQuery = searchModeIsDirections
        ? directionsTrimmedSearchValue
        : trimmedSearchValue;
    const inputValue = searchModeIsDirections ? directionsValue : searchValue;
    const inputPlaceholder = searchModeIsDirections
        ? directionsPlaceholder
        : primaryLocationSetupIsActive
          ? 'Search or enter address'
          : 'Where to?';
    const inputAccessibilityLabel = searchModeIsDirections
        ? `Search ${directionsPlaceholder.toLowerCase()}`
        : primaryLocationSetupIsActive
          ? `Search for ${getPrimaryLocationLabel(primaryLocationTypeBeingSet)}`
          : 'Search locations';
    const cancelHandler = searchModeIsDirections
        ? handleDirectionsSearchDismiss
        : handleSearchDismiss;
    const changeHandler = searchModeIsDirections
        ? handleDirectionsChange
        : handleSearchChange;
    const submitHandler = searchModeIsDirections
        ? undefined
        : handleSearchSubmit;
    const submittedResultsAreVisible =
        !searchModeIsDirections &&
        (submittedSearchIsLoading ||
            Boolean(submittedSearchQuery) ||
            submittedSearchResults.length > 0 ||
            Boolean(submittedSearchError));
    const submittedResultCount = submittedSearchResults.length;
    const submittedResultCountLabel = submittedSearchQuery
        ? `${submittedResultCount} ${
              submittedResultCount === 1 ? 'place' : 'places'
          } for "${submittedSearchQuery}"`
        : `${submittedResultCount} ${
              submittedResultCount === 1 ? 'place' : 'places'
          }`;
    const autocompleteResultsAreVisible = searchModeIsDirections
        ? directionsSearchIsFocused
        : searchIsFocused;
    const currentLocationIsVisible =
        searchModeIsDirections &&
        directionsCurrentLocationWaypoint &&
        (!directionsTrimmedSearchValue ||
            'current location'.includes(
                directionsTrimmedSearchValue.toLowerCase(),
            ));
    const autocompleteError = searchModeIsDirections
        ? directionsSearchError
        : searchError;
    const autocompleteIsLoading = searchModeIsDirections
        ? directionsSearchIsLoading
        : searchIsLoading;
    const autocompleteResults = searchModeIsDirections
        ? directionsSearchResults
        : searchResults;
    const primaryLocationCardsAreVisible =
        !searchModeIsDirections &&
        !primaryLocationSetupIsActive &&
        savedLocationsAreLoaded &&
        !searchQuery &&
        !submittedResultsAreVisible;

    return (
        <View
            className="absolute inset-0 z-[90] bg-daf-surface-page dark:bg-[#0B0E12]"
            testID={`map-full-screen-search-${searchSource}`}
        >
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark gap-4 border-b border-daf-border bg-white px-4"
                style={{
                    paddingBottom: 14,
                    paddingTop: insets.top + 12,
                }}
            >
                {primaryLocationSetupIsActive ? (
                    <View className="flex-row items-center gap-2">
                        <Pressable
                            accessibilityLabel="Back to saved locations"
                            accessibilityRole="button"
                            className="h-11 w-11 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                            onPress={handlePrimaryLocationSetupDismiss}
                            testID={`map-primary-location-setup-back-${searchSource}`}
                        >
                            <Icon
                                color={searchPrimaryIconColor}
                                name="chevron-left"
                                size={22}
                            />
                        </Pressable>
                        <Text
                            className="font-dafDisplay min-w-0 flex-1 text-[17px] font-semibold text-daf-text-primary dark:text-white"
                            numberOfLines={1}
                        >
                            Set{' '}
                            {getPrimaryLocationLabel(
                                primaryLocationTypeBeingSet,
                            )}
                        </Text>
                        <Pressable
                            accessibilityLabel="Cancel setting saved location"
                            accessibilityRole="button"
                            className="min-h-11 justify-center px-1"
                            onPress={handleSearchDismiss}
                        >
                            <Text className="text-[15px] font-semibold text-daf-text-brand dark:text-daf-brand">
                                Cancel
                            </Text>
                        </Pressable>
                    </View>
                ) : null}

                <View className="flex-row items-center gap-2">
                    <View className="dark:border-daf-border-dark min-w-0 flex-1 flex-row items-center gap-2 rounded-dafPill border border-daf-border bg-daf-surface-alt px-3 dark:bg-daf-surface-inverse">
                        <Icon color={searchIconColor} name="search" size={18} />
                        <TextInput
                            accessibilityLabel={inputAccessibilityLabel}
                            autoFocus
                            className="h-11 min-w-0 flex-1 p-0 text-[16px] font-medium text-daf-text-primary dark:text-white"
                            onChangeText={changeHandler}
                            onSubmitEditing={submitHandler}
                            placeholder={inputPlaceholder}
                            placeholderTextColor={searchPlaceholderColor}
                            returnKeyType={
                                searchModeIsDirections ? 'done' : 'search'
                            }
                            style={{
                                includeFontPadding: false,
                                paddingBottom: 0,
                                paddingLeft: 0,
                                paddingRight: 0,
                                paddingTop: 0,
                            }}
                            testID={`map-full-screen-search-input-${searchSource}`}
                            value={inputValue}
                        />
                        {inputValue ? (
                            <Pressable
                                accessibilityLabel="Clear search"
                                accessibilityRole="button"
                                className="h-8 w-8 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                onPress={() => changeHandler('')}
                            >
                                <Icon
                                    color={searchPlaceholderColor}
                                    name="x"
                                    size={16}
                                />
                            </Pressable>
                        ) : null}
                    </View>
                    {!primaryLocationSetupIsActive ? (
                        <Pressable
                            accessibilityLabel="Cancel search"
                            accessibilityRole="button"
                            className="min-h-11 justify-center px-1"
                            onPress={cancelHandler}
                            testID={`map-full-screen-search-cancel-${searchSource}`}
                        >
                            <Text className="text-[15px] font-semibold text-daf-text-brand dark:text-daf-brand">
                                Cancel
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>

            <ScrollView
                className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
                contentContainerStyle={{
                    paddingBottom: Math.max(insets.bottom + 24, 38),
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {voiceSearchIsListening ? (
                    <View className="flex-row items-center gap-3 rounded-dafMd bg-red-50 px-3 py-3 dark:bg-red-950/30">
                        <ActivityIndicator color="#FF4D4F" size="small" />
                        <Text className="text-sm font-semibold text-red-700 dark:text-red-200">
                            Listening for a place
                        </Text>
                    </View>
                ) : null}

                {voiceSearchError ||
                localitySearchError ||
                primaryLocationSaveError ? (
                    <Text
                        accessibilityLiveRegion="polite"
                        className="rounded-dafMd bg-red-50 px-3 py-3 text-sm font-medium leading-5 text-red-700 dark:bg-red-950/30 dark:text-red-200"
                        selectable
                    >
                        {voiceSearchError ||
                            localitySearchError ||
                            primaryLocationSaveError}
                    </Text>
                ) : null}

                {localitySearchIsLoading ? (
                    <View className="dark:bg-daf-surface-dark flex-row items-center gap-3 rounded-dafMd bg-daf-surface-alt px-3 py-3">
                        <ActivityIndicator
                            color={searchPrimaryIconColor}
                            size="small"
                        />
                        <Text className="text-sm font-semibold text-daf-text-secondary dark:text-neutral-300">
                            Looking up ZIP boundary
                        </Text>
                    </View>
                ) : null}

                {primaryLocationCardsAreVisible ? (
                    <PrimaryLocationCards
                        onLocationLongPress={handlePrimaryLocationLongPress}
                        onLocationPress={handlePrimaryLocationPress}
                        primaryLocations={primaryLocations}
                        searchSource={searchSource}
                    />
                ) : null}

                {currentLocationIsVisible ? (
                    <SearchSection title="Top result">
                        <DirectionsCurrentLocationOption
                            onPress={handleDirectionsCurrentLocationPress}
                            searchIconColor={searchIconColor}
                            searchSource={searchSource}
                        />
                    </SearchSection>
                ) : null}

                {submittedResultsAreVisible ? (
                    <SearchSection title="Top result">
                        {submittedSearchQuery ? (
                            <Text
                                className="px-4 pb-1 text-xs font-semibold text-daf-text-tertiary dark:text-neutral-400"
                                numberOfLines={1}
                                testID="submitted-search-result-count"
                            >
                                {submittedResultCountLabel}
                            </Text>
                        ) : null}
                        {submittedSearchError ? (
                            <Text className="rounded-dafMd bg-red-50 px-3 py-3 text-sm font-medium leading-5 text-red-700 dark:bg-red-950/30 dark:text-red-200">
                                {submittedSearchError}
                            </Text>
                        ) : null}
                        {submittedSearchIsLoading ? (
                            <View className="flex-row items-center gap-3 px-4 py-3">
                                <ActivityIndicator
                                    color={searchPrimaryIconColor}
                                    size="small"
                                />
                                <Text className="text-sm font-semibold text-daf-text-secondary dark:text-neutral-300">
                                    Searching places
                                </Text>
                            </View>
                        ) : null}
                        {!submittedSearchIsLoading &&
                        !submittedSearchError &&
                        submittedSearchResults.length === 0 &&
                        submittedSearchQuery ? (
                            <EmptyMessage>No places found nearby</EmptyMessage>
                        ) : null}
                        {submittedSearchResults.map((result, index) => (
                            <SubmittedSearchResultRow
                                key={`${result.id}-${index}`}
                                highlightQuery={submittedSearchQuery}
                                index={index}
                                onPress={handleSubmittedSearchResultPress}
                                result={result}
                                searchIconColor={searchIconColor}
                            />
                        ))}
                    </SearchSection>
                ) : null}

                {autocompleteResultsAreVisible && searchQuery ? (
                    <SearchSection
                        title={
                            submittedResultsAreVisible
                                ? 'Suggestions'
                                : 'Top result'
                        }
                    >
                        {autocompleteError ? (
                            <Text className="rounded-dafMd bg-red-50 px-3 py-3 text-sm font-medium leading-5 text-red-700 dark:bg-red-950/30 dark:text-red-200">
                                {autocompleteError}
                            </Text>
                        ) : null}
                        {autocompleteIsLoading ? (
                            <GoogleResultsFooter
                                isLoading
                                searchIconColor={searchIconColor}
                                visible
                            />
                        ) : null}
                        {autocompleteResults.map((result, index) => (
                            <PlaceSearchResultRow
                                key={`${result.id}-${index}`}
                                highlightQuery={searchQuery}
                                index={index}
                                onPress={
                                    searchModeIsDirections
                                        ? handleDirectionsSearchResultPress
                                        : handleSearchResultPress
                                }
                                result={result}
                                searchIconColor={searchIconColor}
                                searchSource={searchSource}
                                testIDPrefix={
                                    searchModeIsDirections
                                        ? 'map-directions-search-result'
                                        : 'map-search-result'
                                }
                            />
                        ))}
                    </SearchSection>
                ) : null}

                {savedSections.map((section) => (
                    <SavedLocationSection
                        key={section.key}
                        icon={section.icon}
                        items={section.items}
                        label={section.label}
                        onLocationPress={section.onPress}
                        searchIconColor={searchIconColor}
                        searchSource={searchSource}
                        sectionKey={
                            searchModeIsDirections
                                ? `directions-${section.key}`
                                : section.key
                        }
                    />
                ))}

                {savedSections.length === 0 &&
                !searchQuery &&
                !submittedResultsAreVisible ? (
                    <EmptyMessage>
                        No recent or favorite locations yet
                    </EmptyMessage>
                ) : null}
            </ScrollView>
        </View>
    );
}
