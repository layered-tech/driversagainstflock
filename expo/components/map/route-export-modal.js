import {
    NativeModalContent,
    NativeNavigationAction,
} from '../root/native-navigation';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafChip } from '../design-system/primitives';
import {
    buildRouteExportText,
    ROUTE_EXPORT_FORMAT_GPX,
    ROUTE_EXPORT_FORMAT_KML,
} from './route-export';

export function RouteExportModal({ onDismiss, route, visible }) {
    const insets = useSafeAreaInsets();
    const [format, setFormat] = useState(ROUTE_EXPORT_FORMAT_GPX);
    const exportText = useMemo(
        () => buildRouteExportText(route, format),
        [format, route],
    );

    return (
        <Modal
            animationType="slide"
            onRequestClose={onDismiss}
            presentationStyle="pageSheet"
            visible={visible}
        >
            <NativeModalContent>
                <View className="flex-1 bg-white dark:bg-daf-surface-dark">
                    <View
                        className="flex-row items-center justify-between border-b border-daf-border px-4 pb-3 dark:border-daf-border-dark"
                        style={{ paddingTop: Math.max(insets.top, 16) }}
                    >
                        <View className="min-w-0 flex-1 gap-0.5 pr-3">
                            <Text className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                                Export route text
                            </Text>
                            <Text className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300">
                                Select the text below, copy it, then save it as
                                a file.
                            </Text>
                        </View>
                        <NativeNavigationAction
                            railOnly
                            kind="close"
                            priority={100}
                        >
                            <Pressable
                                accessibilityLabel="Close route export"
                                accessibilityRole="button"
                                className="h-hitComfy w-hitComfy items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                                onPress={onDismiss}
                                testID="route-export-close-button"
                            >
                                <Icon name="x" size={21} />
                            </Pressable>
                        </NativeNavigationAction>
                    </View>

                    <View className="flex-row gap-2 px-4 py-3">
                        <DafChip
                            onPress={() => setFormat(ROUTE_EXPORT_FORMAT_GPX)}
                            selected={format === ROUTE_EXPORT_FORMAT_GPX}
                            testID="route-export-format-gpx"
                            tone="brand"
                        >
                            GPX
                        </DafChip>
                        <DafChip
                            onPress={() => setFormat(ROUTE_EXPORT_FORMAT_KML)}
                            selected={format === ROUTE_EXPORT_FORMAT_KML}
                            testID="route-export-format-kml"
                            tone="brand"
                        >
                            KML
                        </DafChip>
                    </View>

                    <ScrollView
                        className="flex-1 px-4"
                        contentContainerClassName="pb-6"
                        showsVerticalScrollIndicator={false}
                    >
                        <Text
                            className="rounded-dafMd bg-daf-surface-alt p-3 font-dafMono text-xs leading-5 text-daf-text-primary dark:bg-daf-surface-inverse dark:text-white"
                            selectable
                            testID="route-export-text"
                        >
                            {exportText}
                        </Text>
                    </ScrollView>
                </View>
            </NativeModalContent>
        </Modal>
    );
}
