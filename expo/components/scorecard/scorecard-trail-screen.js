import { useMemo } from 'react';
import { ScrollView, Text, useColorScheme, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';
import { useScorecard } from './scorecard-context';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';

function getTrailPoints(exposures) {
    const confirmed = exposures
        .filter((exposure) => exposure.certainty === 'confirmed')
        .sort((first, second) => first.occurredAt - second.occurredAt);

    if (confirmed.length === 0) {
        return [];
    }

    const longitudes = confirmed.map(
        (exposure) => exposure.cameraCoordinate[0],
    );
    const latitudes = confirmed.map((exposure) => exposure.cameraCoordinate[1]);
    const minimumLongitude = Math.min(...longitudes);
    const maximumLongitude = Math.max(...longitudes);
    const minimumLatitude = Math.min(...latitudes);
    const maximumLatitude = Math.max(...latitudes);
    const longitudeRange = Math.max(
        0.00001,
        maximumLongitude - minimumLongitude,
    );
    const latitudeRange = Math.max(0.00001, maximumLatitude - minimumLatitude);

    return confirmed.map((exposure, index) => ({
        event: exposure,
        index: index + 1,
        x:
            12 +
            ((exposure.cameraCoordinate[0] - minimumLongitude) /
                longitudeRange) *
                76,
        y:
            88 -
            ((exposure.cameraCoordinate[1] - minimumLatitude) / latitudeRange) *
                76,
    }));
}

function formatTrailTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        weekday: 'short',
    }).format(new Date(timestamp));
}

export default function ScorecardTrailScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(colorScheme);
    const { scorecardState } = useScorecard();
    const trailPoints = useMemo(
        () => getTrailPoints(scorecardState.exposures),
        [scorecardState.exposures],
    );
    const polylinePoints = trailPoints
        .map((point) => `${point.x},${point.y}`)
        .join(' ');
    const possibleCount = scorecardState.exposures.filter(
        (exposure) => exposure.certainty === 'possible',
    ).length;
    const bottomPadding = Math.max(insets.bottom + 24, 24);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="scorecard-trail"
        >
            <ScorecardScreenHeader
                back
                backRoute="timeline"
                subtitle="Camera hits only · no GPS trail"
                title="Reconstructed trail"
            />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: bottomPadding }}
            >
                <View className="gap-3.5 px-4 py-4">
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark overflow-hidden rounded-dafLg border border-daf-border bg-white">
                        <View className="flex-row items-center gap-3 px-4 py-3.5">
                            <Icon
                                color={dafSemanticColors.danger}
                                name="eye"
                                size={20}
                            />
                            <View className="min-w-0 flex-1">
                                <Text className="font-dafDisplay text-[16px] font-bold text-daf-text-primary dark:text-white">
                                    What {trailPoints.length}{' '}
                                    {trailPoints.length === 1
                                        ? 'read reveals'
                                        : 'reads reveal'}
                                </Text>
                                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                                    Chronology reconstructed from public camera
                                    points and timestamps alone.
                                </Text>
                            </View>
                        </View>
                        <View className="h-[360px] bg-daf-surface-alt dark:bg-daf-surface-inverse">
                            {trailPoints.length > 0 ? (
                                <Svg
                                    height="100%"
                                    viewBox="0 0 100 100"
                                    width="100%"
                                >
                                    <Polyline
                                        fill="none"
                                        opacity="0.8"
                                        points={polylinePoints}
                                        stroke={dafSemanticColors.danger}
                                        strokeDasharray="3 3"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1"
                                    />
                                    {trailPoints.map((point) => (
                                        <Circle
                                            cx={point.x}
                                            cy={point.y}
                                            fill={dafSemanticColors.danger}
                                            key={point.event.id}
                                            r="3.2"
                                            stroke={theme.surface.card}
                                            strokeWidth="1.4"
                                        />
                                    ))}
                                </Svg>
                            ) : (
                                <View className="flex-1 items-center justify-center px-6">
                                    <Icon
                                        color={dafSemanticColors.speedOk}
                                        name="shield-check"
                                        size={32}
                                    />
                                    <Text className="mt-3 text-center text-base font-bold text-daf-text-primary dark:text-white">
                                        No confirmed reads to connect
                                    </Text>
                                    <Text className="mt-1 text-center text-[13px] leading-[19px] text-daf-text-secondary dark:text-neutral-300">
                                        A trail is shown only from confirmed
                                        directional-cone crossings.
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View className="dark:border-daf-border-dark border-t border-daf-border px-4 py-3">
                            <View className="flex-row items-center gap-2">
                                <View className="h-2.5 w-2.5 rounded-dafPill bg-daf-alert" />
                                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                                    A confirmed local cone crossing
                                </Text>
                                <View className="ml-2 w-7 border-t-2 border-dashed border-daf-alert" />
                                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                                    inferred order
                                </Text>
                            </View>
                            <Text className="mt-2 text-xs leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                                The connecting line is inference—not a driven
                                route. No origin, destination, route geometry,
                                or raw GPS sample is stored.
                            </Text>
                        </View>
                    </View>

                    {trailPoints.length > 0 ? (
                        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white px-4 py-1">
                            {trailPoints.map((point, index) => (
                                <View
                                    className={`flex-row items-center gap-3 py-3 ${
                                        index < trailPoints.length - 1
                                            ? 'dark:border-daf-border-dark border-b border-daf-border'
                                            : ''
                                    }`}
                                    key={point.event.id}
                                >
                                    <View className="h-6 w-6 items-center justify-center rounded-dafPill bg-daf-alert">
                                        <Text className="font-dafMono text-[11px] font-bold text-white">
                                            {point.index}
                                        </Text>
                                    </View>
                                    <View className="min-w-0 flex-1">
                                        <Text
                                            className="text-[13px] font-semibold text-daf-text-primary dark:text-white"
                                            numberOfLines={1}
                                        >
                                            {point.event.label}
                                        </Text>
                                        <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                            {formatTrailTime(
                                                point.event.occurredAt,
                                            )}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {possibleCount > 0 ? (
                        <View className="border-daf-amber/35 bg-daf-amber/10 rounded-dafMd border px-3 py-2.5">
                            <Text className="text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                                {possibleCount} unknown-direction camera
                                {possibleCount === 1
                                    ? ' event is'
                                    : ' events are'}{' '}
                                omitted because they are not confirmed reads.
                            </Text>
                        </View>
                    ) : null}
                    <ScorecardPrivacyFooter />
                </View>
            </ScrollView>
        </View>
    );
}
