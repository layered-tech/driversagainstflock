import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafColors } from '../design-system/tokens';
import { getDrivingAlertsPresentation } from './driving-alerts';
import { UpcomingAlertDistanceTrack } from './upcoming-alert-distance-track';

function AlertIcon({ alertPresentation, compact = false }) {
    const iconSize = compact ? 18 : 22;

    return (
        <View
            className={`${compact ? 'h-[30px] w-[30px]' : 'h-[38px] w-[38px]'} items-center justify-center rounded-dafSm ${alertPresentation.iconBackgroundClassName}`}
        >
            <Icon
                color={alertPresentation.accentColor}
                name={alertPresentation.icon}
                size={iconSize}
            />
        </View>
    );
}

function AlertDismissButton({ accessibilityLabel, onPress, testID }) {
    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            className="h-[30px] w-[30px] items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
            hitSlop={7}
            onPress={onPress}
            testID={testID}
        >
            <Icon color={dafColors.ink[400]} name="x" size={17} />
        </Pressable>
    );
}

function AlertSource({ alertPresentation }) {
    return (
        <Text
            className="text-xs leading-4 text-daf-text-tertiary dark:text-neutral-400"
            numberOfLines={1}
        >
            {alertPresentation.subtitle}
        </Text>
    );
}

function SingleDrivingAlertCard({ onDismiss, presentation }) {
    const alertPresentation = presentation.alerts[0];

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark relative gap-[9px] overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-card px-[14px] pb-4 pt-[14px] shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="driving-upcoming-alert"
        >
            <View className="flex-row items-center gap-[11px]">
                <AlertIcon alertPresentation={alertPresentation} />

                <View className="min-w-0 flex-1">
                    <Text
                        className="text-[16px] font-semibold leading-5 text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                        testID="driving-upcoming-alert-title"
                    >
                        {alertPresentation.title}
                    </Text>
                    <AlertSource alertPresentation={alertPresentation} />
                </View>

                <Text
                    className="font-dafMono text-[22px] font-extrabold leading-[22px] text-daf-azure"
                    numberOfLines={1}
                    style={{ color: alertPresentation.accentColor }}
                    testID="driving-upcoming-alert-distance"
                >
                    {alertPresentation.distance}
                </Text>

                <View className="-mr-1 -mt-1 self-start">
                    <AlertDismissButton
                        accessibilityLabel={`Dismiss ${alertPresentation.title.toLowerCase()}`}
                        onPress={onDismiss}
                        testID="driving-upcoming-alert-dismiss"
                    />
                </View>
            </View>

            <View className="px-0.5">
                <UpcomingAlertDistanceTrack
                    accentColor={alertPresentation.accentColor}
                    progress={alertPresentation.approachProgress}
                    testID="driving-upcoming-alert-track"
                />
            </View>
        </View>
    );
}

function CombinedDrivingAlertColumn({ alertPresentation, testID }) {
    return (
        <View
            className={`${alertPresentation.type === 'police' ? 'pr-5' : 'pl-5 pr-[14px]'} min-w-0 flex-1 gap-2 pb-[15px] pt-[13px] ${alertPresentation.type === 'police' ? 'pl-[14px]' : ''}`}
            testID={testID}
        >
            <View
                className={`min-w-0 flex-row items-center gap-[9px] ${
                    alertPresentation.type === 'alpr' ? 'pr-[26px]' : ''
                }`}
            >
                <AlertIcon alertPresentation={alertPresentation} compact />
                <Text
                    className="min-w-0 flex-1 text-[13px] font-semibold leading-4 text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {alertPresentation.title}
                </Text>
            </View>

            <Text
                className="font-dafMono text-[21px] font-extrabold leading-[21px] text-daf-azure"
                numberOfLines={1}
                style={{ color: alertPresentation.accentColor }}
            >
                {alertPresentation.distance}
            </Text>

            <UpcomingAlertDistanceTrack
                accentColor={alertPresentation.accentColor}
                progress={alertPresentation.approachProgress}
                testID={`${testID}-track`}
            />

            <AlertSource alertPresentation={alertPresentation} />
        </View>
    );
}

function CombinedDrivingAlertsCard({ onDismiss, presentation }) {
    const [policeAlert, alprAlert] = presentation.alerts;

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark relative flex-row overflow-hidden rounded-dafLg border border-daf-border bg-daf-surface-card shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="driving-upcoming-alert"
        >
            <View
                className="dark:bg-daf-border-dark absolute left-1/2 top-[-25%] h-[150%] w-px rotate-[11deg] bg-daf-border"
                pointerEvents="none"
            />
            <View className="absolute right-[7px] top-[7px] z-10">
                <AlertDismissButton
                    accessibilityLabel="Dismiss alerts"
                    onPress={onDismiss}
                    testID="driving-upcoming-alert-dismiss"
                />
            </View>

            <CombinedDrivingAlertColumn
                alertPresentation={policeAlert}
                testID="driving-upcoming-alert-police"
            />
            <CombinedDrivingAlertColumn
                alertPresentation={alprAlert}
                testID="driving-upcoming-alert-alpr"
            />
        </View>
    );
}

export function DrivingAlertsOverlay({
    alerts,
    bottomInset = 0,
    routeIsActive = false,
}) {
    const [dismissedAlertIds, setDismissedAlertIds] = useState(() => new Set());
    const presentation = useMemo(
        () => getDrivingAlertsPresentation(alerts, dismissedAlertIds),
        [alerts, dismissedAlertIds],
    );
    const dismissAlerts = useCallback((alertIds) => {
        setDismissedAlertIds((currentAlertIds) => {
            const nextAlertIds = new Set(currentAlertIds);

            alertIds.forEach((alertId) => {
                nextAlertIds.add(alertId);
            });

            return nextAlertIds;
        });
    }, []);

    if (!presentation) {
        return null;
    }

    const bottomPadding = routeIsActive
        ? 12
        : Math.max(Number(bottomInset) || 0, 12);
    const handleDismiss = () => dismissAlerts(presentation.dismissalAlertIds);

    return (
        <View
            className="px-3"
            pointerEvents="box-none"
            style={{ paddingBottom: bottomPadding }}
        >
            {presentation.variant === 'combined' ? (
                <CombinedDrivingAlertsCard
                    onDismiss={handleDismiss}
                    presentation={presentation}
                />
            ) : (
                <SingleDrivingAlertCard
                    onDismiss={handleDismiss}
                    presentation={presentation}
                />
            )}
        </View>
    );
}
