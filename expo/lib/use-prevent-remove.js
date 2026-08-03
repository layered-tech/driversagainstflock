import { useNavigation } from 'expo-router';
import { useEffect } from 'react';

export function usePreventRemove(preventRemove, callback) {
    const navigation = useNavigation();

    useEffect(() => {
        if (!preventRemove) {
            return undefined;
        }

        return navigation.addListener('beforeRemove', (event) => {
            event.preventDefault();
            callback({ data: event.data });
        });
    }, [callback, navigation, preventRemove]);
}
