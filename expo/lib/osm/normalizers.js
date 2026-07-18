export function normalizeOsmJsonChangeset(changeset) {
    return {
        changesCount: changeset?.changes_count ?? 0,
        closedAt: changeset?.closed_at ?? null,
        createdAt: changeset?.created_at ?? '',
        id: changeset?.id ?? null,
        open: changeset?.open === true,
        tags: changeset?.tags ?? {},
    };
}

export function normalizeOsmJsonNode(element) {
    return {
        id: element?.id ?? null,
        latitude: element?.lat ?? null,
        longitude: element?.lon ?? null,
        tags: element?.tags ?? {},
        timestamp: element?.timestamp ?? null,
        uid: element?.uid ?? null,
        user: element?.user ?? null,
        version: element?.version ?? null,
        visible: element?.visible !== false,
    };
}
