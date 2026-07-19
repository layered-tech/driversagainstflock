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
