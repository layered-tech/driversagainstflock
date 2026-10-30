import { DuoText as Text } from '../design-system/duo-typography';
import { Pressable, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';

export function EditingCameraDetails({
    node,
    currentUser,
    onEdit,
    onDelete,
    onClose,
}) {
    if (!node)
        return (
            <Text className="text-[13px] text-daf-text-secondary dark:text-neutral-300">
                Camera details are unavailable in the map data.
            </Text>
        );
    const tags = node.tags ?? {};
    const currentMapperId = Number(
        currentUser?.openStreetMapId ?? currentUser?.id,
    );
    const isCurrentMapper = Number.isFinite(currentMapperId)
        ? Number(node.uid) === currentMapperId
        : Boolean(currentUser?.name && node.user === currentUser.name);
    const date = node.timestamp
        ? new Date(node.timestamp).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          })
        : null;
    return (
        <View className="gap-4" testID="editing-camera-details">
            <View className="flex-row items-start gap-2">
                <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                        {tags['surveillance:type'] === 'ALPR'
                            ? 'ALPR reader'
                            : 'Camera'}
                        {tags.manufacturer ? ` · ${tags.manufacturer}` : ''}
                    </Text>
                    <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                        node/{node.id} · v{node.version}
                    </Text>
                </View>
                {onClose ? (
                    <Pressable
                        accessibilityLabel="Close marker details"
                        accessibilityRole="button"
                        className="h-10 w-10 items-center justify-center rounded-dafPill bg-daf-surface-alt active:opacity-70 dark:bg-daf-surface-inverse"
                        onPress={onClose}
                        testID="marker-details-close-button"
                    >
                        <Icon name="x" size={20} color="#697583" />
                    </Pressable>
                ) : null}
            </View>
            <View className="rounded-dafSm border border-daf-border bg-daf-surface-alt p-3 dark:border-daf-border-dark dark:bg-daf-surface-inverse">
                {Object.entries(tags).map(([key, value]) => (
                    <View
                        className="flex-row justify-between gap-3 py-0.5"
                        key={key}
                    >
                        <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                            {key}
                        </Text>
                        <Text className="flex-1 text-right font-dafMono text-[11px] text-daf-text-primary dark:text-white">
                            {value}
                        </Text>
                    </View>
                ))}
            </View>
            {node.user ? (
                <View className="flex-row gap-2 rounded-dafSm bg-daf-surface-alt p-3 dark:bg-daf-surface-inverse">
                    <Icon name="info" size={15} color="#697583" />
                    <Text className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                        Last edited by{' '}
                        {isCurrentMapper ? 'you' : `@${node.user}`}
                        {date ? ` · ${date}` : ''} — your edit publishes v
                        {node.version + 1}
                        {!isCurrentMapper ? ' over theirs' : ''}.
                    </Text>
                </View>
            ) : null}
            <View className="flex-row gap-2">
                <DafButton
                    className="flex-1"
                    icon="pencil"
                    variant="secondary"
                    onPress={onEdit}
                    disabled={node.visible === false}
                    testID="marker-details-edit-node-button"
                >
                    Edit tags
                </DafButton>
                <DafButton
                    className="flex-1"
                    icon="trash"
                    onPress={onDelete}
                    variant="danger"
                    disabled={node.visible === false}
                    testID="marker-details-delete-node-button"
                >
                    Delete
                </DafButton>
            </View>
        </View>
    );
}
