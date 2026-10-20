import {
    router,
    useFocusEffect,
    useIsFocused,
    useLocalSearchParams,
} from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { CameraForm } from './camera-form';
import { useContribute } from './contribute-state';

export default function CameraDetailsScreen() {
    const params = useLocalSearchParams();
    const screenIsFocused = useIsFocused();
    const {
        pins,
        removals,
        updatePinDetails,
        updatePinLocation,
        removePin,
        continueOnMap,
        tour,
    } = useContribute();
    const index = Number(
        Array.isArray(params.index) ? params.index[0] : (params.index ?? 0),
    );
    const pin = Number.isInteger(index) && index >= 0 ? pins[index] : undefined;
    const currentCameraRef = useRef({ pin, removalCount: removals.length });
    currentCameraRef.current = { pin, removalCount: removals.length };
    const handleBackPress = useCallback(() => {
        const currentPin = currentCameraRef.current.pin;
        if (currentPin?.details.staged === false) removePin(currentPin.id);
        continueOnMap();
        router.navigate('/');
    }, [removePin, continueOnMap]);
    useFocusEffect(
        useCallback(() => {
            const currentCamera = currentCameraRef.current;
            if (!currentCamera.pin) {
                router.replace(
                    currentCamera.removalCount ? '/contribute/changeset' : '/',
                );
                return undefined;
            }
            const subscription = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    handleBackPress();
                    return true;
                },
            );
            return () => subscription.remove();
        }, [pin, removals.length, handleBackPress]),
    );
    if (!pin) return null;
    return (
        <CameraForm
            pin={pin}
            tour={tour}
            screenIsFocused={screenIsFocused}
            onDetailsChange={(patch) => updatePinDetails(pin.id, patch)}
            onLocationChange={(location) => updatePinLocation(pin.id, location)}
            onBack={handleBackPress}
            onSave={() => {
                updatePinDetails(pin.id, { staged: true });
                tour.dismissPhase('camera');
                continueOnMap();
                router.navigate('/');
            }}
        />
    );
}
