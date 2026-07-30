import { useColorScheme, useState, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';

function clampProgress(progress) {
    const value = Number(progress);

    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(1, Math.max(0, value));
}

export function UpcomingAlertDistanceTrack({
    accentColor,
    progress,
    testID = 'upcoming-alert-distance-track',
}) {
    const theme = getDafTheme(useColorScheme());
    const [trackWidth, setTrackWidth] = useState(0);
    const resolvedProgress = clampProgress(progress);
    const progressPercent = `${resolvedProgress * 100}%`;
    const progressValue = Math.round(resolvedProgress * 100);
    const arrowPosition = trackWidth
        ? Math.min(resolvedProgress * trackWidth, Math.max(0, trackWidth - 13))
        : progressPercent;

    return (
        <View
            accessibilityLabel={`Approaching alert, ${progressValue} percent complete`}
            accessibilityRole="progressbar"
            accessibilityValue={{
                max: 100,
                min: 0,
                now: progressValue,
            }}
            className="h-[18px] flex-row items-center"
            pointerEvents="none"
            testID={testID}
        >
            <View
                className="relative h-[18px] flex-1"
                onLayout={({ nativeEvent }) => {
                    const nextTrackWidth = nativeEvent.layout.width;

                    setTrackWidth((currentTrackWidth) =>
                        currentTrackWidth === nextTrackWidth
                            ? currentTrackWidth
                            : nextTrackWidth,
                    );
                }}
            >
                <View className="absolute left-0 right-0 top-[7px] h-1 rounded-dafPill bg-daf-surface-alt dark:bg-[#1A2027]" />
                <View
                    className="absolute left-0 top-[7px] h-1 rounded-dafPill"
                    style={{
                        backgroundColor: accentColor,
                        width: progressPercent,
                    }}
                />
                <View
                    className="absolute shadow-[0px_1px_2px_rgba(11,13,16,0.35)]"
                    style={{
                        left: arrowPosition,
                        top: '50%',
                        transform: [
                            { translateX: -13 },
                            { translateY: -13 },
                            { rotate: '45deg' },
                        ],
                    }}
                >
                    <Icon
                        accessible={false}
                        color={theme.surface.card}
                        fill={dafSemanticColors.brand}
                        name="navigation"
                        size={26}
                        stroke={2}
                    />
                </View>
            </View>
            <View className="w-4 items-center">
                <Icon
                    accessible={false}
                    color={accentColor}
                    name="map-pin"
                    size={15}
                    stroke={2.2}
                />
            </View>
        </View>
    );
}
