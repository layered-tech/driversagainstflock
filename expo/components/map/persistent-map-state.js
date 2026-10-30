// Inactive routes may keep rendering while the navigator transitions. Only the
// focused owner can replace the native map's content; releasing it retains the
// last frame until the next owner is ready.
export function createPersistentMapState() {
    let snapshot = null;
    let styleURL;
    const listeners = new Set();
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        publish(owner, content) {
            if (!styleURL || content.base)
                styleURL = content.props?.styleURL ?? styleURL;
            snapshot = {
                owner,
                ...content,
                props: {
                    ...content.props,
                    styleURL,
                    zoomEnabled: content.props?.zoomEnabled ?? true,
                    preferredFramesPerSecond:
                        content.props?.preferredFramesPerSecond ?? 60,
                    projection: content.props?.projection ?? 'mercator',
                    logoPosition: content.props?.logoPosition ?? {
                        left: 8,
                        bottom: 8,
                    },
                    attributionPosition: content.props?.attributionPosition ?? {
                        left: 96,
                        bottom: 8,
                    },
                    compassPosition: content.props?.compassPosition ?? {
                        right: 8,
                        top: 8,
                    },
                },
            };
            listeners.forEach((listener) => listener());
        },
        release(owner) {
            if (snapshot?.owner !== owner) return;
            snapshot = { ...snapshot, owner: null };
        },
    };
}

export function createPersistentSceneState() {
    let snapshot = [];
    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener());
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        publish(id, scene) {
            snapshot = [
                ...snapshot.filter((item) => item.id !== id),
                { id, ...scene },
            ];
            notify();
        },
        release(id) {
            snapshot = snapshot.filter((item) => item.id !== id);
            notify();
        },
    };
}
