function getHotlistNodeKey(node) {
    return String(node?.osmId ?? node?.id ?? '');
}

export function mergeHotlistPages(currentPayload, nextPayload) {
    if (!currentPayload) {
        return nextPayload;
    }

    const currentNodes = currentPayload.nodes?.data ?? [];
    const seenNodeKeys = new Set(currentNodes.map(getHotlistNodeKey));
    const appendedNodes = (nextPayload?.nodes?.data ?? []).filter((node) => {
        const nodeKey = getHotlistNodeKey(node);

        if (!nodeKey || seenNodeKeys.has(nodeKey)) {
            return false;
        }

        seenNodeKeys.add(nodeKey);

        return true;
    });

    return {
        ...nextPayload,
        nodes: {
            ...nextPayload.nodes,
            data: [...currentNodes, ...appendedNodes],
        },
    };
}

export function getNextHotlistPage(payload) {
    const currentPage = Number(payload?.nodes?.currentPage ?? 0);
    const lastPage = Number(payload?.nodes?.lastPage ?? 0);

    if (
        !Number.isInteger(currentPage) ||
        !Number.isInteger(lastPage) ||
        currentPage < 1 ||
        currentPage >= lastPage
    ) {
        return null;
    }

    return currentPage + 1;
}
