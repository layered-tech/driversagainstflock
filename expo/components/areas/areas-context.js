import { router } from 'expo-router';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AppState } from 'react-native';
import {
    getPrivateCacheItem,
    removePrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import { createAreaBoundaryCache } from './area-boundary-cache';
import { areaRequest, hasAreaDevice } from './areas-api';
import { notificationRoute } from './area-geometry';
import {
    notificationsModule,
    registerAreaNotifications,
} from './area-notifications';

const AreasContext = createContext(null);
export function AreasProvider({ children }) {
    const [areas, setAreas] = useState([]);
    const [cachedAreas, setCachedAreas] = useState([]);
    const cacheActive = useRef(true);
    const boundaryCache = useMemo(
        () =>
            createAreaBoundaryCache({
                storage: {
                    getItem: getPrivateCacheItem,
                    setItem: setPrivateCacheItem,
                    removeItem: removePrivateCacheItem,
                },
                hasDevice: hasAreaDevice,
                onChange: (saved) => {
                    if (cacheActive.current) setCachedAreas(saved);
                },
            }),
        [],
    );
    const rememberAreaBoundary = useCallback(
        (area) => {
            boundaryCache.remember(area).catch(() => {});
        },
        [boundaryCache],
    );
    useEffect(() => {
        cacheActive.current = true;
        boundaryCache.load().catch(() => {});
        return () => {
            cacheActive.current = false;
        };
    }, [boundaryCache]);
    const [timeWindow, setTimeWindow] = useState('7');
    const requestVersion = useRef(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const pending = useRef(null);
    const refresh = useCallback(
        async ({ initialize = true } = {}) => {
            if (pending.current?.window === timeWindow)
                return pending.current.promise;
            if (!initialize && !(await hasAreaDevice())) return;
            setLoading(true);
            const version = ++requestVersion.current;
            const promise = areaRequest(`?window=${timeWindow}`)
                .then((result) => {
                    if (version !== requestVersion.current) return;
                    setAreas(result.areas);
                    boundaryCache.replace(result.areas).catch(() => {});
                    setError(null);
                    return result.areas;
                })
                .catch((failure) => {
                    if (version === requestVersion.current)
                        setError(failure.message);
                })
                .finally(() => {
                    if (version === requestVersion.current) {
                        setLoading(false);
                        pending.current = null;
                    }
                });
            pending.current = { window: timeWindow, promise };
            return promise;
        },
        [timeWindow, boundaryCache],
    );
    const saveArea = useCallback(
        async (input) => {
            const { area } = await areaRequest('', {
                method: 'POST',
                body: input,
            });
            rememberAreaBoundary(area);
            requestVersion.current++;
            pending.current = null;
            setLoading(false);
            setAreas((current) => [
                ...current.filter((item) => item.id !== area.id),
                area,
            ]);
            return area;
        },
        [rememberAreaBoundary],
    );
    const updateArea = useCallback(
        async (id, values) => {
            const { area } = await areaRequest(`/${id}`, {
                method: 'PATCH',
                body: values,
            });
            rememberAreaBoundary(area);
            requestVersion.current++;
            pending.current = null;
            setLoading(false);
            setAreas((current) =>
                current.map((item) =>
                    item.id === area.id
                        ? {
                              ...area,
                              counts: item.counts,
                              unread_count: item.unread_count,
                          }
                        : item,
                ),
            );
            return area;
        },
        [rememberAreaBoundary],
    );
    const removeArea = useCallback(
        async (id) => {
            await areaRequest(`/${id}`, { method: 'DELETE' });
            boundaryCache.remove(id).catch(() => {});
            requestVersion.current++;
            pending.current = null;
            setLoading(false);
            setAreas((current) =>
                current.filter((area) => area.id !== Number(id)),
            );
        },
        [boundaryCache],
    );
    const markRead = useCallback(
        async (id, throughId) => {
            await areaRequest(`/${id}/read`, {
                method: 'POST',
                body: { through_id: throughId },
            });
            await refresh();
        },
        [refresh],
    );
    useEffect(() => {
        const sync = () => {
            refresh({ initialize: false });
            hasAreaDevice()
                .then((exists) => (exists ? registerAreaNotifications() : null))
                .catch(() => {});
        };
        sync();
        const listener = AppState.addEventListener('change', (state) => {
            if (state === 'active') sync();
        });
        const timer = setInterval(() => {
            if (AppState.currentState === 'active')
                refresh({ initialize: false });
        }, 60000);
        const notifications = notificationsModule();
        let active = true;
        let lastResponseId;
        const onResponse = (response) => {
            const id = response?.notification?.request?.identifier;
            const route = notificationRoute(
                response?.notification?.request?.content?.data,
            );
            if (active && route && id !== lastResponseId) {
                lastResponseId = id;
                router.push(route);
                notifications.clearLastNotificationResponseAsync();
            }
        };
        notifications?.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });
        notifications
            ?.getLastNotificationResponseAsync()
            .then(onResponse)
            .catch(() => {});
        const responseListener =
            notifications?.addNotificationResponseReceivedListener(onResponse);
        const receivedListener = notifications?.addNotificationReceivedListener(
            () => refresh({ initialize: false }),
        );
        const tokenListener = notifications?.addPushTokenListener(
            (devicePushToken) =>
                registerAreaNotifications({ devicePushToken }).catch(() => {}),
        );
        return () => {
            active = false;
            listener.remove();
            clearInterval(timer);
            responseListener?.remove();
            receivedListener?.remove();
            tokenListener?.remove();
        };
    }, [refresh]);
    return (
        <AreasContext.Provider
            value={{
                areas,
                cachedAreas,
                rememberAreaBoundary,
                timeWindow,
                setTimeWindow,
                loading,
                error,
                refresh,
                saveArea,
                updateArea,
                removeArea,
                markRead,
                unreadCount: areas.reduce(
                    (sum, area) => sum + area.unread_count,
                    0,
                ),
            }}
        >
            {children}
        </AreasContext.Provider>
    );
}
export function useAreas() {
    return useContext(AreasContext);
}
