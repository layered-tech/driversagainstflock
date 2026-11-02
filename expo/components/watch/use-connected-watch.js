import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function useConnectedWatch(active) {
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!active || Platform.OS !== 'android') {
            setConnected(false);
            return;
        }
        const companion = requireOptionalNativeModule('WatchCompanion');
        if (!companion?.hasConnectedWatch) return;
        let mounted = true;
        const refresh = () => {
            companion
                .hasConnectedWatch()
                .then((value) => {
                    if (mounted) setConnected(value === true);
                })
                .catch(() => {
                    if (mounted) setConnected(false);
                });
        };
        refresh();
        const timer = setInterval(refresh, 5_000);
        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, [active]);

    return connected;
}
