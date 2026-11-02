import { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useVerticalBarEdgeIOS } from 'expo-status-bar';

const DuoDeviceContext = createContext(false);
export const DuoPaneContentContext = createContext(false);
export const DuoPaneSizeContext = createContext(null);

export function DuoDeviceProvider({ children }) {
    const edge = useVerticalBarEdgeIOS();
    const { width, height } = useWindowDimensions();
    const expandedPhone = !Platform.isPad && Math.min(width, height) >= 600;
    const identifiedDuo =
        Platform.OS === 'ios' && (Boolean(edge) || expandedPhone);
    const expandedAndroid = Platform.OS === 'android' && expandedPhone;
    const [observedDuo, setObservedDuo] = useState(false);
    useEffect(() => {
        if (identifiedDuo) setObservedDuo(true);
    }, [identifiedDuo]);
    return (
        <DuoDeviceContext.Provider
            value={
                expandedAndroid ||
                (Platform.OS === 'ios' && (observedDuo || identifiedDuo))
            }
        >
            {children}
        </DuoDeviceContext.Provider>
    );
}

export function useDuoDevice() {
    return useContext(DuoDeviceContext);
}

export function useDuoPaneContent() {
    return useContext(DuoPaneContentContext);
}
