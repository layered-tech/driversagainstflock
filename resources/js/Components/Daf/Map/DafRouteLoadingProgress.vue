<template>
    <section
        class="overflow-hidden rounded-dafMd border border-daf-border-glass bg-daf-surface-alt"
        role="status"
        aria-atomic="true"
        aria-live="polite"
    >
        <div class="flex items-start gap-3 px-4 py-3.5">
            <span
                class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-daf-surface-card text-daf-text-brand shadow-dafCard"
                aria-hidden="true"
            >
                <span
                    class="size-5 animate-spin rounded-full border-2 border-daf-border-strong border-t-daf-brand motion-reduce:animate-none"
                />
            </span>

            <span class="min-w-0 flex-1">
                <span
                    class="block font-display text-daf-body font-semibold text-daf-text-primary"
                >
                    {{ title }}
                </span>
                <span
                    class="mt-0.5 block text-daf-body-sm text-daf-text-secondary"
                >
                    {{ activeStage.description }}
                </span>
                <span
                    class="mt-1.5 block font-mono text-daf-label uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                    aria-hidden="true"
                >
                    Estimated step · {{ elapsedLabel }}
                </span>
            </span>
        </div>

        <div
            class="h-1 overflow-hidden bg-daf-border-glass"
            role="progressbar"
            aria-label="Route search in progress"
        >
            <div
                class="h-full w-2/5 animate-pulse rounded-dafPill bg-daf-brand motion-reduce:animate-none"
            />
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    elapsedSeconds: {
        type: Number,
        default: 0,
    },
    refreshing: {
        type: Boolean,
        default: false,
    },
});

const stages = [
    {
        afterSeconds: 0,
        description: 'Calculating the direct route first.',
    },
    {
        afterSeconds: 5,
        description: 'Checking the route against known cameras.',
    },
    {
        afterSeconds: 15,
        description: 'Comparing camera-avoiding alternatives.',
    },
    {
        afterSeconds: 30,
        description: 'Still refining this long route. This can take a while.',
    },
];

const title = computed(() =>
    props.refreshing
        ? 'Updating your private route'
        : 'Finding a private route',
);

const activeStage = computed(
    () =>
        stages.findLast(
            (stage) => props.elapsedSeconds >= stage.afterSeconds,
        ) ?? stages[0],
);

const elapsedLabel = computed(() => {
    if (props.elapsedSeconds < 1) {
        return 'just started';
    }

    return `${props.elapsedSeconds}s elapsed`;
});
</script>
