import { useEffect, useRef, useState } from 'react';
import {
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import {
    getContributeTourBackdropPath,
    getContributeTourLayout,
} from './contribute-tour-layout';
import {
    CONTRIBUTE_TOUR_PHASE_STEPS,
    getVisibleContributeTourStep,
} from './contribute-tour-state';

export function ContributeTourOverlay({
    contentRef,
    enabled = true,
    insets,
    phase,
    restoreScrollOnFinish = false,
    scrollRef,
    targets,
    tour,
}) {
    const dimensions = useWindowDimensions();
    const isDarkMode = useColorScheme() === 'dark';
    const steps = CONTRIBUTE_TOUR_PHASE_STEPS[phase];
    const step = steps.find((id) =>
        getVisibleContributeTourStep(tour.progress, id),
    );
    const content = step
        ? getVisibleContributeTourStep(tour.progress, step)
        : null;
    const [measurement, setMeasurement] = useState(null);
    const [tooltipHeight, setTooltipHeight] = useState(230);
    const [footerHeight, setFooterHeight] = useState(60);
    const [viewport, setViewport] = useState(dimensions);
    const [origin, setOrigin] = useState({ x: 0, y: 0 });
    const overlayRef = useRef(null);
    const target = content?.target;
    const shouldScroll = content?.scroll === true;

    useEffect(() => {
        if (!enabled || !step) {
            return;
        }

        Keyboard.dismiss();

        let isActive = true;
        let frame;
        let attempts = 0;

        function measureTarget() {
            const node = targets.current[target];

            if (!isActive) {
                return;
            }

            if (!node && attempts++ < 12) {
                frame = requestAnimationFrame(measureTarget);
                return;
            }

            node?.measureInWindow((x, y, width, height) => {
                if (!isActive) {
                    return;
                }

                if (width > 0 && height > 0) {
                    setMeasurement({ step, target: { x, y, width, height } });
                } else if (attempts++ < 12) {
                    frame = requestAnimationFrame(measureTarget);
                }
            });
        }

        frame = requestAnimationFrame(() => {
            const node = targets.current[target];

            if (
                shouldScroll &&
                node &&
                scrollRef?.current &&
                contentRef?.current
            ) {
                node.measureLayout(
                    contentRef.current,
                    (_x, y) => {
                        if (!isActive) {
                            return;
                        }

                        scrollRef.current.scrollTo({
                            y: Math.max(0, y - 16),
                            animated: false,
                        });
                        frame = requestAnimationFrame(() => {
                            frame = requestAnimationFrame(measureTarget);
                        });
                    },
                    measureTarget,
                );
            } else {
                measureTarget();
            }
        });

        return () => {
            isActive = false;
            cancelAnimationFrame(frame);
        };
    }, [
        contentRef,
        dimensions.height,
        dimensions.width,
        enabled,
        scrollRef,
        shouldScroll,
        step,
        target,
        targets,
        viewport.height,
        viewport.width,
    ]);

    if (!enabled || !content || !measurement) {
        return null;
    }

    const layout = getContributeTourLayout({
        target: measurement.target,
        viewport,
        insets,
        tooltipHeight,
        origin,
    });

    const index = steps.indexOf(step);
    const lastStep = index === steps.length - 1;
    const isCompletion = phase === 'published';
    const handleNext = () => {
        tour.dismissStep(step);

        if (lastStep && restoreScrollOnFinish) {
            scrollRef?.current?.scrollTo({ y: 0, animated: false });
        }
    };
    const measureOrigin = () =>
        overlayRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));

    return (
        <Modal
            transparent
            animationType="none"
            navigationBarTranslucent
            statusBarTranslucent
            onRequestClose={isCompletion ? handleNext : tour.skip}
            onShow={measureOrigin}
            supportedOrientations={['portrait', 'landscape']}
            visible
        >
            <View
                accessibilityViewIsModal
                className="flex-1"
                collapsable={false}
                ref={overlayRef}
                onLayout={({ nativeEvent }) => {
                    setViewport(nativeEvent.layout);
                    measureOrigin();
                }}
                testID={`contribute-tour-${step}`}
            >
                {layout ? (
                    <>
                        <Svg
                            height={viewport.height}
                            width={viewport.width}
                            pointerEvents="none"
                        >
                            <Path
                                d={getContributeTourBackdropPath(
                                    viewport,
                                    layout.highlight,
                                )}
                                fill="rgba(0,0,0,0.72)"
                                fillRule="evenodd"
                                testID="contribute-tour-backdrop"
                            />
                            <Rect
                                {...layout.highlight}
                                fill="none"
                                rx={12}
                                stroke="#34D399"
                                strokeWidth={2}
                                testID="contribute-tour-spotlight"
                            />
                        </Svg>
                        <View
                            className="absolute rounded-dafMd bg-white shadow-lg dark:bg-daf-surface-dark"
                            style={{
                                left: layout.tooltip.x,
                                top: layout.tooltip.y,
                                width: layout.tooltip.width,
                            }}
                            testID="contribute-tour-tooltip"
                            onLayout={({ nativeEvent }) =>
                                setTooltipHeight(nativeEvent.layout.height)
                            }
                        >
                            {layout.placement !== 'floating' ? (
                                <View
                                    className="absolute"
                                    pointerEvents="none"
                                    style={{
                                        left: layout.arrowX,
                                        ...(layout.placement === 'below'
                                            ? { top: -12 }
                                            : { bottom: -12 }),
                                    }}
                                >
                                    <Svg height={14} width={20}>
                                        <Path
                                            d={
                                                layout.placement === 'below'
                                                    ? 'M0 14L10 0L20 14Z'
                                                    : 'M0 0L10 14L20 0Z'
                                            }
                                            fill={
                                                isDarkMode
                                                    ? '#161B22'
                                                    : '#FFFFFF'
                                            }
                                        />
                                    </Svg>
                                </View>
                            ) : null}
                            <ScrollView
                                style={{
                                    maxHeight: Math.max(
                                        0,
                                        layout.tooltip.maxHeight - footerHeight,
                                    ),
                                }}
                                bounces={false}
                            >
                                <View className="gap-2 px-4 pb-3 pt-4">
                                    <Text className="text-xs font-semibold text-daf-text-brand dark:text-daf-brand">
                                        {isCompletion
                                            ? 'Contribution complete'
                                            : content.step
                                              ? `Contribution tour · Step ${content.step} of 4`
                                              : 'Your first contribution'}
                                        {steps.length > 1
                                            ? ` · ${index + 1}/${steps.length}`
                                            : ''}
                                    </Text>
                                    <Text
                                        accessibilityRole="header"
                                        className="text-base font-bold text-daf-text-primary dark:text-white"
                                    >
                                        {content.title}
                                    </Text>
                                    <Text className="text-sm leading-[21px] text-daf-text-secondary dark:text-neutral-200">
                                        {content.description}
                                    </Text>
                                </View>
                            </ScrollView>
                            <View
                                className="flex-row flex-wrap items-center gap-2 px-4 pb-4"
                                onLayout={({ nativeEvent }) =>
                                    setFooterHeight(nativeEvent.layout.height)
                                }
                            >
                                {index > 0 ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        className="min-h-hitComfy justify-center rounded-dafPill px-3 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                        onPress={() =>
                                            tour.reopenStep(steps[index - 1])
                                        }
                                        testID={`contribute-tour-back-${step}`}
                                    >
                                        <Text className="text-sm font-semibold text-daf-text-primary dark:text-white">
                                            Back
                                        </Text>
                                    </Pressable>
                                ) : null}
                                <Pressable
                                    accessibilityRole="button"
                                    className="min-h-hitComfy justify-center rounded-dafPill bg-daf-brand px-4 active:bg-daf-brand-press"
                                    onPress={handleNext}
                                    testID={`contribute-tour-dismiss-${step}`}
                                >
                                    <Text className="text-sm font-semibold text-daf-brand-contrast">
                                        {isCompletion
                                            ? 'Done'
                                            : lastStep
                                              ? 'Try it'
                                              : 'Next'}
                                    </Text>
                                </Pressable>
                                {!isCompletion ? (
                                    <Pressable
                                        accessibilityHint="Ends the walkthrough and keeps your contribution."
                                        accessibilityRole="button"
                                        className="min-h-hitComfy justify-center rounded-dafPill px-3 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                        onPress={tour.skip}
                                        testID={`contribute-tour-skip-${step}`}
                                    >
                                        <Text className="text-sm text-daf-text-secondary dark:text-neutral-300">
                                            Skip tour
                                        </Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        </View>
                    </>
                ) : null}
            </View>
        </Modal>
    );
}
