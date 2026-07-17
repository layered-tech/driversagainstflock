import { Text, TextInput, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { LocationAcquisitionView } from './location-acquisition-view';
import { usePermissionSheetContext } from './map-screen-context';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from './native-components';

export function LocationPermissionSheet() {
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        bottomSheetAnimatedPosition,
        bottomSheetRef,
        insets,
        handleLocationAccessSearchChange,
        handleLocationAccessSearchSubmit,
        isLocating,
        isRequestingLocation,
        localitySearchError,
        localitySearchIsLoading,
        locationAccessSearchValue,
        locationAccessGranted,
        locationError,
        mapPreferencesAreLoaded,
        permissionError,
        permissionSheetTrackingHandlers,
        requestLocationAccess,
        retryCurrentLocation,
        userLocation,
        renderBackdrop,
    } = usePermissionSheetContext();
    const handleContinueWithoutLocation = () => {
        bottomSheetRef.current?.dismiss?.();
    };
    const handleAreaSearchPress = () => {
        if (handleLocationAccessSearchSubmit?.()) {
            bottomSheetRef.current?.dismiss?.();
        }
    };

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <NativeWindBottomSheetModal
            ref={bottomSheetRef}
            enableDynamicSizing={false}
            snapPoints={['100%']}
            enablePanDownToClose={!isRequestingLocation && !isLocating}
            backdropComponent={renderBackdrop}
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            animatedPosition={bottomSheetAnimatedPosition}
            onAnimate={permissionSheetTrackingHandlers.onAnimate}
            onChange={permissionSheetTrackingHandlers.onChange}
            onDismiss={permissionSheetTrackingHandlers.onDismiss}
        >
            <NativeWindBottomSheetView
                className="dark:bg-daf-surface-dark flex-1 gap-[22px] bg-white px-[22px]"
                style={{
                    paddingBottom: insets.bottom + 16,
                    paddingTop: Math.max(insets.top + 46, 80),
                }}
            >
                {locationAccessGranted ? (
                    <LocationAcquisitionView
                        isLocating={isLocating}
                        locationError={locationError}
                        retryCurrentLocation={retryCurrentLocation}
                        userLocation={userLocation}
                    />
                ) : (
                    <>
                        <View className="bg-daf-brand/12 dark:bg-daf-brand/15 h-[58px] w-[58px] items-center justify-center self-start rounded-dafLg">
                            <Icon color="#0F7D45" name="map-pin" size={28} />
                        </View>
                        <View className="gap-3">
                            <Text className="font-dafDisplay text-[32px] font-bold leading-[37px] text-daf-text-primary dark:text-white">
                                Works with or without your location
                            </Text>
                            <Text className="text-[17px] leading-[26px] text-daf-text-secondary dark:text-neutral-300">
                                Turn on location for live routing and nearby
                                cameras. Or skip it - you can still search,
                                browse the map, and look up any ZIP. No account,
                                no tracking, either way.
                            </Text>
                        </View>

                        {permissionError ? (
                            <Text className="rounded-dafMd bg-red-50 px-3 py-2 text-sm leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                                {permissionError}
                            </Text>
                        ) : null}

                        <DafButton
                            accessibilityLabel="Allow location access"
                            disabled={isRequestingLocation || isLocating}
                            loading={isRequestingLocation || isLocating}
                            icon="locate-fixed"
                            onPress={requestLocationAccess}
                            size="lg"
                        >
                            Allow location access
                        </DafButton>

                        <DafButton
                            accessibilityLabel="Continue without location"
                            onPress={handleContinueWithoutLocation}
                            size="lg"
                            variant="secondary"
                        >
                            Continue without location
                        </DafButton>

                        <View className="flex-row items-center gap-3">
                            <View className="dark:bg-daf-border-dark h-px flex-1 bg-daf-border" />
                            <Text className="text-xs font-medium text-daf-text-tertiary dark:text-neutral-500">
                                or look up an area
                            </Text>
                            <View className="dark:bg-daf-border-dark h-px flex-1 bg-daf-border" />
                        </View>

                        <View className="flex-row gap-2">
                            <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-1 flex-row items-center gap-2 rounded-dafSm border border-daf-border bg-white px-[14px]">
                                <Icon color="#828D9B" name="search" size={18} />
                                <TextInput
                                    accessibilityLabel="Search a place or ZIP"
                                    className="h-hitComfy min-w-0 flex-1 p-0 text-[15px] font-medium text-daf-text-primary dark:text-white"
                                    editable={!localitySearchIsLoading}
                                    onChangeText={
                                        handleLocationAccessSearchChange
                                    }
                                    onSubmitEditing={handleAreaSearchPress}
                                    placeholder="Search a place or ZIP"
                                    placeholderTextColor="#828D9B"
                                    returnKeyType="search"
                                    style={{
                                        includeFontPadding: false,
                                        paddingBottom: 0,
                                        paddingLeft: 0,
                                        paddingRight: 0,
                                        paddingTop: 0,
                                    }}
                                    testID="location-permission-area-search-input"
                                    value={locationAccessSearchValue}
                                />
                            </View>
                            <DafButton
                                accessibilityLabel="Search a place or ZIP"
                                disabled={
                                    localitySearchIsLoading ||
                                    !locationAccessSearchValue.trim()
                                }
                                loading={localitySearchIsLoading}
                                onPress={handleAreaSearchPress}
                                size="md"
                                testID="location-permission-area-search-submit"
                                variant="secondary"
                            >
                                Go
                            </DafButton>
                        </View>

                        {localitySearchError ? (
                            <Text className="rounded-dafMd bg-red-50 px-3 py-2 text-sm leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                                {localitySearchError}
                            </Text>
                        ) : null}

                        <Text className="text-center text-xs font-semibold text-daf-text-tertiary dark:text-neutral-500">
                            We never sell or share your location.
                        </Text>
                    </>
                )}
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
