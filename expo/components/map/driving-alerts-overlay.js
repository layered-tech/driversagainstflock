import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
    addAutoPlaySessionStateListener,
    getAutoPlaySessionState,
} from '../auto-play-session-state';
import { Icon } from '../design-system/icon';
import { dafColors } from '../design-system/tokens';
import {
    presenceCoordinator,
    startPresenceRuntime,
} from './alpr-presence-runtime';
import {
    AUTOMOTIVE_ALERT_MINIMUM_SPACING_MS,
    getAutomotiveAlertHistoryEntry,
    getAutomotiveAlertKey,
} from './automotive-alert-policy';
import {
    getDrivingAlertsPresentation,
    getNextPhoneDrivingAlert,
} from './driving-alerts';
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

function DrivingAlertCard({
    bottomInset,
    onDismiss,
    onShown,
    presentation,
    routeIsActive,
}) {
    if (!presentation) {
        return null;
    }

    const bottomPadding = routeIsActive
        ? 12
        : Math.max(Number(bottomInset) || 0, 12);

    return (
        <View
            className="px-3"
            onLayout={onShown}
            pointerEvents="box-none"
            style={{ paddingBottom: bottomPadding }}
        >
            {presentation.variant === 'combined' ? (
                <CombinedDrivingAlertsCard
                    onDismiss={onDismiss}
                    presentation={presentation}
                />
            ) : (
                <SingleDrivingAlertCard
                    onDismiss={onDismiss}
                    presentation={presentation}
                />
            )}
        </View>
    );
}

function FixtureDrivingAlertsOverlay({ alerts, bottomInset, routeIsActive }) {
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

    const handleDismiss = () => {
        if (presentation) dismissAlerts(presentation.dismissalAlertIds);
    };

    return (
        <DrivingAlertCard
            bottomInset={bottomInset}
            onDismiss={handleDismiss}
            presentation={presentation}
            routeIsActive={routeIsActive}
        />
    );
}

function GatedDrivingAlertsOverlay({ alerts, bottomInset, routeIsActive }) {
    const [dismissedAlertIds, setDismissedAlertIds] = useState(() => new Set());
    const [active, setActive] = useState(null);
    const activeRef = useRef(active);
    activeRef.current = active;
    const [history, setHistory] = useState(null);
    const [carConnected, setCarConnected] = useState(
        getAutoPlaySessionState().isConnected,
    );
    const [timeRevision, setTimeRevision] = useState(0);

    useEffect(() => {
        let mounted = true;
        startPresenceRuntime();
        const updateHistory = () => {
            if (mounted) setHistory(presenceCoordinator.automotiveAlertHistory);
        };
        const unsubscribeHistory = presenceCoordinator.subscribe(updateHistory);
        const unsubscribeCar = addAutoPlaySessionStateListener((session) => {
            if (mounted) setCarConnected(session.isConnected);
        });
        void presenceCoordinator.hydrate().then(updateHistory);

        return () => {
            mounted = false;
            unsubscribeHistory();
            unsubscribeCar();
            activeRef.current?.claim.release();
        };
    }, []);

    useEffect(() => {
        if (active || carConnected || history?.lastShownAt == null) return;
        const remaining =
            history.lastShownAt +
            AUTOMOTIVE_ALERT_MINIMUM_SPACING_MS -
            Date.now();
        if (remaining <= 0) return;
        const timer = setTimeout(
            () => setTimeRevision((revision) => revision + 1),
            remaining,
        );
        return () => clearTimeout(timer);
    }, [active, carConnected, history?.lastShownAt]);

    const candidate = useMemo(
        () =>
            carConnected
                ? null
                : getNextPhoneDrivingAlert(
                      alerts,
                      dismissedAlertIds,
                      history,
                      active?.alertKey,
                      Date.now(),
                  ),
        [
            active?.alertKey,
            alerts,
            carConnected,
            dismissedAlertIds,
            history,
            timeRevision,
        ],
    );
    const candidateKey = getAutomotiveAlertKey(candidate);

    useEffect(() => {
        if (active?.alertKey === candidateKey) return;
        if (active) {
            active.claim.release();
            setActive(null);
            return;
        }
        if (!candidate || !candidateKey) return;
        const entry = getAutomotiveAlertHistoryEntry(candidate);
        const claim = presenceCoordinator.claimAutomotiveAlert(entry);
        if (claim)
            setActive({ alertKey: candidateKey, claim, recorded: false });
    }, [active, candidate, candidateKey]);

    const presentation =
        active && active.alertKey === candidateKey
            ? getDrivingAlertsPresentation([candidate], dismissedAlertIds)
            : null;
    const handleShown = () => {
        const current = activeRef.current;
        if (!current || current.recorded) return;
        const committed = current.claim.commit();
        if (!committed) current.claim.release();
        setActive((latest) =>
            latest === current
                ? committed
                    ? { ...current, recorded: true }
                    : null
                : latest,
        );
    };
    const handleDismiss = () => {
        const current = activeRef.current;
        if (!current) return;
        if (!current.recorded) current.claim.commit();
        setDismissedAlertIds((ids) => {
            const nextIds = new Set(ids);
            presentation?.dismissalAlertIds.forEach((id) => nextIds.add(id));
            return nextIds;
        });
        setActive(null);
    };

    return (
        <DrivingAlertCard
            bottomInset={bottomInset}
            onDismiss={handleDismiss}
            onShown={handleShown}
            presentation={presentation}
            routeIsActive={routeIsActive}
        />
    );
}

export function DrivingAlertsOverlay({
    alerts,
    bottomInset = 0,
    routeIsActive = false,
    unrestrictedFixture = false,
}) {
    const Overlay = unrestrictedFixture
        ? FixtureDrivingAlertsOverlay
        : GatedDrivingAlertsOverlay;

    return (
        <Overlay
            alerts={alerts}
            bottomInset={bottomInset}
            routeIsActive={routeIsActive}
        />
    );
}
