const pendingCarPlaySearchMapPreparations = new WeakMap();

export function prepareCarPlaySearchMap({
    hybridAutoPlay,
    mapTemplate,
    isCurrent,
}) {
    const pending = pendingCarPlaySearchMapPreparations.get(mapTemplate);
    if (pending) {
        return pending;
    }

    const preparation = Promise.resolve()
        .then(() => {
            if (!isCurrent()) {
                return;
            }

            return hybridAutoPlay.popToRootTemplate(false);
        })
        .catch((error) => {
            const message = String(error?.message ?? '');
            if (
                !/\bDomain=CarPlayErrorDomain\s+Code=-1\b/.test(message) ||
                !message.includes('No templates were available to be popped.')
            ) {
                throw error;
            }

            if (!isCurrent()) {
                return;
            }

            // CarPlay is already at root, but Auto Play may still track a
            // removed search screen. Reset both stacks to the existing map.
            return mapTemplate.setRootTemplate();
        })
        .finally(() => {
            pendingCarPlaySearchMapPreparations.delete(mapTemplate);
        });

    pendingCarPlaySearchMapPreparations.set(mapTemplate, preparation);
    return preparation;
}

export function createAutoPlaySearchTemplateLifecycle() {
    const resultTemplatePresentations = [];

    return {
        trackResultTemplatePresentation(presentation) {
            if (presentation?.pushPromise) {
                resultTemplatePresentations.push(presentation);
            }

            return presentation;
        },
        async waitForResultTemplatePushes() {
            let awaitedCount = 0;

            // A result template can be registered while an earlier native
            // push is still settling. Drain every registered batch before a
            // follow-up voice request removes the owning SearchTemplate.
            while (awaitedCount < resultTemplatePresentations.length) {
                const pendingPresentations =
                    resultTemplatePresentations.slice(awaitedCount);
                awaitedCount = resultTemplatePresentations.length;

                await Promise.all(
                    pendingPresentations.map((presentation) =>
                        Promise.resolve(presentation.pushPromise).catch(
                            () => false,
                        ),
                    ),
                );
            }
        },
    };
}
