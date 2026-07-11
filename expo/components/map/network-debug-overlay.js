import { Text, useWindowDimensions, View } from 'react-native';
import { useNetworkDebugRequests } from '../../lib/network-debug';

const MAX_VISIBLE_NETWORK_DEBUG_REQUESTS = 8;
const NETWORK_DEBUG_OVERLAY_HORIZONTAL_MARGIN = 16;
const NETWORK_DEBUG_OVERLAY_MAX_WIDTH = 380;
const NETWORK_DEBUG_OVERLAY_MIN_WIDTH = 248;

function getRequestStatusText(request) {
    if (request.state !== 'complete' || request.durationMs === null) {
        return '...';
    }

    return `${request.ok ? 'OK' : 'BAD'} (${request.durationMs}ms)`;
}

function getRequestStatusClassName(request) {
    if (request.state !== 'complete' || request.durationMs === null) {
        return 'text-neutral-300';
    }

    return request.ok ? 'text-emerald-300' : 'text-red-300';
}

export function NetworkDebugOverlay() {
    const requests = useNetworkDebugRequests();
    const { width: windowWidth } = useWindowDimensions();
    const overlayWidth = Math.min(
        NETWORK_DEBUG_OVERLAY_MAX_WIDTH,
        Math.max(
            NETWORK_DEBUG_OVERLAY_MIN_WIDTH,
            windowWidth - NETWORK_DEBUG_OVERLAY_HORIZONTAL_MARGIN * 2,
        ),
    );
    const visibleRequests = requests.slice(
        0,
        MAX_VISIBLE_NETWORK_DEBUG_REQUESTS,
    );

    return (
        <View className="self-start" style={{ width: overlayWidth }}>
            <View className="elevation-[3] gap-1 rounded-md border border-neutral-950/10 bg-neutral-950/90 p-2 shadow-[0px_2px_8px_rgba(0,0,0,0.16)]">
                {visibleRequests.length > 0 ? (
                    visibleRequests.map((request) => (
                        <View
                            className="h-4 flex-row items-center gap-2"
                            key={request.id}
                        >
                            <Text
                                className="flex-1 text-[10px] font-medium text-white"
                                ellipsizeMode="middle"
                                numberOfLines={1}
                            >
                                {request.url}
                            </Text>
                            <Text
                                className={`text-[10px] font-bold ${getRequestStatusClassName(
                                    request,
                                )}`}
                                numberOfLines={1}
                                style={{ fontVariant: ['tabular-nums'] }}
                            >
                                {getRequestStatusText(request)}
                            </Text>
                        </View>
                    ))
                ) : (
                    <Text className="text-[10px] font-medium text-neutral-300">
                        No network requests
                    </Text>
                )}
            </View>
        </View>
    );
}
