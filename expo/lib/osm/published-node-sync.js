export function getUploadedNodeIndex(diffNode, fallbackIndex = null) {
    const oldId = Number(diffNode?.oldId);

    if (Number.isInteger(oldId) && oldId < 0) {
        return Math.abs(oldId) - 1;
    }

    return Number.isInteger(fallbackIndex) && fallbackIndex >= 0
        ? fallbackIndex
        : null;
}

export function buildPublishedNodeSyncPayload({
    changesetId,
    diffNodes,
    sourceNodes,
} = {}) {
    const normalizedChangesetId = Number(changesetId);
    const uploadedNodes = Array.isArray(diffNodes) ? diffNodes : [];
    const originalNodes = Array.isArray(sourceNodes) ? sourceNodes : [];
    const seenNodeIds = new Set();
    const nodes = [];

    uploadedNodes.forEach((diffNode, fallbackIndex) => {
        const sourceIndex = getUploadedNodeIndex(diffNode, fallbackIndex);
        const sourceNode =
            sourceIndex === null ? null : originalNodes[sourceIndex];
        const nodeId = Number(diffNode?.newId);
        const version = Number(diffNode?.newVersion);

        if (
            !sourceNode ||
            sourceNode?.tags?.['surveillance:type'] !== 'ALPR' ||
            !Number.isInteger(nodeId) ||
            nodeId <= 0 ||
            !Number.isInteger(version) ||
            version <= 0 ||
            seenNodeIds.has(nodeId)
        ) {
            return;
        }

        seenNodeIds.add(nodeId);
        nodes.push({ id: nodeId, version });
    });

    return {
        changeset_id: normalizedChangesetId,
        nodes,
    };
}
