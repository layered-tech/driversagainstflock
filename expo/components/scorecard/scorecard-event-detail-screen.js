import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { useScorecard } from './scorecard-context';
import { getExposureScoreImpact } from './scorecard-engine';
import { ScorecardExposureMap } from './scorecard-map';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';

function formatTimestamp(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        weekday: 'short',
    }).format(new Date(timestamp));
}

function formatHeading(heading) {
    if (!Number.isFinite(heading)) {
        return 'Not available';
    }

    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = cardinals[Math.round(heading / 45) % cardinals.length];

    return `${cardinal} · ${Math.round(heading)}°`;
}

function DetailCell({ label, tone = 'default', value }) {
    return (
        <View className="w-[48.7%] rounded-dafMd bg-daf-surface-alt px-3 py-2.5 dark:bg-daf-surface-inverse">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                {label}
            </Text>
            <Text
                className={`font-dafMono mt-1 text-[13px] font-semibold ${
                    tone === 'alert'
                        ? 'text-daf-alert'
                        : 'text-daf-text-primary dark:text-white'
                }`}
                numberOfLines={2}
            >
                {value}
            </Text>
        </View>
    );
}

export default function ScorecardEventDetailScreen() {
    const { eventId } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { scorecardState } = useScorecard();
    const resolvedEventId = Array.isArray(eventId) ? eventId[0] : eventId;
    const event = scorecardState.exposures.find(
        (exposure) => exposure.id === resolvedEventId,
    );
    const bottomPadding = Math.max(insets.bottom + 24, 24);

    if (!event) {
        return (
            <View className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]">
                <ScorecardScreenHeader
                    back
                    backRoute="timeline"
                    title="Exposure detail"
                />
                <View className="flex-1 items-center justify-center px-6">
                    <Icon
                        color={dafSemanticColors.speedOk}
                        name="lock"
                        size={30}
                    />
                    <Text className="mt-3 text-center text-base font-bold text-daf-text-primary dark:text-white">
                        Event no longer available
                    </Text>
                    <Text className="mt-1 text-center text-[13px] leading-[19px] text-daf-text-secondary dark:text-neutral-300">
                        It may have been deleted from this device.
                    </Text>
                </View>
            </View>
        );
    }

    const confirmed = event.certainty === 'confirmed';
    const impact = getExposureScoreImpact(scorecardState, event.id);
    const readsAtCamera = scorecardState.exposures.filter(
        (exposure) =>
            exposure.osmId === event.osmId &&
            exposure.certainty === 'confirmed',
    ).length;

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="scorecard-event-detail"
        >
            <ScorecardScreenHeader
                back
                backRoute="timeline"
                subtitle={
                    confirmed
                        ? 'Confirmed directional cone crossing'
                        : 'Possible crossing · excluded from score'
                }
                title="Exposure detail"
            />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: bottomPadding }}
            >
                <View className="h-[270px] overflow-hidden bg-daf-surface-alt dark:bg-daf-surface-inverse">
                    <ScorecardExposureMap
                        exposures={[event]}
                        height={270}
                        lineColor="#1FBF6B"
                        showCones
                        testID="scorecard-event-map"
                    />
                </View>
                <View className="gap-3 px-4 py-4">
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white p-4">
                        <Text className="font-dafDisplay text-lg font-bold text-daf-text-primary dark:text-white">
                            {event.label}
                        </Text>
                        <Text className="font-dafMono mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400">
                            OSM node {event.osmId} · public camera data
                        </Text>
                        <View
                            className={`mt-3 flex-row items-center gap-2.5 rounded-dafMd border px-3 py-2.5 ${
                                confirmed
                                    ? 'border-daf-alert/30 bg-daf-alert/10'
                                    : 'border-daf-amber/35 bg-daf-amber/10'
                            }`}
                        >
                            <View
                                className={`h-3 w-3 rounded-dafPill ${
                                    confirmed ? 'bg-daf-alert' : 'bg-daf-amber'
                                }`}
                            />
                            <Text className="min-w-0 flex-1 text-[13.5px] font-semibold text-daf-text-primary dark:text-white">
                                {confirmed
                                    ? "You drove through this camera's reported view"
                                    : 'You passed within 50 m, but its direction is unknown'}
                            </Text>
                        </View>
                        <Text className="font-dafMono mt-2.5 text-xs text-daf-text-secondary dark:text-neutral-300">
                            {formatTimestamp(event.occurredAt)}
                        </Text>

                        <View className="mt-3 flex-row flex-wrap justify-between gap-y-2">
                            <DetailCell
                                label="Travel heading"
                                value={formatHeading(event.travelHeading)}
                            />
                            <DetailCell
                                label="Camera view"
                                value={
                                    event.cameraDirectionLabel ??
                                    'Direction not reported'
                                }
                            />
                            <DetailCell
                                label="Operator"
                                value={event.operator ?? 'Not reported in OSM'}
                            />
                            <DetailCell
                                label="Score impact"
                                tone={confirmed ? 'alert' : 'default'}
                                value={
                                    confirmed
                                        ? `${impact > 0 ? '+' : ''}${impact} pts`
                                        : 'Excluded'
                                }
                            />
                        </View>

                        {readsAtCamera > 1 ? (
                            <View className="mt-3 flex-row items-start gap-2">
                                <Icon
                                    color={dafSemanticColors.warning}
                                    name="triangle-alert"
                                    size={15}
                                />
                                <Text className="min-w-0 flex-1 text-[13px] text-daf-text-secondary dark:text-neutral-300">
                                    {readsAtCamera} confirmed crossings at this
                                    camera in the retained on-device history.
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View
                        className="border-daf-amber/35 bg-daf-amber/10 rounded-dafMd border px-3 py-2.5"
                        testID="scorecard-confirmed-read-disclaimer"
                    >
                        <Text className="text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                            Crossing a known directional cone is treated as a
                            confirmed plate read for this scorecard. DAF does
                            not receive a plate image or confirmation from the
                            camera operator.
                        </Text>
                    </View>

                    <ScorecardPrivacyFooter />
                </View>
            </ScrollView>
        </View>
    );
}
