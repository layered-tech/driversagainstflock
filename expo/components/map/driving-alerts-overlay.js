import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafColors, dafSemanticColors } from '../design-system/tokens';
import {
    getNextUpcomingAlert,
    getUpcomingAlertId,
    getUpcomingAlertPresentation,
    getVisibleUpcomingAlerts,
} from './driving-alerts';
import { UpcomingAlertPassTimer } from './upcoming-alert-pass-timer';

export function DrivingAlertsOverlay({
    alerts,
    bottomInset = 0,
    routeIsActive = false,
}) {
    const [dismissedAlertIds, setDismissedAlertIds] = useState(() => new Set());
    const visibleAlerts = useMemo(
        () => getVisibleUpcomingAlerts(alerts, dismissedAlertIds),
        [alerts, dismissedAlertIds],
    );
    const primaryAlert = visibleAlerts[0] ?? null;
    const followingAlert = useMemo(
        () => getNextUpcomingAlert(primaryAlert, visibleAlerts),
        [primaryAlert, visibleAlerts],
    );
    const presentation = useMemo(
        () => getUpcomingAlertPresentation(primaryAlert, followingAlert),
        [followingAlert, primaryAlert],
    );

    if (!presentation || !primaryAlert) {
        return null;
    }

    const alertId = getUpcomingAlertId(primaryAlert, 0);
    const iconColor =
        primaryAlert.type === 'police'
            ? dafSemanticColors.info
            : dafSemanticColors.danger;
    const bottomPadding = routeIsActive
        ? 12
        : Math.max(Number(bottomInset) || 0, 12);

    return (
        <View
            className="px-3"
            pointerEvents="box-none"
            style={{ paddingBottom: bottomPadding }}
        >
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark relative flex-row items-start gap-[13px] overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-card px-[14px] pb-[18px] pt-[14px] shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
                testID="driving-upcoming-alert"
            >
                <View
                    className={`h-11 w-11 items-center justify-center rounded-dafMd ${presentation.iconBackgroundClassName}`}
                >
                    <Icon
                        color={iconColor}
                        name={presentation.icon}
                        size={24}
                    />
                </View>

                <View className="min-w-0 flex-1">
                    <View className="flex-row flex-wrap items-baseline gap-x-2">
                        <Text
                            className="text-[16px] font-semibold leading-5 text-daf-text-primary dark:text-white"
                            numberOfLines={1}
                            testID="driving-upcoming-alert-title"
                        >
                            {presentation.title}
                        </Text>
                        <Text
                            className="font-dafMono text-[15px] font-extrabold leading-5 text-daf-azure dark:text-daf-azure"
                            style={{ color: presentation.accentColor }}
                            testID="driving-upcoming-alert-distance"
                        >
                            {presentation.distance}
                        </Text>
                    </View>
                    <Text
                        className="mt-0.5 text-xs leading-4 text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={2}
                        testID="driving-upcoming-alert-subtitle"
                    >
                        {presentation.subtitle}
                    </Text>
                </View>

                <Pressable
                    accessibilityLabel={`Dismiss ${presentation.title.toLowerCase()}`}
                    accessibilityRole="button"
                    className="-mr-1 -mt-1 h-8 w-8 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                    hitSlop={4}
                    onPress={() => {
                        setDismissedAlertIds((currentAlertIds) => {
                            const nextAlertIds = new Set(currentAlertIds);

                            nextAlertIds.add(alertId);

                            return nextAlertIds;
                        });
                    }}
                    testID="driving-upcoming-alert-dismiss"
                >
                    <Icon color={dafColors.ink[400]} name="x" size={18} />
                </Pressable>

                <UpcomingAlertPassTimer
                    accentColor={presentation.accentColor}
                    distanceMeters={primaryAlert.distanceMeters}
                />
            </View>
        </View>
    );
}
