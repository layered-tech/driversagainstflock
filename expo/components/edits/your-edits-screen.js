import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import {
    fetchChangesetNodes,
    fetchNodesByIds,
    fetchUserChangesets,
} from '../../lib/osm/client';
import {
    buildYourEditsModel,
    collectSurveillanceNodeIds,
} from '../../lib/osm/user-edits';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';

function YourEditsNodeRow({
    isMenuOpen,
    node,
    onDelete,
    onEdit,
    onToggleMenu,
    theme,
}) {
    const isDarkMode = useColorScheme() === 'dark';

    return (
        <View className="dark:border-daf-border-dark border-t border-daf-border">
            <Pressable
                accessibilityLabel={
                    node.isRemoved ? node.typeLabel : `Edit ${node.typeLabel}`
                }
                accessibilityRole="button"
                className="flex-row items-center gap-3 px-3.5 py-[13px] active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                disabled={node.isRemoved}
                onPress={onEdit}
                testID={`your-edits-row-${node.id}`}
            >
                <View
                    className="h-[17px] w-[17px] flex-none items-center justify-center rounded-dafPill"
                    style={{
                        backgroundColor: isDarkMode
                            ? node.markerColor.darkBackground
                            : node.markerColor.lightBackground,
                    }}
                >
                    <View
                        className="h-[9px] w-[9px] rounded-dafPill"
                        style={{ backgroundColor: node.markerColor.fill }}
                    />
                </View>

                <View className="min-w-0 flex-1">
                    <Text
                        className="text-[15px] font-semibold leading-[19px] text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                    >
                        {node.typeLabel}
                    </Text>
                    <Text
                        className="text-[13px] leading-[18px] text-daf-text-secondary dark:text-neutral-300"
                        numberOfLines={1}
                    >
                        {node.subtitle}
                    </Text>
                    <Text
                        className="font-dafMono mt-0.5 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                    >
                        {node.refLabel}
                    </Text>
                    {node.isRemoved ? (
                        <View className="dark:border-daf-border-dark mt-1.5 self-start rounded-dafPill border border-daf-border bg-daf-surface-alt px-2 py-[3px] dark:bg-daf-surface-inverse">
                            <Text className="text-[11px] font-semibold text-daf-text-secondary dark:text-neutral-300">
                                Removed from map
                            </Text>
                        </View>
                    ) : node.updatedByLabel ? (
                        <View className="bg-daf-amber/12 dark:bg-daf-amber/15 mt-1.5 self-start rounded-dafPill px-2 py-[3px]">
                            <Text className="text-[11px] font-semibold text-amber-700 dark:text-daf-amber">
                                {node.updatedByLabel}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {!node.isRemoved ? (
                    <Pressable
                        accessibilityLabel="Camera actions"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isMenuOpen }}
                        className={`h-[34px] w-[34px] flex-none items-center justify-center rounded-dafPill ${
                            isMenuOpen
                                ? 'bg-daf-brand/12 dark:bg-daf-brand/15'
                                : 'active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse'
                        }`}
                        hitSlop={6}
                        onPress={onToggleMenu}
                        testID={`your-edits-row-${node.id}-menu-button`}
                    >
                        <Icon
                            color={
                                isMenuOpen
                                    ? theme.text.brand
                                    : theme.text.tertiary
                            }
                            name="ellipsis-vertical"
                            size={20}
                        />
                    </Pressable>
                ) : null}
            </Pressable>

            {isMenuOpen && !node.isRemoved ? (
                <View className="dark:border-daf-border-dark flex-row gap-2 border-t border-daf-border bg-daf-surface-alt p-2 dark:bg-daf-surface-inverse">
                    <Pressable
                        accessibilityLabel="Edit camera"
                        accessibilityRole="menuitem"
                        className="h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-dafSm active:opacity-[0.82]"
                        onPress={onEdit}
                        style={{
                            backgroundColor: isDarkMode
                                ? 'rgba(31, 191, 107, 0.15)'
                                : 'rgba(31, 191, 107, 0.12)',
                        }}
                        testID={`your-edits-row-${node.id}-edit-button`}
                    >
                        <Icon
                            color={theme.text.brand}
                            name="pencil"
                            size={17}
                        />
                        <Text className="text-[13px] font-semibold text-daf-text-brand dark:text-daf-brand">
                            Edit
                        </Text>
                    </Pressable>
                    <Pressable
                        accessibilityLabel="Delete camera"
                        accessibilityRole="menuitem"
                        className="bg-daf-alert/10 dark:bg-daf-alert/15 h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-dafSm active:opacity-[0.82]"
                        onPress={onDelete}
                        testID={`your-edits-row-${node.id}-delete-button`}
                    >
                        <Icon
                            color={dafSemanticColors.danger}
                            name="trash"
                            size={17}
                        />
                        <Text className="text-[13px] font-semibold text-daf-alert">
                            Delete
                        </Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}

function YourEditsChangesetCard({
    onDeleteNode,
    onEditNode,
    onToggleMenu,
    openMenuKey,
    section,
    theme,
}) {
    return (
        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark mb-4 overflow-hidden rounded-dafMd border border-daf-border bg-white">
            <View className="flex-row items-center justify-between gap-2.5 bg-daf-surface-alt px-3.5 py-2.5 dark:bg-daf-surface-inverse">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    <View
                        className={`h-1.5 w-1.5 flex-none rounded-dafPill ${
                            section.isFresh
                                ? 'bg-daf-text-brand dark:bg-daf-brand'
                                : 'dark:bg-daf-border-dark bg-daf-border-strong'
                        }`}
                    />
                    <Text
                        className="text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-secondary dark:text-neutral-300"
                        numberOfLines={1}
                    >
                        {section.title}
                    </Text>
                </View>
                <Text
                    className="font-dafMono flex-none text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {section.idLabel}
                </Text>
            </View>

            {section.nodes.map((node) => {
                const menuKey = `${section.id}-${node.id}`;

                return (
                    <YourEditsNodeRow
                        isMenuOpen={openMenuKey === menuKey}
                        key={menuKey}
                        node={node}
                        onDelete={() => onDeleteNode(node.id)}
                        onEdit={() => onEditNode(node.id)}
                        onToggleMenu={() => onToggleMenu(menuKey)}
                        theme={theme}
                    />
                );
            })}
        </View>
    );
}

function YourEditsEmptyState() {
    return (
        <View className="items-center px-6 py-12">
            <Text className="max-w-[280px] text-center text-[13px] leading-[19px] text-daf-text-secondary dark:text-neutral-300">
                No edits yet — cameras you add or update will show up here.
            </Text>
        </View>
    );
}

function YourEditsErrorState({ message, onRetry }) {
    return (
        <View className="py-8">
            <Text className="text-center text-[15px] font-semibold text-daf-text-primary dark:text-white">
                Your edits are unavailable
            </Text>
            <Text className="mx-auto mt-1 max-w-[280px] text-center text-[13px] leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                {message}
            </Text>
            <DafButton
                className="mt-4 self-center"
                onPress={onRetry}
                variant="secondary"
            >
                Retry
            </DafButton>
        </View>
    );
}

function YourEditsFooterNote() {
    return (
        <View className="flex-row items-center gap-[7px] px-0.5 pb-2 pt-1">
            <Icon color={dafSemanticColors.speedOk} name="info" size={14} />
            <Text className="flex-1 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                Past changesets can't be rewritten — edits and removals publish
                as new ones.
            </Text>
        </View>
    );
}

export default function YourEditsScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { isAuthenticated, openStreetMapAccessToken, user } = useAuth();
    const [errorMessage, setErrorMessage] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [model, setModel] = useState(null);
    const [openMenuKey, setOpenMenuKey] = useState(null);
    const [reloadToken, setReloadToken] = useState(0);
    const isDarkMode = colorScheme === 'dark';
    const theme = getDafTheme(colorScheme);
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);
    const scrollPaddingBottom = Math.max(insets.bottom + 28, 28);
    const userName = user?.name ?? 'you';

    const loadYourEdits = useCallback(
        async ({ signal } = {}) => {
            const changesets = await fetchUserChangesets({
                accessToken: openStreetMapAccessToken,
                limit: 10,
                signal,
                uid: user?.id,
            });
            const nodeGroups = await Promise.all(
                changesets.map((changeset) =>
                    fetchChangesetNodes({
                        changesetId: changeset.id,
                        signal,
                    }).catch((error) => {
                        if (error?.name === 'AbortError') {
                            throw error;
                        }

                        // Still-open or partially uploaded changesets can fail
                        // to download; degrade them to empty instead of
                        // failing the whole screen.
                        return { created: [], deleted: [], modified: [] };
                    }),
                ),
            );
            const changesetNodesById = {};

            changesets.forEach((changeset, index) => {
                changesetNodesById[changeset.id] = nodeGroups[index];
            });

            const nodeIds = collectSurveillanceNodeIds({
                changesets,
                changesetNodesById,
            });
            const currentNodes =
                nodeIds.length > 0
                    ? await fetchNodesByIds({ nodeIds, signal })
                    : [];
            const currentNodesById = {};

            for (const node of currentNodes) {
                currentNodesById[node.id] = node;
            }

            return buildYourEditsModel({
                changesets,
                changesetNodesById,
                currentNodesById,
                currentUser: user,
                now: Date.now(),
            });
        },
        [openStreetMapAccessToken, user],
    );

    useFocusEffect(
        useCallback(() => {
            if (!isAuthenticated) {
                router.replace('/');
                return undefined;
            }

            const controller = new AbortController();
            let isActive = true;

            loadYourEdits({ signal: controller.signal })
                .then((nextModel) => {
                    if (!isActive) {
                        return;
                    }

                    setModel(nextModel);
                    setErrorMessage('');
                    setOpenMenuKey(null);
                })
                .catch((error) => {
                    if (!isActive || error?.name === 'AbortError') {
                        return;
                    }

                    setErrorMessage(
                        error?.message || 'Your edits could not be loaded.',
                    );
                })
                .finally(() => {
                    if (isActive) {
                        setIsRefreshing(false);
                    }
                });

            return () => {
                isActive = false;
                controller.abort();
            };
        }, [isAuthenticated, loadYourEdits, reloadToken]),
    );

    const handleBackPress = useCallback(() => {
        router.back();
    }, []);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        setReloadToken((token) => token + 1);
    }, []);

    const handleRetry = useCallback(() => {
        setErrorMessage('');
        setReloadToken((token) => token + 1);
    }, []);

    const handleToggleMenu = useCallback((menuKey) => {
        setOpenMenuKey((currentKey) =>
            currentKey === menuKey ? null : menuKey,
        );
    }, []);

    const handleEditNode = useCallback((nodeId) => {
        setOpenMenuKey(null);
        router.push({
            pathname: '/edits/[nodeId]',
            params: { nodeId: String(nodeId) },
        });
    }, []);

    const handleDeleteNode = useCallback((nodeId) => {
        setOpenMenuKey(null);
        router.push({
            pathname: '/edits/[nodeId]',
            params: { action: 'remove', nodeId: String(nodeId) },
        });
    }, []);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="your-edits-screen"
        >
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-1.5 border-b border-daf-border bg-white px-3 pb-3"
                style={{ paddingTop: headerPaddingTop }}
            >
                <Pressable
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                    className="h-[50px] w-[50px] items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                    hitSlop={6}
                    onPress={handleBackPress}
                    testID="your-edits-back-button"
                >
                    <Icon
                        color={isDarkMode ? '#F4F7FA' : '#0B0E12'}
                        name="chevron-left"
                        size={20}
                    />
                </Pressable>
                <Text
                    className="font-dafDisplay min-w-0 flex-1 text-lg font-bold leading-6 text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    Your edits
                </Text>
                {model ? (
                    <View
                        className="dark:border-daf-border-dark h-[26px] items-center justify-center rounded-dafPill border border-daf-border bg-daf-surface-alt px-[9px] dark:bg-daf-surface-inverse"
                        testID="your-edits-live-pill"
                    >
                        <Text
                            className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-secondary dark:text-neutral-300"
                            numberOfLines={1}
                        >
                            {model.livePillLabel}
                        </Text>
                    </View>
                ) : null}
            </View>

            <View className="dark:border-daf-border-dark flex-row items-center gap-2 border-b border-daf-border bg-daf-surface-alt px-4 py-[9px] dark:bg-daf-surface-inverse">
                <Text
                    className="font-dafMono min-w-0 flex-shrink text-[11px] font-semibold tracking-[0.04em] text-daf-text-brand dark:text-daf-brand"
                    numberOfLines={1}
                >
                    @{userName}
                </Text>
                <Text
                    className="font-dafMono ml-auto text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {model ? model.countsLabel : ''}
                </Text>
            </View>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}
                refreshControl={
                    <RefreshControl
                        colors={[dafSemanticColors.brand]}
                        onRefresh={handleRefresh}
                        refreshing={isRefreshing}
                        tintColor={dafSemanticColors.brand}
                    />
                }
            >
                <View className="px-4 pt-3.5">
                    {model == null && !errorMessage ? (
                        <View className="items-center py-10">
                            <ActivityIndicator
                                color={
                                    isDarkMode
                                        ? dafSemanticColors.brandHover
                                        : dafSemanticColors.brand
                                }
                            />
                        </View>
                    ) : errorMessage ? (
                        <YourEditsErrorState
                            message={errorMessage}
                            onRetry={handleRetry}
                        />
                    ) : model.sections.length === 0 ? (
                        <YourEditsEmptyState />
                    ) : (
                        <>
                            <Text className="mb-4 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                Tap a camera to edit it, or open its ⋯ menu for
                                actions.
                            </Text>
                            {model.sections.map((section) => (
                                <YourEditsChangesetCard
                                    key={section.id}
                                    onDeleteNode={handleDeleteNode}
                                    onEditNode={handleEditNode}
                                    onToggleMenu={handleToggleMenu}
                                    openMenuKey={openMenuKey}
                                    section={section}
                                    theme={theme}
                                />
                            ))}
                            <YourEditsFooterNote />
                        </>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
