export function resolveNativeNavigationActions(actions) {
    const ordered = [...actions].sort(
        (left, right) => right.priority - left.priority,
    );
    const priority = ordered[0]?.priority;
    const layer = ordered.filter((action) => action.priority === priority);
    const navigation = ['back', 'close']
        .map((kind) => layer.filter((action) => action.kind === kind).at(-1))
        .filter(Boolean);
    return [
        ...navigation,
        ...layer
            .filter((action) => action.kind === 'tool')
            .sort((left, right) => {
                const groups = { navigation: 0, activity: 1, map: 2 };
                const groupOrder =
                    (groups[left.group] ?? 1) - (groups[right.group] ?? 1);
                return groupOrder || (left.order ?? 0) - (right.order ?? 0);
            }),
    ];
}

export function createNativeNavigationActions() {
    const actions = new Map();
    const listeners = new Set();
    let current = [];
    let overlayHosts = 0;

    const publish = () => {
        current = resolveNativeNavigationActions(actions.values());
        listeners.forEach((listener) => listener());
    };

    return {
        getSnapshot: () => current,
        getOverlayHostCount: () => overlayHosts,
        acquireOverlayHost() {
            overlayHosts++;
            listeners.forEach((listener) => listener());
            return () => {
                overlayHosts--;
                listeners.forEach((listener) => listener());
            };
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        register(id, action) {
            actions.set(id, action);
            publish();
            return () => {
                actions.delete(id);
                publish();
            };
        },
    };
}

export function getNativeNavigationHeader(actions, tintColor) {
    const items = actions.map((action) => ({
        type: 'button',
        title: action.label,
        accessibilityLabel: action.label,
        identifier: `${action.group === 'map' ? 'daf-map-toolbar:' : action.overflowOnly ? 'daf-map-overflow:' : ''}${action.testID ?? `navigation-${action.kind}`}`,
        icon: action.icon ?? {
            type: 'sfSymbol',
            name:
                action.symbol ??
                (action.kind === 'close' ? 'xmark' : 'chevron.left'),
        },
        disabled: Boolean(action.disabled),
        badge:
            action.badge == null ? undefined : { value: String(action.badge) },
        sharesBackground: action.sharesBackground ?? false,
        width: 44,
        visibilityPriority: action.visibilityPriority ?? 'high',
        tintColor: action.tintColor ?? tintColor,
        onPress: action.onPress,
    }));

    return {
        hidden: items.length === 0,
        title: '',
        backgroundColor: 'transparent',
        translucent: true,
        hideShadow: true,
        hideBackButton: true,
        headerLeftBarButtonItems: items.filter(
            (_, index) =>
                actions[index].kind === 'back' ||
                actions[index].group === 'navigation',
        ),
        headerRightBarButtonItems: items.filter(
            (_, index) =>
                actions[index].kind !== 'back' &&
                actions[index].group !== 'navigation',
        ),
    };
}
